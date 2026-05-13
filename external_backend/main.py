import json
from datetime import datetime
from typing import Optional

import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import create_session_token, get_user_from_token, hash_password, verify_password
from config import settings
from database import DEFAULT_GROUP_NAME, get_connection, initialize_database


STORED_STATUSES = {"requested", "planned", "approved", "rejected", "cancelled"}
DISPLAY_COMPLETED_STATUS = "completed"
BLOCKING_STATUSES = {"planned", "approved"}
GUEST_VISIBLE_STATUSES = {"requested", "planned", "approved", DISPLAY_COMPLETED_STATUS}
MEMBER_VISIBLE_STATUSES = {"requested", "planned", "approved", DISPLAY_COMPLETED_STATUS}
MODIFIABLE_STATUSES = {"requested", "planned", "approved"}
DEFAULT_BOOKING_TITLE = "Untitled booking"


app = FastAPI(title=settings.app_title)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


class BookingCreateRequest(BaseModel):
    area_id: Optional[int] = None
    area_ids: Optional[list[int]] = None
    start_time: str
    end_time: str
    status: str
    title: Optional[str] = ""
    description: Optional[str] = ""
    note: Optional[str] = ""
    owner_group_id: Optional[int] = None


class BookingUpdateRequest(BaseModel):
    area_id: Optional[int] = None
    area_ids: Optional[list[int]] = None
    start_time: str
    end_time: str
    title: Optional[str] = ""
    description: Optional[str] = ""
    note: Optional[str] = ""


class AreaCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class AreaUpdateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class GroupCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    can_approve: bool = False
    approval_required: bool = False


class GroupUpdateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    can_approve: bool = False
    approval_required: bool = False


class AdminUserCreateRequest(BaseModel):
    username: str
    password: str
    role: str
    group_id: Optional[int] = None


class AdminUserUpdateRequest(BaseModel):
    role: str
    group_id: Optional[int] = None


class AdminUserPasswordResetRequest(BaseModel):
    new_password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@app.on_event("startup")
def startup_event() -> None:
    initialize_database()


@app.post("/login")
def login(payload: LoginRequest):
    username = payload.username.strip()
    user_row = fetch_user_auth_by_username(username)

    if not user_row or not verify_password(payload.password, user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_session_token(user_row)

    return {
        "access_token": token,
        "user": serialize_user_session(user_row),
    }


@app.get("/me")
def get_me(authorization: Optional[str] = Header(default=None)):
    return require_current_user(authorization)


@app.get("/areas")
def get_areas():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, description FROM areas ORDER BY name"
        ).fetchall()

    return [serialize_area_row(row) for row in rows]


@app.post("/areas")
def create_area(payload: AreaCreateRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    area_name = payload.name.strip()
    description = (payload.description or "").strip()

    validate_area_values(area_name, description)

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO areas (name, description) VALUES (?, ?)",
                (area_name, description),
            )
            area_id = cursor.lastrowid
            write_audit_log(
                connection,
                current_user["id"],
                "area_created",
                "area",
                area_id,
                {"name": area_name},
            )
            connection.commit()
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=400, detail="An area with this name already exists.") from error
        raise

    return fetch_area_by_id(area_id)


@app.patch("/areas/{area_id}")
def update_area(area_id: int, payload: AreaUpdateRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    fetch_area_by_id(area_id)
    area_name = payload.name.strip()
    description = (payload.description or "").strip()

    validate_area_values(area_name, description)

    try:
        with get_connection() as connection:
            connection.execute(
                "UPDATE areas SET name = ?, description = ? WHERE id = ?",
                (area_name, description, area_id),
            )
            write_audit_log(
                connection,
                current_user["id"],
                "area_updated",
                "area",
                area_id,
                {"name": area_name},
            )
            connection.commit()
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=400, detail="An area with this name already exists.") from error
        raise

    return fetch_area_by_id(area_id)


@app.delete("/areas/{area_id}")
def delete_area(area_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    fetch_area_by_id(area_id)

    with get_connection() as connection:
        if has_blocking_area_bookings(connection, area_id):
            raise HTTPException(
                status_code=400,
                detail="This area still has active or upcoming bookings and cannot be deleted.",
            )

        remove_area_from_existing_bookings(connection, area_id)
        connection.execute("DELETE FROM areas WHERE id = ?", (area_id,))
        write_audit_log(
            connection,
            current_user["id"],
            "area_deleted",
            "area",
            area_id,
            {},
        )
        connection.commit()

    return {"success": True}


@app.get("/admin/groups")
def get_admin_groups(authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, can_approve, approval_required
            FROM groups
            ORDER BY name
            """
        ).fetchall()

    return [serialize_group_row(row) for row in rows]


@app.post("/admin/groups")
def create_admin_group(payload: GroupCreateRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    name, description, can_approve, approval_required = normalize_group_payload(payload)

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO groups (name, description, can_approve, approval_required)
                VALUES (?, ?, ?, ?)
                """,
                (name, description, int(can_approve), int(approval_required)),
            )
            group_id = cursor.lastrowid
            write_audit_log(
                connection,
                current_user["id"],
                "group_created",
                "group",
                group_id,
                {"name": name},
            )
            connection.commit()
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=400, detail="A group with this name already exists.") from error
        raise

    return fetch_group_by_id(group_id)


@app.patch("/admin/groups/{group_id}")
def update_admin_group(
    group_id: int,
    payload: GroupUpdateRequest,
    authorization: Optional[str] = Header(default=None),
):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    existing_group = fetch_group_by_id(group_id)
    name, description, can_approve, approval_required = normalize_group_payload(payload)

    try:
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE groups
                SET name = ?, description = ?, can_approve = ?, approval_required = ?
                WHERE id = ?
                """,
                (name, description, int(can_approve), int(approval_required), group_id),
            )
            write_audit_log(
                connection,
                current_user["id"],
                "group_updated",
                "group",
                group_id,
                {"old_name": existing_group["name"], "name": name},
            )
            connection.commit()
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=400, detail="A group with this name already exists.") from error
        raise

    return fetch_group_by_id(group_id)


@app.delete("/admin/groups/{group_id}")
def delete_admin_group(group_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    group_row = fetch_group_by_id(group_id)

    if group_row["name"] == DEFAULT_GROUP_NAME:
        raise HTTPException(status_code=400, detail="The default legacy group cannot be deleted.")

    with get_connection() as connection:
        user_count = connection.execute(
            "SELECT COUNT(*) FROM users WHERE group_id = ?",
            (group_id,),
        ).fetchone()[0]
        booking_count = connection.execute(
            "SELECT COUNT(*) FROM bookings WHERE owner_group_id = ?",
            (group_id,),
        ).fetchone()[0]
        approval_count = connection.execute(
            "SELECT COUNT(*) FROM booking_approvals WHERE approver_group_id = ?",
            (group_id,),
        ).fetchone()[0]

        if user_count or booking_count or approval_count:
            raise HTTPException(
                status_code=400,
                detail="This group is still referenced by users, bookings, or approvals and cannot be deleted.",
            )

        connection.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        write_audit_log(
            connection,
            current_user["id"],
            "group_deleted",
            "group",
            group_id,
            {"name": group_row["name"]},
        )
        connection.commit()

    return {"success": True}


@app.get("/admin/users")
def get_admin_users(authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                users.id,
                users.username,
                users.role,
                users.group_id,
                groups.name AS group_name
            FROM users
            LEFT JOIN groups ON groups.id = users.group_id
            ORDER BY users.username
            """
        ).fetchall()

    return [serialize_public_user_row(row) for row in rows]


@app.post("/admin/users")
def create_admin_user(payload: AdminUserCreateRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    username = payload.username.strip()
    password = payload.password
    role = payload.role.strip().lower()
    group_id = normalize_user_group(role, payload.group_id)

    validate_user_values(username, password, role, group_id)

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (username, password_hash, role, group_id)
                VALUES (?, ?, ?, ?)
                """,
                (username, hash_password(password), role, group_id),
            )
            user_id = cursor.lastrowid
            write_audit_log(
                connection,
                current_user["id"],
                "user_created",
                "user",
                user_id,
                {"username": username, "role": role, "group_id": group_id},
            )
            connection.commit()
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=400, detail="This username already exists.") from error
        raise

    return fetch_user_public_by_id(user_id)


@app.patch("/admin/users/{user_id}")
def update_admin_user(
    user_id: int,
    payload: AdminUserUpdateRequest,
    authorization: Optional[str] = Header(default=None),
):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    user_row = fetch_user_by_id(user_id)
    role = payload.role.strip().lower()
    group_id = normalize_user_group(role, payload.group_id)

    validate_user_role_and_group(role, group_id)

    if current_user["id"] == user_id and role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove admin access from your current account here.")

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET role = ?, group_id = ?
            WHERE id = ?
            """,
            (role, group_id, user_id),
        )
        write_audit_log(
            connection,
            current_user["id"],
            "user_updated",
            "user",
            user_id,
            {
                "username": user_row["username"],
                "role": role,
                "group_id": group_id,
            },
        )
        connection.commit()

    return fetch_user_public_by_id(user_id)


@app.patch("/admin/users/{user_id}/password")
def reset_admin_user_password(
    user_id: int,
    payload: AdminUserPasswordResetRequest,
    authorization: Optional[str] = Header(default=None),
):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)
    fetch_user_by_id(user_id)

    validate_new_password(payload.new_password)

    with get_connection() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.new_password), user_id),
        )
        write_audit_log(
            connection,
            current_user["id"],
            "user_password_reset",
            "user",
            user_id,
            {},
        )
        connection.commit()

    return {"success": True}


@app.delete("/admin/users/{user_id}")
def delete_admin_user(user_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    if current_user["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

    fetch_user_by_id(user_id)

    with get_connection() as connection:
        connection.execute("DELETE FROM booking_approvals WHERE approver_user_id = ?", (user_id,))
        connection.execute("DELETE FROM bookings WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        write_audit_log(
            connection,
            current_user["id"],
            "user_deleted",
            "user",
            user_id,
            {},
        )
        connection.commit()

    return {"success": True}


@app.patch("/me/password")
def change_my_password(payload: PasswordChangeRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    user_row = fetch_user_by_id(current_user["id"])

    if not verify_password(payload.current_password, user_row["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    validate_new_password(payload.new_password)

    with get_connection() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.new_password), current_user["id"]),
        )
        connection.commit()

    return {"success": True}


@app.get("/bookings")
def get_bookings(authorization: Optional[str] = Header(default=None)):
    current_user = get_optional_current_user(authorization)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                bookings.id,
                bookings.area_id,
                bookings.user_id,
                bookings.owner_group_id,
                bookings.start_time,
                bookings.end_time,
                bookings.status,
                bookings.title,
                bookings.description,
                bookings.note,
                bookings.created_at,
                bookings.updated_at,
                areas.name AS area_name,
                users.username AS requested_by,
                groups.name AS owner_group_name
            FROM bookings
            JOIN areas ON areas.id = bookings.area_id
            JOIN users ON users.id = bookings.user_id
            JOIN groups ON groups.id = bookings.owner_group_id
            ORDER BY bookings.start_time, bookings.id
            """
        ).fetchall()

        visible_rows = []
        for row in rows:
            if can_view_booking(current_user, row):
                visible_rows.append(booking_row_to_dict(connection, row, current_user))

    return visible_rows


@app.get("/bookings/{booking_id}/history")
def get_booking_history(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)

        if not can_view_booking(current_user, booking_row):
            raise HTTPException(status_code=403, detail="You do not have access to this booking history.")

        return {
            "booking_id": booking_id,
            "approval_chain": build_booking_approval_chain(connection, booking_row),
            "audit_entries": fetch_booking_audit_entries(connection, booking_id),
        }


@app.post("/bookings")
def create_booking(payload: BookingCreateRequest, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)

    start_time = parse_datetime_value(payload.start_time)
    end_time = parse_datetime_value(payload.end_time)
    status = (payload.status or "").strip().lower()
    area_ids = normalize_booking_area_ids(payload.area_id, payload.area_ids)
    title = normalize_optional_text(payload.title, 120)
    description = normalize_optional_text(payload.description, 500)
    note = normalize_optional_text(payload.note, 200)

    if status not in {"requested", "planned"}:
        raise HTTPException(status_code=400, detail="New bookings must start as requested or planned.")

    ensure_area_ids_exist(area_ids)

    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    owner_group_id = determine_booking_owner_group_id(current_user, payload.owner_group_id)
    now_text = current_timestamp()

    with get_connection() as connection:
        if status == "planned":
            ensure_booking_area_selection_has_no_blocking_overlap(
                connection,
                area_ids=area_ids,
                start_time_value=format_datetime_value(start_time),
                end_time_value=format_datetime_value(end_time),
            )

        cursor = connection.execute(
            """
            INSERT INTO bookings (
                area_id,
                user_id,
                owner_group_id,
                start_time,
                end_time,
                status,
                title,
                description,
                note,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                area_ids[0],
                current_user["id"],
                owner_group_id,
                format_datetime_value(start_time),
                format_datetime_value(end_time),
                status,
                title,
                description,
                note,
                now_text,
                now_text,
            ),
        )
        booking_id = cursor.lastrowid
        replace_booking_area_links(connection, booking_id, area_ids)
        write_audit_log(
            connection,
            current_user["id"],
            "booking_created",
            "booking",
            booking_id,
            {"status": status, "owner_group_id": owner_group_id, "area_ids": area_ids},
        )
        connection.commit()
        booking_row = fetch_booking_by_id(connection, booking_id)

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.patch("/bookings/{booking_id}")
def update_booking(
    booking_id: int,
    payload: BookingUpdateRequest,
    authorization: Optional[str] = Header(default=None),
):
    current_user = require_current_user(authorization)

    start_time = parse_datetime_value(payload.start_time)
    end_time = parse_datetime_value(payload.end_time)
    title = normalize_optional_text(payload.title, 120)
    description = normalize_optional_text(payload.description, 500)
    note = normalize_optional_text(payload.note, 200)

    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)
        display_status = get_booking_display_status(booking_row)
        ensure_booking_can_be_modified(current_user, booking_row, display_status)

        existing_area_ids = fetch_booking_area_ids(connection, booking_id)
        if payload.area_ids is None and len(existing_area_ids) > 1:
            area_ids = existing_area_ids
        else:
            area_ids = normalize_booking_area_ids(payload.area_id, payload.area_ids)

        ensure_area_ids_exist(area_ids)
        area_or_time_changed = (
            existing_area_ids != area_ids
            or booking_row["start_time"] != format_datetime_value(start_time)
            or booking_row["end_time"] != format_datetime_value(end_time)
        )

        next_status = booking_row["status"]
        approvals_cleared = False

        if booking_row["status"] == "planned":
            ensure_booking_area_selection_has_no_blocking_overlap(
                connection,
                area_ids=area_ids,
                start_time_value=format_datetime_value(start_time),
                end_time_value=format_datetime_value(end_time),
                excluded_booking_id=booking_id,
            )
        elif booking_row["status"] == "requested":
            if area_or_time_changed:
                delete_booking_approvals(connection, booking_id)
                approvals_cleared = True
        elif booking_row["status"] == "approved":
            if area_or_time_changed:
                next_status = "requested"
                delete_booking_approvals(connection, booking_id)
                approvals_cleared = True
        else:
            raise HTTPException(status_code=400, detail="This booking can no longer be modified.")

        connection.execute(
            """
            UPDATE bookings
            SET area_id = ?,
                start_time = ?,
                end_time = ?,
                title = ?,
                description = ?,
                note = ?,
                status = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                area_ids[0],
                format_datetime_value(start_time),
                format_datetime_value(end_time),
                title,
                description,
                note,
                next_status,
                current_timestamp(),
                booking_id,
            ),
        )
        replace_booking_area_links(connection, booking_id, area_ids)
        write_audit_log(
            connection,
            current_user["id"],
            "booking_updated",
            "booking",
            booking_id,
            {"status": next_status, "approvals_cleared": approvals_cleared, "area_ids": area_ids},
        )
        connection.commit()

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.patch("/bookings/{booking_id}/request")
def submit_planned_booking_as_request(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)
        display_status = get_booking_display_status(booking_row)

        if booking_row["status"] != "planned" or display_status == DISPLAY_COMPLETED_STATUS:
            raise HTTPException(status_code=400, detail="Only planned bookings can be moved into requested.")

        ensure_booking_owned_by_group_or_admin(current_user, booking_row)

        connection.execute(
            "UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?",
            ("requested", current_timestamp(), booking_id),
        )
        write_audit_log(
            connection,
            current_user["id"],
            "booking_requested",
            "booking",
            booking_id,
            {},
        )
        connection.commit()

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.patch("/bookings/{booking_id}/approve")
def approve_booking(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)

        if booking_row["status"] != "requested":
            raise HTTPException(status_code=400, detail="Only requested bookings can collect approvals.")

        if current_user["role"] == "admin":
            ensure_requested_booking_can_be_approved(connection, booking_row)
            set_booking_status(connection, booking_id, "approved")
            write_audit_log(
                connection,
                current_user["id"],
                "booking_approved_admin",
                "booking",
                booking_id,
                {},
            )
            connection.commit()
            return booking_row_to_dict_from_id(booking_id, current_user)

        ensure_user_can_collect_approval(connection, current_user, booking_row)
        upsert_booking_approval(connection, booking_row["id"], current_user)

        if has_all_required_approvals(connection, booking_row) and not has_approval_blocking_overlap(connection, booking_row):
            set_booking_status(connection, booking_id, "approved")

        write_audit_log(
            connection,
            current_user["id"],
            "booking_group_approved",
            "booking",
            booking_id,
            {"approver_group_id": current_user["group_id"]},
        )
        connection.commit()

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.patch("/bookings/{booking_id}/reject")
def reject_booking(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)

        if booking_row["status"] != "requested":
            raise HTTPException(status_code=400, detail="Only requested bookings can be rejected.")

        set_booking_status(connection, booking_id, "rejected")
        write_audit_log(
            connection,
            current_user["id"],
            "booking_rejected",
            "booking",
            booking_id,
            {},
        )
        connection.commit()

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.patch("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)

    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)
        display_status = get_booking_display_status(booking_row)

        if display_status in {"rejected", "cancelled", DISPLAY_COMPLETED_STATUS}:
            raise HTTPException(status_code=400, detail="This booking can no longer be cancelled.")

        ensure_booking_owned_by_group_or_admin(current_user, booking_row)
        set_booking_status(connection, booking_id, "cancelled")
        write_audit_log(
            connection,
            current_user["id"],
            "booking_cancelled",
            "booking",
            booking_id,
            {},
        )
        connection.commit()

    return booking_row_to_dict_from_id(booking_id, current_user)


@app.delete("/bookings/{booking_id}")
def delete_booking(booking_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = require_current_user(authorization)
    ensure_admin(current_user)

    with get_connection() as connection:
        fetch_booking_by_id(connection, booking_id)
        connection.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
        write_audit_log(
            connection,
            current_user["id"],
            "booking_deleted",
            "booking",
            booking_id,
            {},
        )
        connection.commit()

    return {"success": True}


def fetch_user_auth_by_username(username: str):
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT
                users.id,
                users.username,
                users.password_hash,
                users.role,
                users.group_id,
                groups.name AS group_name,
                COALESCE(groups.can_approve, 0) AS group_can_approve,
                COALESCE(groups.approval_required, 0) AS group_approval_required
            FROM users
            LEFT JOIN groups ON groups.id = users.group_id
            WHERE users.username = ?
            """,
            (username,),
        ).fetchone()


def fetch_user_auth_by_id(user_id: int):
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT
                users.id,
                users.username,
                users.password_hash,
                users.role,
                users.group_id,
                groups.name AS group_name,
                COALESCE(groups.can_approve, 0) AS group_can_approve,
                COALESCE(groups.approval_required, 0) AS group_approval_required
            FROM users
            LEFT JOIN groups ON groups.id = users.group_id
            WHERE users.id = ?
            """,
            (user_id,),
        ).fetchone()


def fetch_user_by_id(user_id: int):
    user_row = fetch_user_auth_by_id(user_id)

    if not user_row:
        raise HTTPException(status_code=404, detail="User not found.")

    return user_row


def fetch_user_public_by_id(user_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                users.id,
                users.username,
                users.role,
                users.group_id,
                groups.name AS group_name
            FROM users
            LEFT JOIN groups ON groups.id = users.group_id
            WHERE users.id = ?
            """,
            (user_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return serialize_public_user_row(row)


def fetch_area_by_id(area_id: int):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, description FROM areas WHERE id = ?",
            (area_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Area not found.")

    return serialize_area_row(row)


def fetch_group_by_id(group_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, description, can_approve, approval_required
            FROM groups
            WHERE id = ?
            """,
            (group_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Group not found.")

    return serialize_group_row(row)


def fetch_booking_by_id(connection, booking_id: int):
    row = connection.execute(
        """
        SELECT
            bookings.id,
            bookings.area_id,
            bookings.user_id,
            bookings.owner_group_id,
            bookings.start_time,
            bookings.end_time,
            bookings.status,
            bookings.title,
            bookings.description,
            bookings.note,
            bookings.created_at,
            bookings.updated_at,
            areas.name AS area_name,
            users.username AS requested_by,
            groups.name AS owner_group_name
        FROM bookings
        JOIN areas ON areas.id = bookings.area_id
        JOIN users ON users.id = bookings.user_id
        JOIN groups ON groups.id = bookings.owner_group_id
        WHERE bookings.id = ?
        """,
        (booking_id,),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Booking not found.")

    return row


def booking_row_to_dict_from_id(booking_id: int, current_user):
    with get_connection() as connection:
        booking_row = fetch_booking_by_id(connection, booking_id)
        return booking_row_to_dict(connection, booking_row, current_user)


def fetch_booking_areas(connection, booking_id: int) -> list[dict]:
    rows = connection.execute(
        """
        SELECT areas.id, areas.name, booking_areas.position_index
        FROM booking_areas
        JOIN areas ON areas.id = booking_areas.area_id
        WHERE booking_areas.booking_id = ?
        ORDER BY booking_areas.position_index, areas.name
        """,
        (booking_id,),
    ).fetchall()

    return [{"id": row["id"], "name": row["name"]} for row in rows]


def fetch_booking_area_ids(connection, booking_id: int) -> list[int]:
    return [area["id"] for area in fetch_booking_areas(connection, booking_id)]


def booking_row_to_dict(connection, row, current_user) -> dict:
    display_status = get_booking_display_status(row)
    booking_areas = fetch_booking_areas(connection, row["id"])
    area_ids = [area["id"] for area in booking_areas]
    area_names = [area["name"] for area in booking_areas]
    approvals = fetch_booking_approvals(connection, row["id"])
    required_groups = fetch_required_approval_groups(connection, row["owner_group_id"])
    approved_group_ids = {approval["approver_group_id"] for approval in approvals}
    pending_groups = [group for group in required_groups if group["id"] not in approved_group_ids]

    booking_data = {
        "id": row["id"],
        "area_id": area_ids[0] if area_ids else row["area_id"],
        "area_ids": area_ids,
        "area_names": area_names,
        "areas": booking_areas,
        "user_id": row["user_id"],
        "owner_group_id": row["owner_group_id"],
        "owner_group_name": row["owner_group_name"],
        "area_name": " + ".join(area_names) if area_names else row["area_name"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "requested_by": row["requested_by"],
        "stored_status": row["status"],
        "status": display_status,
        "title": row["title"] or "",
        "description": row["description"] or "",
        "note": row["note"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "approvals": approvals,
        "required_approval_groups": required_groups,
        "pending_approval_groups": pending_groups,
        "permissions": build_booking_permissions(current_user, row, display_status, approvals),
    }

    if not current_user:
        return redact_booking_for_guest(booking_data)

    return booking_data


def build_booking_permissions(current_user, booking_row, display_status: str, approvals: list[dict]) -> dict:
    is_admin = bool(current_user) and current_user["role"] == "admin"
    is_owner_group_member = bool(current_user) and current_user["role"] == "user" and current_user["group_id"] == booking_row["owner_group_id"]
    is_approval_group_member = (
        bool(current_user)
        and current_user["role"] == "user"
        and bool(current_user.get("group_can_approve"))
        and current_user.get("group_id") != booking_row["owner_group_id"]
    )
    has_current_group_approval = bool(current_user) and current_user.get("group_id") in {
        approval["approver_group_id"]
        for approval in approvals
    }
    is_open_for_owner_actions = display_status not in {"rejected", "cancelled", DISPLAY_COMPLETED_STATUS}
    can_modify = is_open_for_owner_actions and (is_admin or is_owner_group_member)
    can_cancel = is_open_for_owner_actions and (is_admin or is_owner_group_member)
    can_submit_request = booking_row["status"] == "planned" and (is_admin or is_owner_group_member)
    can_reject = is_admin and booking_row["status"] == "requested"
    can_approve = booking_row["status"] == "requested" and (is_admin or (is_approval_group_member and not has_current_group_approval))

    return {
        "can_modify": can_modify,
        "can_cancel": can_cancel,
        "can_submit_request": can_submit_request,
        "can_reject": can_reject,
        "can_approve": can_approve,
        "can_delete": is_admin,
    }


def can_view_booking(current_user, booking_row) -> bool:
    display_status = get_booking_display_status(booking_row)

    if current_user and current_user["role"] == "admin":
        return True

    if current_user and current_user["role"] == "user" and current_user["group_id"] == booking_row["owner_group_id"]:
        return True

    if current_user:
        return display_status in MEMBER_VISIBLE_STATUSES

    return display_status in GUEST_VISIBLE_STATUSES


def redact_booking_for_guest(booking_data: dict) -> dict:
    redacted_data = dict(booking_data)
    redacted_data["requested_by"] = ""
    redacted_data["owner_group_name"] = ""
    redacted_data["stored_status"] = "busy"
    redacted_data["status"] = "busy"
    redacted_data["title"] = ""
    redacted_data["description"] = ""
    redacted_data["note"] = ""
    redacted_data["approvals"] = []
    redacted_data["required_approval_groups"] = []
    redacted_data["pending_approval_groups"] = []
    redacted_data["permissions"] = {
        "can_modify": False,
        "can_cancel": False,
        "can_submit_request": False,
        "can_reject": False,
        "can_approve": False,
        "can_delete": False,
    }
    return redacted_data


def get_booking_display_status(booking_row) -> str:
    if booking_row["status"] == "approved" and has_booking_ended(booking_row["end_time"]):
        return DISPLAY_COMPLETED_STATUS

    return booking_row["status"]


def fetch_booking_approvals(connection, booking_id: int) -> list[dict]:
    rows = connection.execute(
        """
        SELECT
            booking_approvals.approver_group_id,
            booking_approvals.approver_user_id,
            booking_approvals.created_at,
            groups.name AS approver_group_name,
            users.username AS approver_username
        FROM booking_approvals
        JOIN groups ON groups.id = booking_approvals.approver_group_id
        JOIN users ON users.id = booking_approvals.approver_user_id
        WHERE booking_approvals.booking_id = ?
        ORDER BY groups.name
        """,
        (booking_id,),
    ).fetchall()

    return [
        {
            "approver_group_id": row["approver_group_id"],
            "approver_group_name": row["approver_group_name"],
            "approver_user_id": row["approver_user_id"],
            "approver_username": row["approver_username"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def build_booking_approval_chain(connection, booking_row) -> list[dict]:
    required_groups = fetch_required_approval_groups(connection, booking_row["owner_group_id"])
    approvals_by_group = {
        approval["approver_group_id"]: approval
        for approval in fetch_booking_approvals(connection, booking_row["id"])
    }

    return [
        {
            "group_id": group["id"],
            "group_name": group["name"],
            "approved": group["id"] in approvals_by_group,
            "approved_by": approvals_by_group[group["id"]]["approver_username"] if group["id"] in approvals_by_group else None,
            "approved_at": approvals_by_group[group["id"]]["created_at"] if group["id"] in approvals_by_group else None,
        }
        for group in required_groups
    ]


def fetch_booking_audit_entries(connection, booking_id: int) -> list[dict]:
    rows = connection.execute(
        """
        SELECT
            audit_logs.id,
            audit_logs.action_type,
            audit_logs.details_json,
            audit_logs.created_at,
            audit_logs.actor_user_id,
            users.username AS actor_username
        FROM audit_logs
        LEFT JOIN users ON users.id = audit_logs.actor_user_id
        WHERE audit_logs.entity_type = 'booking'
          AND audit_logs.entity_id = ?
        ORDER BY audit_logs.created_at ASC, audit_logs.id ASC
        """,
        (booking_id,),
    ).fetchall()

    entries = []

    for row in rows:
        try:
            details = json.loads(row["details_json"] or "{}")
        except json.JSONDecodeError:
            details = {}

        entries.append(
            {
                "id": row["id"],
                "action_type": row["action_type"],
                "details": details,
                "created_at": row["created_at"],
                "actor_user_id": row["actor_user_id"],
                "actor_username": row["actor_username"] or "System",
            }
        )

    return entries


def fetch_required_approval_groups(connection, owner_group_id: int) -> list[dict]:
    rows = connection.execute(
        """
        SELECT id, name
        FROM groups
        WHERE approval_required = 1
          AND id != ?
        ORDER BY name
        """,
        (owner_group_id,),
    ).fetchall()

    return [{"id": row["id"], "name": row["name"]} for row in rows]


def has_all_required_approvals(connection, booking_row) -> bool:
    required_groups = fetch_required_approval_groups(connection, booking_row["owner_group_id"])

    if not required_groups:
        return True

    approved_group_ids = {
        row["approver_group_id"]
        for row in connection.execute(
            "SELECT approver_group_id FROM booking_approvals WHERE booking_id = ?",
            (booking_row["id"],),
        ).fetchall()
    }

    for group in required_groups:
        if group["id"] not in approved_group_ids:
            return False

    return True


def ensure_requested_booking_can_be_approved(connection, booking_row) -> None:
    if has_approval_blocking_overlap(connection, booking_row):
        raise HTTPException(
            status_code=400,
            detail="This requested booking cannot be approved because one or more selected areas already have an overlapping planned or approved booking.",
        )


def has_approval_blocking_overlap(connection, booking_row) -> bool:
    return has_booking_area_overlap(
        connection,
        area_ids=fetch_booking_area_ids(connection, booking_row["id"]),
        start_time_value=booking_row["start_time"],
        end_time_value=booking_row["end_time"],
        excluded_booking_id=booking_row["id"],
    )


def ensure_booking_area_selection_has_no_blocking_overlap(
    connection,
    area_ids: list[int],
    start_time_value: str,
    end_time_value: str,
    excluded_booking_id: Optional[int] = None,
) -> None:
    if has_booking_area_overlap(
        connection,
        area_ids=area_ids,
        start_time_value=start_time_value,
        end_time_value=end_time_value,
        excluded_booking_id=excluded_booking_id,
    ):
        raise HTTPException(
            status_code=400,
            detail="One or more selected areas already have an overlapping planned or approved booking in that time range.",
        )


def has_booking_area_overlap(
    connection,
    area_ids: list[int],
    start_time_value: str,
    end_time_value: str,
    excluded_booking_id: Optional[int] = None,
) -> bool:
    if not area_ids:
        return False

    placeholders = ", ".join(["?"] * len(area_ids))
    parameters: list[object] = list(area_ids)
    query = f"""
        SELECT bookings.id
        FROM bookings
        JOIN booking_areas ON booking_areas.booking_id = bookings.id
        WHERE booking_areas.area_id IN ({placeholders})
          AND bookings.status IN ('planned', 'approved')
    """

    if excluded_booking_id is not None:
        query += " AND bookings.id != ?"
        parameters.append(excluded_booking_id)

    query += """
          AND bookings.start_time < ?
          AND bookings.end_time > ?
        LIMIT 1
    """
    parameters.extend([end_time_value, start_time_value])

    conflicting_booking = connection.execute(query, tuple(parameters)).fetchone()
    return conflicting_booking is not None


def ensure_user_can_collect_approval(connection, current_user: dict, booking_row) -> None:
    if current_user["role"] != "user":
        raise HTTPException(status_code=403, detail="Only user-group approvers can collect approvals.")

    if not current_user.get("group_id"):
        raise HTTPException(status_code=403, detail="This user is not attached to a group.")

    if current_user["group_id"] == booking_row["owner_group_id"]:
        raise HTTPException(status_code=403, detail="Your own group cannot approve its own booking.")

    if not bool(current_user.get("group_can_approve")):
        raise HTTPException(status_code=403, detail="Your group is not configured as an approval group.")

    existing_row = connection.execute(
        """
        SELECT id
        FROM booking_approvals
        WHERE booking_id = ?
          AND approver_group_id = ?
        """,
        (booking_row["id"], current_user["group_id"]),
    ).fetchone()

    if existing_row:
        raise HTTPException(status_code=400, detail="Your group has already approved this booking.")


def upsert_booking_approval(connection, booking_id: int, current_user: dict) -> None:
    existing_row = connection.execute(
        """
        SELECT id
        FROM booking_approvals
        WHERE booking_id = ?
          AND approver_group_id = ?
        """,
        (booking_id, current_user["group_id"]),
    ).fetchone()

    if existing_row:
        connection.execute(
            """
            UPDATE booking_approvals
            SET approver_user_id = ?, created_at = ?
            WHERE id = ?
            """,
            (current_user["id"], current_timestamp(), existing_row["id"]),
        )
        return

    connection.execute(
        """
        INSERT INTO booking_approvals (booking_id, approver_user_id, approver_group_id, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (booking_id, current_user["id"], current_user["group_id"], current_timestamp()),
    )


def delete_booking_approvals(connection, booking_id: int) -> None:
    connection.execute("DELETE FROM booking_approvals WHERE booking_id = ?", (booking_id,))


def set_booking_status(connection, booking_id: int, status: str) -> None:
    connection.execute(
        "UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?",
        (status, current_timestamp(), booking_id),
    )


def ensure_booking_owned_by_group_or_admin(current_user: dict, booking_row) -> None:
    if current_user["role"] == "admin":
        return

    if current_user["role"] == "user" and current_user.get("group_id") == booking_row["owner_group_id"]:
        return

    raise HTTPException(status_code=403, detail="You may only manage bookings belonging to your own group.")


def ensure_booking_can_be_modified(current_user: dict, booking_row, display_status: str) -> None:
    if display_status in {"rejected", "cancelled", DISPLAY_COMPLETED_STATUS}:
        raise HTTPException(status_code=400, detail="This booking can no longer be modified.")

    ensure_booking_owned_by_group_or_admin(current_user, booking_row)


def validate_area_values(name: str, description: str) -> None:
    if not name:
        raise HTTPException(status_code=400, detail="Area name is required.")

    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Area name must be 80 characters or fewer.")

    if len(description) > 200:
        raise HTTPException(status_code=400, detail="Area description must be 200 characters or fewer.")


def normalize_group_payload(payload) -> tuple[str, str, bool, bool]:
    name = payload.name.strip()
    description = (payload.description or "").strip()
    can_approve = bool(payload.can_approve or payload.approval_required)
    approval_required = bool(payload.approval_required)

    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")

    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Group name must be 80 characters or fewer.")

    if len(description) > 200:
        raise HTTPException(status_code=400, detail="Group description must be 200 characters or fewer.")

    return name, description, can_approve, approval_required


def validate_user_values(username: str, password: str, role: str, group_id: Optional[int]) -> None:
    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")

    if len(username) < 3 or len(username) > 40:
        raise HTTPException(status_code=400, detail="Username must be between 3 and 40 characters.")

    if not username.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Username may only contain letters, numbers, underscores, and hyphens.",
        )

    validate_user_role_and_group(role, group_id)
    validate_new_password(password)


def validate_user_role_and_group(role: str, group_id: Optional[int]) -> None:
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Role must be admin or user.")

    if role == "admin":
        if group_id is not None:
            raise HTTPException(status_code=400, detail="Admin accounts cannot belong to a group.")
        return

    if group_id is None:
        raise HTTPException(status_code=400, detail="User accounts must belong to exactly one group.")

    fetch_group_by_id(group_id)


def validate_new_password(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")


def normalize_user_group(role: str, group_id: Optional[int]) -> Optional[int]:
    normalized_role = role.strip().lower()

    if normalized_role == "admin":
        return None

    return group_id


def determine_booking_owner_group_id(current_user: dict, requested_group_id: Optional[int]) -> int:
    if current_user["role"] == "admin":
        if requested_group_id is None:
            raise HTTPException(status_code=400, detail="Admin-created bookings must choose an owner group.")
        fetch_group_by_id(requested_group_id)
        return requested_group_id

    group_id = current_user.get("group_id")

    if not group_id:
        raise HTTPException(status_code=400, detail="Your user account is not attached to a group.")

    return group_id


def normalize_booking_area_ids(primary_area_id: Optional[int], requested_area_ids: Optional[list[int]]) -> list[int]:
    collected_ids: list[int] = []

    if requested_area_ids:
        for area_id in requested_area_ids:
            if area_id not in collected_ids:
                collected_ids.append(area_id)

    if primary_area_id is not None and primary_area_id not in collected_ids:
        collected_ids.insert(0, primary_area_id)

    if not collected_ids:
        raise HTTPException(status_code=400, detail="At least one area must be selected.")

    return collected_ids


def ensure_area_ids_exist(area_ids: list[int]) -> None:
    if not area_ids:
        raise HTTPException(status_code=400, detail="At least one area must be selected.")

    with get_connection() as connection:
        rows = connection.execute(
            f"SELECT id FROM areas WHERE id IN ({', '.join(['?'] * len(area_ids))})",
            tuple(area_ids),
        ).fetchall()

    found_ids = {row["id"] for row in rows}
    missing_ids = [area_id for area_id in area_ids if area_id not in found_ids]

    if missing_ids:
        raise HTTPException(status_code=400, detail="One or more selected areas do not exist.")


def normalize_optional_text(value: Optional[str], max_length: int) -> str:
    text = (value or "").strip()

    if len(text) > max_length:
        raise HTTPException(status_code=400, detail=f"Text must be {max_length} characters or fewer.")

    return text


def has_blocking_area_bookings(connection, area_id: int) -> bool:
    now_text = current_timestamp()
    blocking_count = connection.execute(
        """
        SELECT COUNT(*)
        FROM bookings
        JOIN booking_areas ON booking_areas.booking_id = bookings.id
        WHERE booking_areas.area_id = ?
          AND bookings.status NOT IN ('rejected', 'cancelled')
          AND bookings.end_time >= ?
        """,
        (area_id, now_text),
    ).fetchone()[0]

    return blocking_count > 0


def replace_booking_area_links(connection, booking_id: int, area_ids: list[int]) -> None:
    connection.execute("DELETE FROM booking_areas WHERE booking_id = ?", (booking_id,))

    for index, area_id in enumerate(area_ids):
        connection.execute(
            """
            INSERT INTO booking_areas (booking_id, area_id, position_index)
            VALUES (?, ?, ?)
            """,
            (booking_id, area_id, index),
        )


def remove_area_from_existing_bookings(connection, area_id: int) -> None:
    booking_rows = connection.execute(
        """
        SELECT DISTINCT booking_id
        FROM booking_areas
        WHERE area_id = ?
        """,
        (area_id,),
    ).fetchall()

    for row in booking_rows:
        booking_id = row["booking_id"]
        remaining_rows = connection.execute(
            """
            SELECT area_id
            FROM booking_areas
            WHERE booking_id = ?
              AND area_id != ?
            ORDER BY position_index, area_id
            """,
            (booking_id, area_id),
        ).fetchall()

        connection.execute(
            "DELETE FROM booking_areas WHERE booking_id = ? AND area_id = ?",
            (booking_id, area_id),
        )

        if not remaining_rows:
            connection.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
            continue

        current_primary = connection.execute(
            "SELECT area_id FROM bookings WHERE id = ?",
            (booking_id,),
        ).fetchone()

        if current_primary and current_primary["area_id"] == area_id:
            connection.execute(
                "UPDATE bookings SET area_id = ? WHERE id = ?",
                (remaining_rows[0]["area_id"], booking_id),
            )


def area_exists(area_id: int) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id FROM areas WHERE id = ?",
            (area_id,),
        ).fetchone()

    return row is not None


def serialize_user_session(user_row) -> dict:
    return {
        "id": user_row["id"],
        "username": user_row["username"],
        "role": user_row["role"],
        "group_id": user_row["group_id"],
        "group_name": user_row["group_name"],
        "group_can_approve": bool(user_row["group_can_approve"]),
        "group_approval_required": bool(user_row["group_approval_required"]),
    }


def serialize_public_user_row(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "group_id": row["group_id"],
        "group_name": row["group_name"],
    }


def serialize_group_row(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "can_approve": bool(row["can_approve"]),
        "approval_required": bool(row["approval_required"]),
    }


def serialize_area_row(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
    }


def write_audit_log(
    connection,
    actor_user_id: Optional[int],
    action_type: str,
    entity_type: str,
    entity_id: Optional[int],
    details: dict,
) -> None:
    connection.execute(
        """
        INSERT INTO audit_logs (
            actor_user_id,
            action_type,
            entity_type,
            entity_id,
            details_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            actor_user_id,
            action_type,
            entity_type,
            entity_id,
            json.dumps(details, sort_keys=True),
            current_timestamp(),
        ),
    )


def parse_datetime_value(raw_value: str) -> datetime:
    if not raw_value:
        raise HTTPException(status_code=400, detail="Start time and end time are required.")

    try:
        return datetime.fromisoformat(str(raw_value).replace(" ", "T"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid date/time format.") from error


def format_datetime_value(date_value: datetime) -> str:
    return date_value.strftime("%Y-%m-%d %H:%M")


def current_timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def has_booking_ended(end_time_value: str) -> bool:
    return parse_datetime_value(end_time_value) < datetime.now()


def get_optional_current_user(authorization_header: Optional[str]):
    token = get_bearer_token(authorization_header)

    if not token:
        return None

    token_user = get_user_from_token(token)

    if not token_user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")

    user_row = fetch_user_auth_by_id(token_user["id"])

    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")

    return serialize_user_session(user_row)


def require_current_user(authorization_header: Optional[str]):
    current_user = get_optional_current_user(authorization_header)

    if not current_user:
        raise HTTPException(status_code=401, detail="Please log in first.")

    return current_user


def ensure_admin(current_user: dict) -> None:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")


def get_bearer_token(authorization_header: Optional[str]) -> Optional[str]:
    if not authorization_header:
        return None

    parts = authorization_header.split(" ", 1)

    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization header must use Bearer token format.")

    return parts[1]


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=settings.app_env == "dev",
    )

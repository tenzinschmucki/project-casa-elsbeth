import argparse
from datetime import datetime

from auth import hash_password
from config import settings
from database import get_connection, initialize_database


SEED_GROUPS = [
    ("Group Alpha", "Requesting and approving group", 1, 1),
    ("Group Beta", "Second approval group", 1, 1),
    ("Group Gamma", "Regular requester group", 0, 0),
]

SEED_AREAS = [
    ("Office", "Desk and work area"),
    ("Guest room", "Room for overnight guests"),
    ("Living room", "Shared sitting area"),
    ("Garden", "Outdoor garden space"),
    ("Garage", "Vehicle and storage area"),
    ("Dining area", "Table and shared dining space"),
]

SEED_USERS = [
    ("admin", "admin123", "admin", None),
    ("user1", "user123", "user", "Group Alpha"),
    ("user2", "user123", "user", "Group Beta"),
    ("user3", "user123", "user", "Group Gamma"),
]

SEED_BOOKINGS_NON_PROD = [
    {
        "area": "Office",
        "username": "user3",
        "status": "approved",
        "start_time": "2026-05-08 09:00",
        "end_time": "2026-05-08 11:00",
        "title": "Finished writing session",
        "description": "Historical approved booking that now displays as completed.",
        "note": "Finished writing session",
        "approvals": ["Group Alpha", "Group Beta"],
    },
    {
        "area": "Office",
        "username": "user1",
        "status": "requested",
        "start_time": "2026-05-11 09:00",
        "end_time": "2026-05-11 11:00",
        "title": "Writing session",
        "description": "Open request that still needs approval.",
        "note": "Writing session",
        "approvals": [],
    },
    {
        "area": "Guest room",
        "username": "user2",
        "status": "planned",
        "start_time": "2026-05-12 14:00",
        "end_time": "2026-05-12 18:00",
        "title": "Family visit hold",
        "description": "Priority hold before entering approval workflow.",
        "note": "Family visit draft",
        "approvals": [],
    },
    {
        "area": "Garden",
        "username": "user3",
        "status": "approved",
        "start_time": "2026-05-13 10:00",
        "end_time": "2026-05-13 12:00",
        "title": "Garden lunch",
        "description": "Confirmed group booking.",
        "note": "Garden lunch",
        "approvals": ["Group Alpha", "Group Beta"],
    },
    {
        "area": "Living room",
        "username": "user2",
        "status": "rejected",
        "start_time": "2026-05-14 13:00",
        "end_time": "2026-05-14 14:30",
        "title": "Rain check meeting",
        "description": "Rejected request example.",
        "note": "Rain check meeting",
        "approvals": [],
    },
    {
        "area": "Garage",
        "username": "user1",
        "status": "cancelled",
        "start_time": "2026-05-15 16:00",
        "end_time": "2026-05-15 18:00",
        "title": "Storage move",
        "description": "Cancelled booking example.",
        "note": "Storage move cancelled",
        "approvals": [],
    },
]

SEED_BOOKINGS_PROD = [
    {
        "area": "Office",
        "username": "user1",
        "status": "requested",
        "start_time": "2026-05-11 09:00",
        "end_time": "2026-05-11 11:00",
        "title": "Initial smoke test data",
        "description": "Minimal non-empty data for a first run.",
        "note": "Initial smoke test data",
        "approvals": [],
    },
]


def reset_and_seed_non_prod_database() -> None:
    initialize_database()

    now_text = current_timestamp()

    with get_connection() as connection:
        connection.execute("DELETE FROM booking_areas")
        connection.execute("DELETE FROM booking_approvals")
        connection.execute("DELETE FROM audit_logs")
        connection.execute("DELETE FROM bookings")
        connection.execute("DELETE FROM areas")
        connection.execute("DELETE FROM users")
        connection.execute("DELETE FROM groups")
        connection.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('booking_approvals', 'audit_logs', 'bookings', 'areas', 'users', 'groups')"
        )

        seed_reference_data(connection, now_text, SEED_BOOKINGS_NON_PROD)
        connection.commit()


def seed_prod_if_confirmed() -> None:
    initialize_database()

    with get_connection() as connection:
        counts = {
            "users": connection.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            "groups": connection.execute("SELECT COUNT(*) FROM groups").fetchone()[0],
            "areas": connection.execute("SELECT COUNT(*) FROM areas").fetchone()[0],
            "bookings": connection.execute("SELECT COUNT(*) FROM bookings").fetchone()[0],
        }

        if any(counts.values()):
            raise SystemExit(
                "Refusing to seed PROD because the database already contains data. "
                "This protects live data from being overwritten."
            )

        seed_reference_data(connection, current_timestamp(), SEED_BOOKINGS_PROD)
        connection.commit()


def seed_reference_data(connection, now_text: str, booking_definitions: list[dict]) -> None:
    group_ids = {}
    user_rows = {}
    area_ids = {}

    for name, description, can_approve, approval_required in SEED_GROUPS:
        cursor = connection.execute(
            """
            INSERT INTO groups (name, description, can_approve, approval_required)
            VALUES (?, ?, ?, ?)
            """,
            (name, description, can_approve, approval_required),
        )
        group_ids[name] = cursor.lastrowid

    for area_name, area_description in SEED_AREAS:
        cursor = connection.execute(
            "INSERT INTO areas (name, description) VALUES (?, ?)",
            (area_name, area_description),
        )
        area_ids[area_name] = cursor.lastrowid

    for username, password, role, group_name in SEED_USERS:
        group_id = group_ids[group_name] if group_name else None
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, role, group_id) VALUES (?, ?, ?, ?)",
            (username, hash_password(password), role, group_id),
        )
        user_rows[username] = {
            "id": cursor.lastrowid,
            "role": role,
            "group_id": group_id,
        }

    for booking_definition in booking_definitions:
        user_row = user_rows[booking_definition["username"]]
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
                area_ids[booking_definition["area"]],
                user_row["id"],
                user_row["group_id"],
                booking_definition["start_time"],
                booking_definition["end_time"],
                booking_definition["status"],
                booking_definition["title"],
                booking_definition["description"],
                booking_definition["note"],
                now_text,
                now_text,
            ),
        )
        booking_id = cursor.lastrowid
        connection.execute(
            """
            INSERT INTO booking_areas (booking_id, area_id, position_index)
            VALUES (?, ?, 0)
            """,
            (booking_id, area_ids[booking_definition["area"]]),
        )

        for approver_group_name in booking_definition["approvals"]:
            connection.execute(
                """
                INSERT INTO booking_approvals (
                    booking_id,
                    approver_user_id,
                    approver_group_id,
                    created_at
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    booking_id,
                    pick_group_user_id(SEED_USERS, user_rows, approver_group_name),
                    group_ids[approver_group_name],
                    now_text,
                ),
            )


def pick_group_user_id(seed_users, user_rows, group_name: str) -> int:
    for username, _, role, user_group_name in seed_users:
        if role == "user" and user_group_name == group_name:
            return user_rows[username]["id"]

    raise ValueError("No seed user found for group: " + group_name)


def current_timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Project Casa Elsbeth demo data.")
    parser.add_argument(
        "--confirm-prod",
        action="store_true",
        help="Required if APP_ENV=prod. Still refused if PROD already contains data.",
    )
    args = parser.parse_args()

    print("APP_ENV:", settings.app_env)
    print("Database:", settings.database_path)

    if settings.allow_demo_seed_without_confirmation:
        reset_and_seed_non_prod_database()
        print("Seed completed for", settings.app_env.upper())
        return

    if not args.confirm_prod:
        raise SystemExit(
            "Refusing to seed PROD by default. Run again with --confirm-prod only if you intentionally "
            "want demo data in an empty PROD database."
        )

    seed_prod_if_confirmed()
    print("Seed completed for PROD with explicit confirmation.")


if __name__ == "__main__":
    main()

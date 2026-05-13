import sqlite3

from config import settings


LATEST_BOOKINGS_TABLE_SQL = """
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    owner_group_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('requested', 'planned', 'approved', 'rejected', 'cancelled')),
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (area_id) REFERENCES areas (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (owner_group_id) REFERENCES groups (id)
)
"""

LATEST_USERS_TABLE_SQL = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    group_id INTEGER,
    FOREIGN KEY (group_id) REFERENCES groups (id)
)
"""

LATEST_GROUPS_TABLE_SQL = """
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0, 1)),
    approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0, 1))
)
"""

LATEST_BOOKING_APPROVALS_TABLE_SQL = """
CREATE TABLE booking_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    approver_user_id INTEGER NOT NULL,
    approver_group_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (booking_id, approver_group_id),
    FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
    FOREIGN KEY (approver_user_id) REFERENCES users (id),
    FOREIGN KEY (approver_group_id) REFERENCES groups (id)
)
"""

LATEST_BOOKING_AREAS_TABLE_SQL = """
CREATE TABLE booking_areas (
    booking_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    position_index INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (booking_id, area_id),
    FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
    FOREIGN KEY (area_id) REFERENCES areas (id)
)
"""

LATEST_AUDIT_LOGS_TABLE_SQL = """
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details_json TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
)
"""

DEFAULT_GROUP_NAME = "General"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(str(settings.database_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    schema_path = settings.base_dir / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")

    with get_connection() as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.executescript(schema_sql)
        migrate_groups_table_if_needed(connection)
        default_group_id = ensure_default_group(connection)
        migrate_users_table_if_needed(connection, default_group_id)
        migrate_bookings_table_if_needed(connection, default_group_id)
        ensure_booking_areas_table(connection)
        ensure_booking_approvals_table(connection)
        ensure_audit_logs_table(connection)
        backfill_user_groups(connection, default_group_id)
        backfill_booking_owner_groups(connection, default_group_id)
        connection.execute("PRAGMA foreign_keys = ON")
        connection.commit()


def migrate_groups_table_if_needed(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'groups'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_GROUPS_TABLE_SQL)
        return

    group_columns = get_table_columns(connection, "groups")

    if {"description", "can_approve", "approval_required"}.issubset(group_columns):
        return

    connection.execute("ALTER TABLE groups RENAME TO groups_legacy")
    connection.execute(LATEST_GROUPS_TABLE_SQL)

    legacy_columns = get_table_columns(connection, "groups_legacy")
    description_sql = "description" if "description" in legacy_columns else "''"
    can_approve_sql = "can_approve" if "can_approve" in legacy_columns else "0"
    approval_required_sql = "approval_required" if "approval_required" in legacy_columns else "0"

    connection.execute(
        f"""
        INSERT INTO groups (id, name, description, can_approve, approval_required)
        SELECT
            id,
            name,
            {description_sql},
            {can_approve_sql},
            {approval_required_sql}
        FROM groups_legacy
        """
    )
    connection.execute("DROP TABLE groups_legacy")


def ensure_default_group(connection: sqlite3.Connection) -> int:
    row = connection.execute(
        "SELECT id FROM groups WHERE name = ?",
        (DEFAULT_GROUP_NAME,),
    ).fetchone()

    if row:
        return row["id"]

    cursor = connection.execute(
        """
        INSERT INTO groups (name, description, can_approve, approval_required)
        VALUES (?, ?, 0, 0)
        """,
        (DEFAULT_GROUP_NAME, "Legacy group for migrated users and bookings."),
    )
    return cursor.lastrowid


def migrate_users_table_if_needed(connection: sqlite3.Connection, default_group_id: int) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_USERS_TABLE_SQL)
        return

    user_columns = get_table_columns(connection, "users")

    if "group_id" in user_columns:
        return

    connection.execute("ALTER TABLE users RENAME TO users_legacy")
    connection.execute(LATEST_USERS_TABLE_SQL)
    connection.execute(
        """
        INSERT INTO users (id, username, password_hash, role, group_id)
        SELECT
            id,
            username,
            password_hash,
            role,
            CASE
                WHEN role = 'admin' THEN NULL
                ELSE ?
            END
        FROM users_legacy
        """,
        (default_group_id,),
    )
    connection.execute("DROP TABLE users_legacy")


def migrate_bookings_table_if_needed(connection: sqlite3.Connection, default_group_id: int) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bookings'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_BOOKINGS_TABLE_SQL)
        return

    booking_columns = get_table_columns(connection, "bookings")
    required_columns = {"owner_group_id", "title", "description", "note"}

    if required_columns.issubset(booking_columns):
        return

    connection.execute("ALTER TABLE bookings RENAME TO bookings_legacy")
    connection.execute(LATEST_BOOKINGS_TABLE_SQL)

    legacy_columns = get_table_columns(connection, "bookings_legacy")
    title_sql = "title" if "title" in legacy_columns else "''"
    description_sql = "description" if "description" in legacy_columns else "''"
    note_sql = "note" if "note" in legacy_columns else "''"

    connection.execute(
        f"""
        INSERT INTO bookings (
            id,
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
        SELECT
            bookings_legacy.id,
            bookings_legacy.area_id,
            bookings_legacy.user_id,
            COALESCE(users.group_id, ?),
            bookings_legacy.start_time,
            bookings_legacy.end_time,
            bookings_legacy.status,
            {title_sql},
            {description_sql},
            {note_sql},
            bookings_legacy.created_at,
            bookings_legacy.updated_at
        FROM bookings_legacy
        LEFT JOIN users ON users.id = bookings_legacy.user_id
        """,
        (default_group_id,),
    )
    connection.execute("DROP TABLE bookings_legacy")


def ensure_booking_approvals_table(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'booking_approvals'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_BOOKING_APPROVALS_TABLE_SQL)
        return

    table_sql = row["sql"] or ""

    if "bookings_legacy" in table_sql or "users_legacy" in table_sql:
        connection.execute("DROP TABLE booking_approvals")
        connection.execute(LATEST_BOOKING_APPROVALS_TABLE_SQL)


def ensure_booking_areas_table(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'booking_areas'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_BOOKING_AREAS_TABLE_SQL)
    else:
        table_sql = row["sql"] or ""

        if "bookings_legacy" in table_sql or "areas_legacy" in table_sql:
            connection.execute("DROP TABLE booking_areas")
            connection.execute(LATEST_BOOKING_AREAS_TABLE_SQL)

    connection.execute(
        """
        INSERT INTO booking_areas (booking_id, area_id, position_index)
        SELECT bookings.id, bookings.area_id, 0
        FROM bookings
        LEFT JOIN booking_areas ON booking_areas.booking_id = bookings.id
        WHERE booking_areas.booking_id IS NULL
        """
    )


def ensure_audit_logs_table(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'"
    ).fetchone()

    if not row:
        connection.execute(LATEST_AUDIT_LOGS_TABLE_SQL)
        return

    table_sql = row["sql"] or ""

    if "users_legacy" in table_sql:
        connection.execute("DROP TABLE audit_logs")
        connection.execute(LATEST_AUDIT_LOGS_TABLE_SQL)


def backfill_user_groups(connection: sqlite3.Connection, default_group_id: int) -> None:
    connection.execute(
        """
        UPDATE users
        SET group_id = ?
        WHERE role = 'user'
          AND group_id IS NULL
        """,
        (default_group_id,),
    )


def backfill_booking_owner_groups(connection: sqlite3.Connection, default_group_id: int) -> None:
    connection.execute(
        """
        UPDATE bookings
        SET owner_group_id = COALESCE(
            (SELECT users.group_id FROM users WHERE users.id = bookings.user_id),
            ?
        )
        WHERE owner_group_id IS NULL
        """,
        (default_group_id,),
    )


def get_table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}

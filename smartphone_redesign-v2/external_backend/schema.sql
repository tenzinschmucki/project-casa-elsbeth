CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0, 1)),
    approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0, 1))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    group_id INTEGER,
    FOREIGN KEY (group_id) REFERENCES groups (id)
);

CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
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
);

CREATE TABLE IF NOT EXISTS booking_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    approver_user_id INTEGER NOT NULL,
    approver_group_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (booking_id, approver_group_id),
    FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
    FOREIGN KEY (approver_user_id) REFERENCES users (id),
    FOREIGN KEY (approver_group_id) REFERENCES groups (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details_json TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
);

import hashlib
import hmac
import os
import secrets


SESSION_TOKENS = {}
PBKDF2_ITERATIONS = 100_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        salt.hex(),
        password_hash.hex(),
    )


def verify_password(password: str, stored_value: str) -> bool:
    try:
        algorithm_name, iterations_text, salt_hex, expected_hash_hex = stored_value.split("$")
    except ValueError:
        return False

    if algorithm_name != "pbkdf2_sha256":
        return False

    calculated_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        int(iterations_text),
    )

    return hmac.compare_digest(calculated_hash.hex(), expected_hash_hex)


def create_session_token(user_row) -> str:
    token = secrets.token_hex(24)
    session_user = {
        "id": user_row["id"],
        "username": user_row["username"],
        "role": user_row["role"],
    }

    for optional_key in (
        "group_id",
        "group_name",
        "group_can_approve",
        "group_approval_required",
    ):
        if optional_key in user_row.keys():
            session_user[optional_key] = user_row[optional_key]

    SESSION_TOKENS[token] = session_user
    return token


def get_user_from_token(token: str):
    return SESSION_TOKENS.get(token)

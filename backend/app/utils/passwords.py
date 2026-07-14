"""Password hashing. pbkdf2_sha256 (pure-Python, no native deps): passlib
handles per-hash salts and constant-time verification."""
from passlib.hash import pbkdf2_sha256

MIN_PASSWORD_LENGTH = 8


def hash_password(raw: str) -> str:
    return pbkdf2_sha256.hash(raw)


def verify_password(raw: str, password_hash: str) -> bool:
    try:
        return pbkdf2_sha256.verify(raw, password_hash)
    except ValueError:
        return False

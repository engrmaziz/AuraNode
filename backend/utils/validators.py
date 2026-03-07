"""Validators — file and input validation utilities."""
import mimetypes
import re
from typing import Optional

ACCEPTED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "application/pdf",
}

MAX_FILE_NAME_LENGTH = 255


def validate_file(contents: bytes, max_bytes: int) -> None:
    """Validate file size.

    Raises:
        ValueError: if file exceeds max_bytes
    """
    size = len(contents)
    if size == 0:
        raise ValueError("Uploaded file is empty.")
    if size > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        actual_mb = size / (1024 * 1024)
        raise ValueError(
            f"File size {actual_mb:.1f} MB exceeds the maximum allowed size of {max_mb:.0f} MB."
        )


def validate_file_name(file_name: str) -> str:
    """Sanitise and validate a file name.

    Returns:
        Sanitised file name.
    Raises:
        ValueError: if file name is invalid.
    """
    if not file_name or not file_name.strip():
        raise ValueError("File name cannot be empty.")

    # Remove path separators and null bytes
    sanitised = re.sub(r"[/\\:\*\?\"\<\>\|\x00]", "_", file_name.strip())

    if len(sanitised) > MAX_FILE_NAME_LENGTH:
        raise ValueError(f"File name exceeds maximum length of {MAX_FILE_NAME_LENGTH} characters.")

    return sanitised


def validate_uuid(value: str, field_name: str = "ID") -> str:
    """Validate UUID format.

    Returns:
        Validated UUID string.
    Raises:
        ValueError: if not a valid UUID.
    """
    uuid_pattern = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
    )
    if not uuid_pattern.match(value):
        raise ValueError(f"Invalid {field_name} format. Expected UUID.")
    return value.lower()


def validate_email(email: str) -> str:
    """Basic email format validation.

    Returns:
        Lowercase email string.
    Raises:
        ValueError: if email format is invalid.
    """
    email = email.strip().lower()
    pattern = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
    if not pattern.match(email):
        raise ValueError(f"Invalid email address: {email}")
    return email


def validate_mime_type(content_type: Optional[str], file_name: Optional[str] = None) -> str:
    """Validate that the MIME type is an accepted diagnostic file format.

    Returns:
        Validated content type string.
    Raises:
        ValueError: if MIME type is not accepted.
    """
    if content_type and content_type in ACCEPTED_MIME_TYPES:
        return content_type

    # Fall back to guessing from file extension
    if file_name:
        guessed, _ = mimetypes.guess_type(file_name)
        if guessed and guessed in ACCEPTED_MIME_TYPES:
            return guessed

    raise ValueError(
        f"Unsupported file type '{content_type}'. "
        f"Accepted formats: {', '.join(sorted(ACCEPTED_MIME_TYPES))}"
    )

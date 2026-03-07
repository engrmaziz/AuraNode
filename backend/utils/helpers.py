"""Helper utilities for the AuraNode backend."""
import hashlib
import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def generate_uuid() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(tz=timezone.utc)


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return utc_now().isoformat()


def slugify(text: str, max_length: int = 80) -> str:
    """Convert a string to a URL-safe slug.

    Example: "Hello World!" → "hello-world"
    """
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:max_length]


def truncate_text(text: str, max_chars: int = 500, suffix: str = "…") -> str:
    """Truncate text to max_chars, appending suffix if truncated."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + suffix


def safe_get(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Safely retrieve a nested value from a dict using dot-path keys."""
    current = d
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
    return current


def hash_file(contents: bytes) -> str:
    """Return SHA-256 hex digest of file contents."""
    return hashlib.sha256(contents).hexdigest()


def build_storage_path(case_id: str, file_name: str) -> str:
    """Build a deterministic storage path for a case file.

    Format: {case_id}/{uuid}/{file_name}
    """
    return f"{case_id}/{generate_uuid()}/{file_name}"


def format_bytes(num_bytes: int) -> str:
    """Format bytes into human-readable string (e.g. 1.2 MB)."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def mask_sensitive(value: str, visible_chars: int = 4) -> str:
    """Partially mask a sensitive string (e.g. API key or JWT).

    Example: "super-secret-key" → "supe…"
    """
    if len(value) <= visible_chars:
        return "***"
    return value[:visible_chars] + "…"


def parse_bool(value: Any) -> bool:
    """Parse various truthy representations to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "on")
    return bool(value)

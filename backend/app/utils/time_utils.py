"""UTC storage and serialization helpers for SheDefender."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

INDIA_TZ = ZoneInfo('Asia/Kolkata')


def as_utc(value):
    """Treat SQLite-naive datetimes as UTC and return an aware UTC datetime."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_iso(value):
    """Serialize a timestamp as an unambiguous ISO-8601 UTC string."""
    normalized = as_utc(value)
    return normalized.isoformat().replace('+00:00', 'Z') if normalized else None


def parse_client_datetime(value):
    """Parse ISO input; naive browser datetime-local values are interpreted as IST."""
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=INDIA_TZ)
    return parsed.astimezone(timezone.utc)


def india_time(value):
    normalized = as_utc(value)
    return normalized.astimezone(INDIA_TZ) if normalized else None

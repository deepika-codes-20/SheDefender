
const TIME_ZONE = "Asia/Kolkata";

function parseTimestamp(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = parseTimestamp(value);

  return date
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(date)
    : "—";
}

export function formatDate(value) {
  const date = parseTimestamp(value);

  return date
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date)
    : "—";
}

export function formatTime(value) {
  const date = parseTimestamp(value);

  return date
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(date)
    : "—";
}

export function getISTDateTimeLocalInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}


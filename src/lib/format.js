/**
 * Supabase throws/returns plain `{ message, details, hint, code }` objects,
 * NOT real `Error` instances — so `err.message` is usually there, but don't
 * assume `err instanceof Error`. Use this everywhere you surface an error
 * to a toast/UI, per 4 HAUS's operational notes.
 */
/**
 * The save-side companion to toDatetimeLocalValue: converts a bare
 * "YYYY-MM-DDTHH:mm" string from a datetime-local input into a full ISO
 * string with an explicit timezone before sending it to a `timestamptz`
 * column. Sending the bare local string directly risks Postgres/PostgREST
 * either rejecting it or mis-interpreting the timezone — this removes that
 * ambiguity entirely by resolving it in the browser first.
 */
export function fromDatetimeLocalValue(localString) {
  if (!localString) return null;
  const d = new Date(localString);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Supabase/Postgres returns `timestamptz` columns as full ISO strings with
 * a timezone offset (e.g. "2026-07-20T10:00:00+00:00"). An
 * <input type="datetime-local"> only accepts EXACTLY "YYYY-MM-DDTHH:mm" —
 * any timezone suffix or seconds makes the browser silently reject the
 * value and show the field as empty. This was the actual cause of "dates
 * don't save" — the save itself worked, but the field could never display
 * what was saved. Converts to the browser's local time for editing.
 */
export function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function errMsg(err) {
  if (!err) return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
  }
}

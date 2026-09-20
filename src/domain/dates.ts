export function localISODate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("The organization date could not be determined.");
  return `${year}-${month}-${day}`;
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function nextCalendarDate(value: string): string {
  if (!isCalendarDate(value)) throw new Error("A valid calendar date is required.");
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return next.toISOString().slice(0, 10);
}

function zonedParts(value: Date, timeZone: string): Readonly<Record<string, number>> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    calendar: "iso8601",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (["year", "month", "day", "hour", "minute", "second"].includes(part.type)) result[part.type] = Number(part.value);
  }
  return result;
}

export function zonedStartOfDayISO(value: string, timeZone: string): string {
  if (!isCalendarDate(value)) throw new Error("A valid calendar date is required.");
  const [year, month, day] = value.split("-").map(Number);
  const desiredWallClock = Date.UTC(year!, month! - 1, day!);
  let candidate = desiredWallClock;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const representedWallClock = Date.UTC(
      parts["year"]!,
      parts["month"]! - 1,
      parts["day"]!,
      parts["hour"]!,
      parts["minute"]!,
      parts["second"]!,
    );
    candidate = desiredWallClock - (representedWallClock - candidate);
  }
  const resolved = zonedParts(new Date(candidate), timeZone);
  if (
    resolved["year"] !== year
    || resolved["month"] !== month
    || resolved["day"] !== day
    || resolved["hour"] !== 0
    || resolved["minute"] !== 0
    || resolved["second"] !== 0
  ) throw new Error("The organization day boundary could not be determined.");
  return new Date(candidate).toISOString();
}

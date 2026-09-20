type Row = Readonly<Record<string, unknown>>;

/** Next matching operational date, respecting the template's exclusive end. */
export function nextStandingOrderDate(today: string, effectiveFrom: string, effectiveUntil: string | null, weekday: number): string | undefined {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  try {
    if (!isDate(today) || !isDate(effectiveFrom) || (effectiveUntil !== null && !isDate(effectiveUntil)) || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return;
    const date = new Date(`${today > effectiveFrom ? today : effectiveFrom}T00:00:00Z`);
    const currentWeekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + (weekday - currentWeekday + 7) % 7);
    const value = date.toISOString().slice(0, 10);
    return effectiveUntil !== null && value >= effectiveUntil ? undefined : value;
  } catch { return; }
}

export function canReviseOrder(kind: string, status: unknown): boolean {
  return kind === "planned_order" ? status === "published" : kind === "standing_order" && (status === "published" || status === "retired");
}

/** Copy business facts into a new revision; never reuse mutable line identities. */
export function copiedOrderLines(rows: readonly Row[], kind: "revision" | "template", newID: () => string) {
  return [...rows].sort((a, b) => Number(a["display_order"]) - Number(b["display_order"])).map((row) => ({
    id: newID(), productID: String(row["product_id"]), quantity: String(row["planned_quantity"]),
    sourceID: kind === "template" ? String(row["id"]) : String(row["source_standing_order_line_id"] ?? ""),
  }));
}

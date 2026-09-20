/** An omitted page is the first page; malformed or repeated values are invalid. */
export function officePage(value: string | readonly string[] | undefined): number | undefined {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,4}$/.test(value)) return undefined;
  const page = Number(value);
  return page <= 10_000 ? page : undefined;
}

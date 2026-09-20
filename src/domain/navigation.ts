export function safeOfficeDestination(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return "/office";
  return /^\/office(?:\/[a-zA-Z0-9_-]+)*$/.test(value) ? value : "/office";
}


import { canonicalUUIDPattern } from "./office-commands.ts";

export function parseDriverDownload(form: FormData) {
  const text = (name: string) => {
    const values = form.getAll(name);
    return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : undefined;
  };
  const requestID = text("request_id");
  const packageID = text("work_package_id");
  const routeID = text("route_id");
  const deviceID = text("device_id");
  const expectedVersion = text("expected_version");
  const reason = text("reason");
  if (![requestID, packageID, routeID, deviceID].every((id) => id && canonicalUUIDPattern.test(id))
    || !expectedVersion || !/^[1-9]\d{0,18}$/.test(expectedVersion) || BigInt(expectedVersion) > 9_223_372_036_854_775_807n
    || !reason || reason.length > 1000 || text("confirmed") !== "yes") return undefined;
  return { requestID: requestID!, packageID: packageID!, routeID: routeID!, deviceID: deviceID!, expectedVersion, reason };
}

/** Only these preparation diagnostics are safe, deliberate user-facing messages. */
export function driverDownloadFailure(code?: string, message?: string): string {
  const messages: Readonly<Record<string, string>> = {
    "prepare downloads for today or tomorrow": "Prepare this download on the route day or the day before, using your business time zone.",
    "publish settings effective on the route date": "Publish organization settings that cover this route's service date.",
    "download requires a planned shift assigned to this device": "Choose the phone assigned to this planned load. Review the load record if its device or state has changed.",
    "registered active driver device is required": "The driver must sign in on this phone first. Refresh this page to see registered phones.",
    "this shift already has a prepared download; review existing device work": "This shift already has a prepared download. Review the download history and the driver's pending work.",
    "device already has a download for this service date": "This phone already has a route download for that date. Review its existing assignment.",
    "publish sale and return prices for every catalogue product and assigned shop": "Pricing is incomplete. Publish sale and return prices for every active product at the assigned shops, effective on the route date.",
    "starting load requires active products and a complete expected load": "Complete the expected load and check that all loaded products are active.",
    "all assigned stops, customers and plans must be ready for download": "Check that the route's shops and customers are active and its daily orders are published for the same date.",
    "download exceeds 5000 items; reduce catalogue or route size": "This download exceeds 5,000 records. Reduce the active catalogue or split the route before preparing it.",
  };
  if (message && messages[message]) return messages[message];
  if (code === "40001") return "The route changed since you opened it. Reload and review the latest route before preparing its download.";
  if (code === "42501") return "Your current account cannot prepare driver downloads.";
  if (code === "23514") return "A download dependency is missing or has changed. Review the route, published plans, load, prices and tax revisions, then retry.";
  return "The preparation result could not be confirmed. Retry these same details to confirm it safely.";
}

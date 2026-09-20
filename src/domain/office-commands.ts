export const canonicalUUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const maximumReasonLength = 500;
const maximumReferenceLength = 250;

function requiredString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalString(formData: FormData, name: string): string | null | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalUUID(formData: FormData, name: string): string | undefined {
  const value = requiredString(formData, name)?.toLowerCase();
  return value && canonicalUUIDPattern.test(value) ? value : undefined;
}

function reason(formData: FormData): string | undefined {
  const value = requiredString(formData, "reason");
  return value && value.length <= maximumReasonLength ? value : undefined;
}

export const managedEntityTypes = ["product", "customer_account", "shop_location"] as const;
export type ManagedEntityType = (typeof managedEntityTypes)[number];

export type EntityActiveInputResult =
  | Readonly<{
      ok: true;
      requestID: string;
      entityID: string;
      entityType: ManagedEntityType;
      isActive: boolean;
      reason: string;
    }>
  | Readonly<{ ok: false }>;

export function validateEntityActiveInput(formData: FormData): EntityActiveInputResult {
  const requestID = canonicalUUID(formData, "request_id");
  const entityID = canonicalUUID(formData, "entity_id");
  const rawEntityType = requiredString(formData, "entity_type");
  const rawActive = formData.get("is_active");
  const changeReason = reason(formData);
  if (
    !requestID
    || !entityID
    || !rawEntityType
    || !managedEntityTypes.some((candidate) => candidate === rawEntityType)
    || (rawActive !== "true" && rawActive !== "false")
    || !changeReason
    || formData.get("confirm_entity_change") !== "change"
  ) return { ok: false };
  return {
    ok: true,
    requestID,
    entityID,
    entityType: rawEntityType as ManagedEntityType,
    isActive: rawActive === "true",
    reason: changeReason,
  };
}

export type DeliveryFinalizationInputResult =
  | Readonly<{ ok: true; requestID: string; deliveryID: string }>
  | Readonly<{ ok: false }>;

export function validateDeliveryFinalizationInput(formData: FormData): DeliveryFinalizationInputResult {
  const requestID = canonicalUUID(formData, "request_id");
  const deliveryID = canonicalUUID(formData, "delivery_id");
  if (!requestID || !deliveryID || formData.get("confirm_finalization") !== "issue") return { ok: false };
  return { ok: true, requestID, deliveryID };
}

export const paymentStatuses = ["unpaid", "pending", "partially_paid", "paid", "overdue", "voided"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

const paymentTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  unpaid: ["pending", "partially_paid", "paid", "overdue", "voided"],
  pending: ["partially_paid", "paid", "voided"],
  partially_paid: ["paid", "voided"],
  paid: ["voided"],
  overdue: ["partially_paid", "paid", "voided"],
  voided: [],
};

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && paymentStatuses.some((candidate) => candidate === value);
}

export function allowedPaymentTransitions(currentStatus: PaymentStatus): readonly PaymentStatus[] {
  return paymentTransitions[currentStatus];
}

export type PaymentStatusInputResult =
  | Readonly<{
      ok: true;
      requestID: string;
      paymentID: string;
      newStatus: PaymentStatus;
      evidenceReference: string | null;
      reason: string;
    }>
  | Readonly<{ ok: false }>;

export function validatePaymentStatusInput(formData: FormData): PaymentStatusInputResult {
  const requestID = canonicalUUID(formData, "request_id");
  const paymentID = canonicalUUID(formData, "payment_id");
  const rawStatus = requiredString(formData, "new_status");
  const evidenceReference = optionalString(formData, "evidence_reference");
  const changeReason = reason(formData);
  if (
    !requestID
    || !paymentID
    || !isPaymentStatus(rawStatus)
    || evidenceReference === undefined
    || (evidenceReference?.length ?? 0) > maximumReferenceLength
    || !changeReason
    || formData.get("confirm_payment_status") !== "change"
  ) return { ok: false };
  return { ok: true, requestID, paymentID, newStatus: rawStatus, evidenceReference, reason: changeReason };
}

export const officialCorrectionKinds = ["void", "replacement", "credit"] as const;
export type OfficialCorrectionKind = (typeof officialCorrectionKinds)[number];

const int64Maximum = 9_223_372_036_854_775_807n;
const signedIntegerPattern = /^-?(0|[1-9]\d{0,18})$/;

function signedMinorUnits(formData: FormData, name: string): bigint | undefined {
  const value = requiredString(formData, name);
  if (!value || !signedIntegerPattern.test(value)) return undefined;
  const amount = BigInt(value);
  return amount >= -int64Maximum && amount <= int64Maximum ? amount : undefined;
}

export type FinancialCorrectionInputResult =
  | Readonly<{
      ok: true;
      requestID: string;
      correctionID: string;
      originalDeliveryID: string;
      originalFinancialDocumentID: string;
      replacementDeliveryID: string | null;
      kind: OfficialCorrectionKind;
      netDeltaMinor: string;
      taxDeltaMinor: string;
      grossDeltaMinor: string;
      reason: string;
      approvalReference: string | null;
    }>
  | Readonly<{ ok: false }>;

export function validateFinancialCorrectionInput(formData: FormData): FinancialCorrectionInputResult {
  const requestID = canonicalUUID(formData, "request_id");
  const correctionID = canonicalUUID(formData, "correction_id");
  const originalDeliveryID = canonicalUUID(formData, "original_delivery_id");
  const originalFinancialDocumentID = canonicalUUID(formData, "original_financial_document_id");
  const rawReplacementID = optionalString(formData, "replacement_delivery_id");
  const replacementDeliveryID = rawReplacementID === null ? null : rawReplacementID?.toLowerCase();
  const rawKind = requiredString(formData, "kind");
  const netDelta = signedMinorUnits(formData, "net_delta_minor");
  const taxDelta = signedMinorUnits(formData, "tax_delta_minor");
  const grossDelta = signedMinorUnits(formData, "gross_delta_minor");
  const correctionReason = reason(formData);
  const approvalReference = optionalString(formData, "approval_reference");
  if (
    !requestID
    || !correctionID
    || !originalDeliveryID
    || !originalFinancialDocumentID
    || replacementDeliveryID === undefined
    || (replacementDeliveryID !== null && !canonicalUUIDPattern.test(replacementDeliveryID))
    || replacementDeliveryID === originalDeliveryID
    || !rawKind
    || !officialCorrectionKinds.some((candidate) => candidate === rawKind)
    || (rawKind === "replacement") !== (replacementDeliveryID !== null)
    || netDelta === undefined
    || taxDelta === undefined
    || grossDelta === undefined
    || netDelta > 0n
    || taxDelta > 0n
    || grossDelta >= 0n
    || netDelta + taxDelta !== grossDelta
    || !correctionReason
    || approvalReference === undefined
    || (approvalReference?.length ?? 0) > maximumReferenceLength
    || formData.get("confirm_correction") !== "issue"
  ) return { ok: false };
  return {
    ok: true,
    requestID,
    correctionID,
    originalDeliveryID,
    originalFinancialDocumentID,
    replacementDeliveryID,
    kind: rawKind as OfficialCorrectionKind,
    netDeltaMinor: netDelta.toString(),
    taxDeltaMinor: taxDelta.toString(),
    grossDeltaMinor: grossDelta.toString(),
    reason: correctionReason,
    approvalReference,
  };
}

export function isOfficeCommandResult(
  value: unknown,
  command: string,
  requestID: string,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Readonly<Record<string, unknown>>;
  return result["contract"] === "wholesale.office-command-result"
    && result["contract_version"] === 1
    && result["command"] === command
    && result["request_id"] === requestID;
}

export function isFinancialFinalizationResult(
  value: unknown,
  expected: Readonly<{ deliveryID?: string; correctionID?: string; documentKind: "invoice" | "credit_note" }>,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Readonly<Record<string, unknown>>;
  return result["contract"] === "wholesale.financial-finalization-result"
    && result["contract_version"] === 1
    && (expected.deliveryID === undefined || result["delivery_id"] === expected.deliveryID)
    && (expected.correctionID === undefined || result["correction_id"] === expected.correctionID)
    && result["document_kind"] === expected.documentKind
    && typeof result["financial_document_id"] === "string"
    && canonicalUUIDPattern.test(result["financial_document_id"])
    && typeof result["artifact_id"] === "string"
    && canonicalUUIDPattern.test(result["artifact_id"])
    && ["pending", "rendering", "stored", "failed"].includes(String(result["artifact_state"]));
}

import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "../src/domain/csv.ts";
import { isCalendarDate, localISODate, nextCalendarDate, zonedStartOfDayISO } from "../src/domain/dates.ts";
import { validateDeviceProvisionInput, validateDeviceRevocationInput } from "../src/domain/device-management.ts";
import { safeOfficeDestination } from "../src/domain/navigation.ts";
import {
  allowedPaymentTransitions,
  isFinancialFinalizationResult,
  isOfficeCommandResult,
  validateDeliveryFinalizationInput,
  validateEntityActiveInput,
  validateFinancialCorrectionInput,
  validatePaymentStatusInput,
} from "../src/domain/office-commands.ts";
import { displayValue, exactMinorUnits, titleForColumn } from "../src/domain/presentation.ts";

test("money presentation preserves exact signed minor units", () => {
  assert.equal(exactMinorUnits("123456789012345678", "GBP"), "£1,234,567,890,123,456.78");
  assert.equal(exactMinorUnits(-501, "EUR"), "−EUR 5.01");
  assert.equal(exactMinorUnits("1.2", "GBP"), "—");
  assert.equal(displayValue("tax_rate_basis_points", 2000, {}), "20%");
  assert.equal(displayValue("is_active", false, {}), "No");
  assert.equal(displayValue("status", "in_progress", {}), "in progress");
  assert.equal(displayValue("sku", "WHITE_LOAF", {}), "WHITE_LOAF");
  assert.equal(titleForColumn("recorded_at_server"), "Recorded At Server");
});

test("report date validation rejects impossible calendar dates", () => {
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2027-02-29"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("01-01-2026"), false);
  assert.equal(localISODate(new Date("2026-01-01T00:30:00.000Z"), "America/Los_Angeles"), "2025-12-31");
  assert.equal(nextCalendarDate("2028-02-29"), "2028-03-01");
  assert.equal(zonedStartOfDayISO("2026-07-01", "Europe/London"), "2026-06-30T23:00:00.000Z");
  assert.equal(zonedStartOfDayISO("2026-12-01", "Europe/London"), "2026-12-01T00:00:00.000Z");
});

test("CSV cells quote values and neutralize spreadsheet formula prefixes", () => {
  assert.equal(csvCell("plain"), '"plain"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("=2+2"), '"\'=2+2"');
  assert.equal(csvCell("  @SUM(A1)"), '"\'  @SUM(A1)"');
  assert.equal(csvCell("\t=cmd"), '"\'\t=cmd"');
});

test("driver device inputs accept only bounded canonical UUID contracts", () => {
  const provision = new FormData();
  provision.set("user_id", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
  provision.set("installation_id", "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB");
  provision.set("display_name", " Driver phone ");
  assert.deepEqual(validateDeviceProvisionInput(provision), {
    ok: true,
    userID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    installationID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    displayName: "Driver phone",
  });

  provision.set("installation_id", "../another-tenant");
  assert.deepEqual(validateDeviceProvisionInput(provision), { ok: false });

  const revocation = new FormData();
  revocation.set("request_id", "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  revocation.set("device_id", "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  revocation.set("reason", "Device was returned to the office");
  revocation.set("confirm_revocation", "revoke");
  assert.deepEqual(validateDeviceRevocationInput(revocation), {
    ok: true,
    requestID: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    deviceID: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    reason: "Device was returned to the office",
  });
  revocation.set("request_id", "not-an-id");
  assert.deepEqual(validateDeviceRevocationInput(revocation), { ok: false });
  revocation.set("request_id", "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  revocation.delete("confirm_revocation");
  assert.deepEqual(validateDeviceRevocationInput(revocation), { ok: false });
});

test("office entity and finalization commands accept only exact confirmed allowlisted input", () => {
  const entity = new FormData();
  entity.set("request_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  entity.set("entity_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  entity.set("entity_type", "product");
  entity.set("is_active", "false");
  entity.set("reason", "No longer supplied");
  entity.set("confirm_entity_change", "change");
  assert.deepEqual(validateEntityActiveInput(entity), {
    ok: true,
    requestID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    entityID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    entityType: "product",
    isActive: false,
    reason: "No longer supplied",
  });
  entity.set("entity_type", "financial_documents");
  assert.deepEqual(validateEntityActiveInput(entity), { ok: false });

  const delivery = new FormData();
  delivery.set("request_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  delivery.set("delivery_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  delivery.set("confirm_finalization", "issue");
  assert.deepEqual(validateDeliveryFinalizationInput(delivery), {
    ok: true,
    requestID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    deliveryID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  delivery.set("confirm_finalization", "no");
  assert.deepEqual(validateDeliveryFinalizationInput(delivery), { ok: false });
});

test("payment status input follows the database's one-way transition graph", () => {
  assert.deepEqual(allowedPaymentTransitions("pending"), ["partially_paid", "paid", "voided"]);
  assert.deepEqual(allowedPaymentTransitions("voided"), []);

  const payment = new FormData();
  payment.set("request_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  payment.set("payment_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  payment.set("new_status", "paid");
  payment.set("evidence_reference", "BANK-2026-001");
  payment.set("reason", "Matched to the bank settlement");
  payment.set("confirm_payment_status", "change");
  assert.deepEqual(validatePaymentStatusInput(payment), {
    ok: true,
    requestID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    paymentID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    newStatus: "paid",
    evidenceReference: "BANK-2026-001",
    reason: "Matched to the bank settlement",
  });
  payment.set("new_status", "refunded");
  assert.deepEqual(validatePaymentStatusInput(payment), { ok: false });
});

test("financial corrections require official kinds, signed int64 arithmetic and deliberate confirmation", () => {
  const correction = new FormData();
  correction.set("request_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  correction.set("correction_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  correction.set("original_delivery_id", "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  correction.set("original_financial_document_id", "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  correction.set("replacement_delivery_id", "");
  correction.set("kind", "credit");
  correction.set("net_delta_minor", "-100");
  correction.set("tax_delta_minor", "-20");
  correction.set("gross_delta_minor", "-120");
  correction.set("reason", "Approved pricing adjustment");
  correction.set("approval_reference", "APPROVAL-42");
  correction.set("confirm_correction", "issue");
  assert.deepEqual(validateFinancialCorrectionInput(correction), {
    ok: true,
    requestID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    correctionID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    originalDeliveryID: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    originalFinancialDocumentID: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    replacementDeliveryID: null,
    kind: "credit",
    netDeltaMinor: "-100",
    taxDeltaMinor: "-20",
    grossDeltaMinor: "-120",
    reason: "Approved pricing adjustment",
    approvalReference: "APPROVAL-42",
  });
  correction.set("gross_delta_minor", "-119");
  assert.deepEqual(validateFinancialCorrectionInput(correction), { ok: false });
  correction.set("gross_delta_minor", "-120");
  correction.set("kind", "replacement");
  assert.deepEqual(validateFinancialCorrectionInput(correction), { ok: false });
  correction.set("net_delta_minor", "-9223372036854775808");
  correction.set("kind", "credit");
  assert.deepEqual(validateFinancialCorrectionInput(correction), { ok: false });
});

test("RPC response guards reject contract confusion", () => {
  const requestID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(isOfficeCommandResult({
    contract: "wholesale.office-command-result",
    contract_version: 1,
    command: "admin.entity.set_active",
    request_id: requestID,
  }, "admin.entity.set_active", requestID), true);
  assert.equal(isOfficeCommandResult({
    contract: "wholesale.office-command-result",
    contract_version: 1,
    command: "admin.device.revoke",
    request_id: requestID,
  }, "admin.entity.set_active", requestID), false);
  assert.equal(isFinancialFinalizationResult({
    contract: "wholesale.financial-finalization-result",
    contract_version: 1,
    correction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    document_kind: "credit_note",
    financial_document_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    artifact_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    artifact_state: "pending",
  }, { correctionID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", documentKind: "credit_note" }), true);
});

test("post-login navigation accepts only local office paths", () => {
  assert.equal(safeOfficeDestination("/office/routes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "/office/routes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(safeOfficeDestination("https://evil.example/office"), "/office");
  assert.equal(safeOfficeDestination("//evil.example"), "/office");
  assert.equal(safeOfficeDestination("/office/../access-denied"), "/office");
  assert.equal(safeOfficeDestination(["/office", "/office/routes"]), "/office");
});

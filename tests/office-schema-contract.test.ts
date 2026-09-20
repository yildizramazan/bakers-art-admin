import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { detailRelationsForRole } from "../src/domain/office-details.ts";
import { officeSections } from "../src/domain/office.ts";
import { reportDefinitions } from "../src/domain/reports.ts";

function migrationSQL(): string {
  const migrationDirectory = resolve(process.cwd(), "../supabase/migrations");
  return readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
    .join("\n");
}

function migrationTableColumns(): ReadonlyMap<string, ReadonlySet<string>> {
  const sql = migrationSQL();
  const tables = new Map<string, ReadonlySet<string>>();
  const pattern = /^create table public\.([a-z][a-z0-9_]*) \((.*?)^\);$/gms;
  for (const match of sql.matchAll(pattern)) {
    const table = match[1];
    const body = match[2];
    if (!table || !body) continue;
    const columns = new Set<string>();
    for (const line of body.split("\n")) {
      const column = /^ {4}([a-z][a-z0-9_]*)\s+/.exec(line)?.[1];
      if (column && column !== "constraint" && column !== "primary" && column !== "unique") columns.add(column);
    }
    tables.set(table, columns);
  }
  // Report views use simple named projections. Split only top-level commas so
  // coalesce/case/casts retain their explicit output alias.
  for (const match of sql.matchAll(/^create view public\.([a-z][a-z0-9_]*) with \([^\n]*\) as\nselect (.*?)\nfrom /gms)) {
    let depth = 0, quoted = false, start = 0;
    const projections: string[] = [], body = match[2]!;
    for (let index = 0; index < body.length; index++) {
      const char = body[index];
      if (char === "'") quoted = !quoted;
      if (!quoted) {
        if (char === "(") depth++;
        if (char === ")") depth--;
        if (char === "," && depth === 0) { projections.push(body.slice(start, index)); start = index + 1; }
      }
    }
    projections.push(body.slice(start));
    const columns = projections.map((value) => /\bas\s+([a-z][a-z0-9_]*)\s*$/i.exec(value)?.[1]
      ?? /^\s*[a-z_]+\.([a-z][a-z0-9_]*)\s*$/.exec(value)?.[1]);
    assert.ok(columns.every(Boolean), `View ${match[1]} requires named report projections`);
    tables.set(match[1]!, new Set(columns as string[]));
  }
  return tables;
}

function assertColumns(tables: ReadonlyMap<string, ReadonlySet<string>>, table: string, columns: readonly string[], context: string) {
  const available = tables.get(table);
  assert.ok(available, `${context}: table ${table} is not created by migrations`);
  for (const column of columns) assert.ok(available.has(column), `${context}: ${table}.${column} is not created by migrations`);
}

test("every allowlisted office query matches a migrated table and column", () => {
  const tables = migrationTableColumns();
  for (const section of officeSections) {
    const tenantColumn = section.table === "organizations" ? "id" : "organization_id";
    assertColumns(tables, section.table, ["id", tenantColumn, section.orderBy, ...section.columns, ...(section.detailColumns ?? [])], `section ${section.slug}`);
    if (section.documentType) assertColumns(tables, section.table, ["kind"], `section ${section.slug}`);
    for (const relation of detailRelationsForRole(section.slug, "owner_admin")) {
      assertColumns(tables, section.table, [relation.parentColumn], `relation ${section.slug}/${relation.slug} parent`);
      assertColumns(tables, relation.table, ["id", "organization_id", relation.foreignColumn, relation.orderBy, ...relation.columns], `relation ${section.slug}/${relation.slug}`);
    }
  }
  for (const report of reportDefinitions) {
    const filterColumns = (report.filters ?? []).map((filter) => filter.column);
    assertColumns(tables, report.table, ["id", "organization_id", report.dateColumn, ...filterColumns, ...report.sourceColumns], `report ${report.slug}`);
  }
});

test("every mutating office form maps to an authenticated audited RPC contract", () => {
  const sql = migrationSQL()
    .replaceAll(/\s+/g, " ")
    .replaceAll("( ", "(")
    .replaceAll(" )", ")");
  const signatures = [
    "finalize_office_delivery(uuid, uuid, uuid)",
    "admin_set_entity_active(uuid, uuid, text, uuid, boolean, text)",
    "admin_revoke_device(uuid, uuid, uuid, text)",
    "admin_update_payment_status(uuid, uuid, uuid, public.payment_status, text, text)",
    "admin_issue_financial_correction(uuid, uuid, uuid, uuid, uuid, uuid, public.correction_kind, bigint, bigint, bigint, text, text)",
    "admin_save_master_data(uuid, uuid, text, uuid, bigint, jsonb)",
    "admin_manage_policy_revision(uuid, uuid, text, uuid, bigint, text, jsonb)",
    "admin_retire_policy_revision(uuid, uuid, text, uuid, bigint, jsonb)",
    "admin_update_organization(uuid, uuid, bigint, jsonb)",
    "admin_manage_order_revision(uuid, uuid, text, uuid, bigint, text, jsonb)",
    "admin_manage_route(uuid, uuid, uuid, bigint, text, jsonb)",
    "admin_manage_route_stop(uuid, uuid, uuid, bigint, text, jsonb)",
    "admin_manage_shift_load(uuid, uuid, uuid, bigint, text, jsonb)",
    "admin_manage_membership(uuid, uuid, uuid, bigint, text, jsonb)",
  ];
  for (const signature of signatures) {
    assert.ok(sql.includes(`revoke all on function public.${signature} from public, anon, authenticated, service_role`), `missing closed default privileges for ${signature}`);
    assert.ok(sql.includes(`grant execute on function public.${signature} to authenticated`), `missing authenticated execution grant for ${signature}`);
  }
});

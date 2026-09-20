# Wholesale Office

The Next.js office app runs against real local Supabase Auth, PostgreSQL and
private Storage with fictional business data. Owner/admin and accountant access
are enforced at the server and database boundaries. No service-role key belongs
in this app. Current evidence: [validation](../docs/validation-results.md) and
[all 89 requirements](../docs/v1-acceptance-matrix.md).

## Working workflows

- Owner management for business details, people/devices, products/barcodes,
  customers/shops, prices/tax, standing/daily orders, routes/stops and loads.
- Draft driver assignment, audited route copying, publish and driver download.
  Published identities are locked so downloaded work cannot be silently replaced.
- Delivery, return, cash, sync-exception and audit inspection; protected POD access.
- Official invoices/credits, authorized correction and void, bounded original
  unpaid on-account price replacement, and explicit original-return review.
- Evidence-backed payment status changes. External payments stay pending until
  authorized settlement evidence is recorded.
- Fourteen owner and twelve accountant CSV exports. Each uses a consistent,
  caller-authorized snapshot, exact integer strings and a 5,000-source-row limit.
  Pending return credit and issued financial amounts are distinct.

## Local setup

From the repository root, source `scripts/dev-env.sh`. In this directory run
`npm ci`, copy `.env.development.example` to the ignored `.env.local`, fill its
local URL/public-key configuration, then run `npm run dev`. Do not overwrite an
existing local configuration or reset a populated demo database.

The running preview is `http://localhost:3000/office`. Locally generated fictional
credentials are kept in `../artifacts/backend/development-credentials.json`,
mode 0600. They are excluded from Git and the portable handoff.

## Verification and boundaries

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
Latest office unit count: **75 passing tests**. Real browser and HTTP acceptance
are documented separately. Read-only preserved-data/report verifiers are under
`scripts/`; the generic office preparation verifier creates additional fixtures
and should not be mistaken for a read-only check.

Every action reauthenticates and authorizes, validates exact input, carries a
recoverable command identity and rejects stale versions. Private file links
recheck tenant/document/path/state before granting short-lived retrieval. Normal
amount entry uses pounds; server financial contracts retain exact minor units.

Local acceptance is not a hosted deployment or complete physical accessibility
review. See [deployment](../docs/deployment.md) for the remaining launch gates.

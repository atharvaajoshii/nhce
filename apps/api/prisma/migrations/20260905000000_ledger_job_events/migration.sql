-- Minimal, additive-only change: extend the already-live "LedgerEntry" table's
-- LedgerEventType enum with two job-level event values needed to log real
-- job creation / job activation events (financial ledger feature). This does
-- NOT touch any existing rows, columns, constraints, or enum values, and is
-- fully additive/non-destructive.

ALTER TYPE "LedgerEventType" ADD VALUE 'JOB_CREATED';
ALTER TYPE "LedgerEventType" ADD VALUE 'JOB_ACTIVATED';

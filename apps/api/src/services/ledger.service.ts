/**
 * @file ledger.service.ts
 * @description Append-only financial/event ledger writer.
 *
 * This is a thin observability layer: it records what real business
 * operations (job/milestone/escrow/payment) already did, using the existing
 * `LedgerEntry` table. It is NEVER the source of truth for payments or job
 * state, and a ledger-write failure must never be allowed to fail, alter, or
 * roll back the real operation it is observing — every write here is
 * best-effort and swallows its own errors (logging them for later
 * detection instead of throwing).
 */

import { Prisma, LedgerEventType, LedgerStatus } from '@prisma/client';
import { prisma } from '../config/db.config';

// Known mock/simulated blockchain tx hash + address sentinels used by
// escrow.service.ts when ESCROW_FACTORY_ADDRESS is unconfigured or a job has
// no real deployed vault. A ledger entry must never present these as if they
// were a real on-chain hash.
const MOCK_TX_HASHES = new Set<string>([
  '0x' + 'a'.repeat(64), // mocked vault creation tx hash
  '0x' + 'b'.repeat(64), // mocked milestone release tx hash
  '0x' + 'c'.repeat(64), // mocked dispute-raise tx hash
]);
const MOCK_ESCROW_ADDRESS = '0x' + '1'.repeat(40);

/** True if the given hash is a known simulated/mock hash, not a real on-chain tx hash. */
export function isMockTxHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  return MOCK_TX_HASHES.has(hash.toLowerCase());
}

/** True if the given escrow address is the mock sentinel address used when no real vault exists. */
export function isMockEscrowAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return address.toLowerCase() === MOCK_ESCROW_ADDRESS;
}

export interface RecordLedgerEventInput {
  jobId?: string | null;
  milestoneId?: string | null;
  escrowId?: string | null;
  transactionId?: string | null;
  eventType: LedgerEventType;
  status: LedgerStatus;
  actorId?: string | null;
  actorRole?: string | null;
  amount?: number | null;
  currency?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  description: string;
  details?: Record<string, unknown> | null;
  blockchainTransactionHash?: string | null;
  /**
   * Deterministic key used to dedupe this exact event (the table has a real
   * unique index on dedupeKey). Callers should pass a key that is stable
   * across retries of the same logical event and distinct across genuinely
   * different events.
   */
  dedupeKey: string;
}

/**
 * Records one ledger event. Best-effort: never throws. On failure, logs
 * loudly to the server console (with the dedupeKey/eventType) so a missed
 * ledger write can be found later, but never affects the caller's real
 * business transaction.
 */
export async function recordLedgerEvent(input: RecordLedgerEventInput): Promise<void> {
  try {
    // Guard against ever persisting a mock hash as if it were real.
    const blockchainTransactionHash = isMockTxHash(input.blockchainTransactionHash)
      ? null
      : input.blockchainTransactionHash ?? null;

    const details: Record<string, unknown> = { ...(input.details || {}) };
    if (input.jobId) details.jobId = input.jobId;

    await prisma.ledgerEntry.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {}, // append-only: an existing entry is never modified
      create: {
        escrowId: input.escrowId ?? null,
        milestoneId: input.milestoneId ?? null,
        transactionId: input.transactionId ?? null,
        eventType: input.eventType,
        status: input.status,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        description: input.description,
        details: Object.keys(details).length > 0 ? (details as Prisma.InputJsonValue) : Prisma.JsonNull,
        blockchainTransactionHash,
        dedupeKey: input.dedupeKey,
      },
    });
  } catch (err) {
    // Never let a ledger-recording failure surface to or affect the caller.
    console.error(
      `[ledger] FAILED to record event type=${input.eventType} dedupeKey=${input.dedupeKey}:`,
      err
    );
  }
}

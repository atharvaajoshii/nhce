"use client";

/**
 * @file ledgerApi.ts
 * @description Typed client for the admin-only financial ledger endpoints
 * (/api/admin/ledger*). Read-only — the ledger is written to only by
 * server-side hooks on the real job/milestone/escrow controllers. Mirrors
 * lib/adminApi.ts conventions; requires a real ADMIN-role JWT.
 */

import { apiFetch } from "./api";

export type LedgerEventType =
  | "JOB_CREATED"
  | "JOB_ACTIVATED"
  | "ESCROW_CREATED"
  | "ESCROW_FUNDED"
  | "ESCROW_STATUS_CHANGED"
  | "ESCROW_CANCELLED"
  | "ESCROW_COMPLETED"
  | "MILESTONE_CREATED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "MILESTONE_REJECTED"
  | "MILESTONE_RELEASED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELLED"
  | "PAYMENT_REFUNDED"
  | "BLOCKCHAIN_PENDING"
  | "BLOCKCHAIN_CONFIRMED"
  | "BLOCKCHAIN_FAILED";

export type LedgerStatus = "PENDING" | "PROCESSING" | "CONFIRMED" | "FAILED" | "CANCELLED";

export interface LedgerEntry {
  id: string;
  escrowId: string | null;
  milestoneId: string | null;
  transactionId: string | null;
  eventType: LedgerEventType;
  status: LedgerStatus;
  actorId: string | null;
  actorRole: string | null;
  amount: number | null;
  currency: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  description: string;
  details: Record<string, unknown> | null;
  blockchainTransactionHash: string | null;
  dedupeKey: string | null;
  createdAt: string;
  // Enriched at read time (not stored columns)
  jobId: string | null;
  jobTitle: string | null;
  milestoneTitle: string | null;
  actorLabel: string | null;
}

export interface LedgerSummary {
  total: number;
  confirmed: number;
  pendingOrProcessing: number;
  failed: number;
  cancelled: number;
  jobsRepresented: number;
}

export function fetchLedgerSummary(token: string): Promise<LedgerSummary> {
  return apiFetch("/admin/ledger/summary", { token });
}

export interface LedgerListFilters {
  jobId?: string;
  eventType?: string;
  status?: string;
  milestoneId?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

export function fetchLedgerEntries(
  token: string,
  filters: LedgerListFilters = {}
): Promise<{ entries: LedgerEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (filters.jobId) params.set("jobId", filters.jobId);
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.status) params.set("status", filters.status);
  if (filters.milestoneId) params.set("milestoneId", filters.milestoneId);
  if (filters.q) params.set("q", filters.q);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  const qs = params.toString();
  return apiFetch(`/admin/ledger${qs ? `?${qs}` : ""}`, { token });
}

export function fetchLedgerEntry(token: string, id: string): Promise<{ entry: LedgerEntry }> {
  return apiFetch(`/admin/ledger/${id}`, { token });
}

export interface LedgerJobTimeline {
  job: {
    id: string;
    title: string;
    status: string;
    budget: number;
    tokenSymbol: string;
    escrowAddress: string | null;
    client: { id: string; name: string | null; email: string | null } | null;
    freelancer: { id: string; name: string | null; email: string | null } | null;
  };
  entries: LedgerEntry[];
}

export function fetchLedgerJobTimeline(token: string, jobId: string): Promise<LedgerJobTimeline> {
  return apiFetch(`/admin/ledger/jobs/${jobId}`, { token });
}

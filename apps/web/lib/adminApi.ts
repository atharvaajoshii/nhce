"use client";

/**
 * @file adminApi.ts
 * @description Typed client for the admin console's real data endpoints
 * (/api/admin/*). Mirrors lib/api.ts conventions. Every call requires a real
 * ADMIN-role JWT — see AuthContext.login()'s admin-login exchange.
 */

import { apiFetch } from "./api";

/* ------------------------------ Overview ------------------------------ */

export interface AdminOverview {
  users: { total: number; clients: number; freelancers: number; jurors: number };
  jobs: { total: number; published: number; inProgress: number; completed: number };
  disputes: { total: number; open: number; voting: number; resolved: number };
  applications: { total: number };
  escrow: { lockedVolume: number; releasedVolume: number };
}

export function fetchAdminOverview(token: string): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/admin/overview", { token });
}

/* ------------------------------ Users ------------------------------ */

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  role: "CLIENT" | "FREELANCER" | "JUROR" | "ADMIN";
  rating: number;
  walletAddress: string | null;
  isPro: boolean;
  jobsPostedCount: number;
  jobsAppliedCount: number;
  onboardingCompleted: boolean;
  createdAt: string;
}

export function fetchAdminUsers(
  token: string,
  opts: { limit?: number; cursor?: string } = {}
): Promise<{ users: AdminUserRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return apiFetch(`/admin/users${qs ? `?${qs}` : ""}`, { token });
}

/* ------------------------------ Disputes ------------------------------ */

export type JurorVoteChoice = "FREELANCER_FAVOR" | "CLIENT_FAVOR";

interface DisputePartyDTO {
  id: string;
  name: string | null;
  email: string | null;
  walletAddress: string | null;
  rating?: number;
}

export interface AdminDisputeVote {
  jurorAddress: string;
  jurorName: string | null;
  choice: JurorVoteChoice;
  rewardClaimed: boolean;
  createdAt: string;
}

export interface AdminDispute {
  id: string;
  status: "OPEN" | "VOTING" | "RESOLVED";
  reason: string;
  evidenceUrls: string[];
  createdAt: string;
  job: {
    id: string;
    title: string;
    budget: number;
    tokenSymbol: string;
    client: DisputePartyDTO | null;
    freelancer: DisputePartyDTO | null;
  };
  milestone: { id: string; title: string; amount: number; status: string } | null;
  initiator: { id: string; name: string | null; email: string | null; role: string } | null;
  financials: {
    totalBudget: number;
    disputedAmount: number;
    alreadyReleased: number;
    remaining: number;
  };
  votes: AdminDisputeVote[];
  tally: { freelancerFavor: number; clientFavor: number; total: number };
}

export function fetchAdminDisputes(token: string): Promise<{ disputes: AdminDispute[] }> {
  return apiFetch("/admin/disputes", { token });
}

/** Cast a juror vote — the real, existing POST /api/disputes/:id/vote endpoint
 *  (open to any wallet-connected session, not admin-only). Requires the
 *  caller's account to have a linked walletAddress. */
export function castDisputeVote(
  token: string,
  disputeId: string,
  choice: JurorVoteChoice
): Promise<{ message: string; vote: unknown }> {
  return apiFetch(`/disputes/${disputeId}/vote`, {
    method: "POST",
    token,
    body: JSON.stringify({ choice }),
  });
}

export function resolveAdminDispute(
  token: string,
  disputeId: string
): Promise<{ message: string; outcome: JurorVoteChoice; tally: { freelancerFavor: number; clientFavor: number } }> {
  return apiFetch(`/admin/disputes/${disputeId}/resolve`, { method: "POST", token });
}

/* ------------------------------ Activity ------------------------------ */

export interface AdminActivityEvent {
  id: string;
  type: "JOB_POSTED" | "DISPUTE_OPENED" | "APPLICATION_SUBMITTED";
  title: string;
  actor: string;
  detail: string;
  amount?: number;
  timestamp: string;
}

export function fetchAdminActivity(token: string): Promise<{ activity: AdminActivityEvent[] }> {
  return apiFetch("/admin/activity", { token });
}

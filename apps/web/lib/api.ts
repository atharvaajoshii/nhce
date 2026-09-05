"use client";

/**
 * @file api.ts
 * @description Typed API client for the Dracarys marketplace backend.
 * Attaches the JWT from AuthContext's localStorage and normalizes errors.
 */

const getApiBase = () => {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
};

const API_BASE = getApiBase();

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ApiRequestOptions extends RequestInit {
  token?: string | null;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("w3hire_auth_token");
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/* ------------------------------ Types ------------------------------ */

export type JobStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "FREELANCER_SELECTED"
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

export type ApplicationStatus = "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED";

/** Real backend MilestoneStatus enum — DISPUTED and PROCESSING_AUTORELEASE exist
 *  in the schema but no current code path sets them (opening a dispute creates a
 *  separate Dispute record without changing the milestone's own status). */
export type MilestoneStatus =
  | "PENDING"
  | "SUBMITTED"
  | "VERIFYING"
  | "APPROVED"
  | "RELEASED"
  | "DISPUTED"
  | "PROCESSING_AUTORELEASE";

export interface Milestone {
  id: string;
  jobId: string;
  title: string;
  description: string;
  amount: number;
  deadline: string | null;
  deliverableLink: string | null;
  githubPrUrl: string | null;
  deploymentUrl: string | null;
  aiReviewScore: number | null;
  status: MilestoneStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string | null;
  rating: number;
  bio?: string | null;
  location?: string | null;
  portfolioLinks?: string[];
  createdAt?: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  tokenSymbol: string;
  skills: string[];
  deadline: string | null;
  escrowAddress: string | null;
  status: JobStatus;
  clientId: string;
  freelancerId: string | null;
  createdAt: string;
  updatedAt: string;
  client?: UserSummary;
  freelancer?: UserSummary | null;
  milestones?: Milestone[];
  _count?: { applications: number };
}

export interface JobApplication {
  id: string;
  jobId: string;
  freelancerId: string;
  pitch: string;
  requestedRate: number;
  deliveryDays: number;
  walletAddress: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  job?: Job;
  freelancer?: UserSummary;
}

export interface JobListResponse {
  jobs: Job[];
}

export interface ApplicationListResponse {
  applications: JobApplication[];
}

export type UserRole = "CLIENT" | "FREELANCER" | "JUROR" | "ADMIN";

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  walletAddress: string | null;
  bio: string | null;
  location: string | null;
  rating: number;
  portfolioLinks: string[];
  skills: string[];
  jobsPostedCount: number;
  jobsAppliedCount: number;
  onboardingCompleted: boolean;
  createdAt: string;
}

/* ------------------------------ Stablecoin tracker ------------------------------ */

export type StablecoinDataStatus = "LIVE" | "CACHED" | "FALLBACK";

export interface StablecoinMetadata {
  peg: string;
  pegTargetUsd: number | null;
  networks: string[];
  settlementRelevance: "HIGH" | "MEDIUM" | "LOW";
  settlementReadiness: "READY" | "CONDITIONAL" | "NOT_RECOMMENDED";
  notes?: string;
}

export interface StablecoinMarket {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  volume24h: number | null;
  lastUpdated: string | null;
  pegDeviation: number | null;
  metadata: StablecoinMetadata | null;
}

export interface StablecoinSummary {
  trackedCount: number;
  totalMarketCap: number;
  totalVolume24h: number;
}

export interface StablecoinMarketsResponse {
  source: string;
  dataStatus: StablecoinDataStatus;
  lastUpdated: string;
  isFallback: boolean;
  coins: StablecoinMarket[];
  summary: StablecoinSummary;
}

/* ------------------------------ API calls ------------------------------ */

export function fetchJobs(params: Record<string, string | number | undefined> = {}): Promise<JobListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") search.set(k, String(v));
  });
  const qs = search.toString();
  return apiFetch<JobListResponse>(`/jobs${qs ? `?${qs}` : ""}`);
}

export function fetchJob(id: string, token?: string | null): Promise<{ job: Job }> {
  return apiFetch<{ job: Job }>(`/jobs/${id}`, token ? { token } : {});
}

export function fetchMyJobs(token: string): Promise<JobListResponse> {
  return apiFetch<JobListResponse>("/jobs/my", { token });
}

export function fetchMyApplications(token: string): Promise<ApplicationListResponse> {
  return apiFetch<ApplicationListResponse>("/applications/my", { token });
}

export function fetchJobApplications(token: string, jobId: string): Promise<{ job: Job; applications: JobApplication[] }> {
  return apiFetch<{ job: Job; applications: JobApplication[] }>(`/jobs/${jobId}/applications`, { token });
}

export function createJob(token: string, body: Record<string, unknown>): Promise<{ message: string; job: Job }> {
  return apiFetch<{ message: string; job: Job }>("/jobs", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function updateJob(token: string, id: string, body: Record<string, unknown>): Promise<{ message: string; job: Job }> {
  return apiFetch<{ message: string; job: Job }>(`/jobs/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function deleteJob(token: string, id: string): Promise<{ message: string; id: string }> {
  return apiFetch<{ message: string; id: string }>(`/jobs/${id}`, {
    method: "DELETE",
    token,
  });
}

export function publishJob(token: string, id: string): Promise<{ message: string; job: Job }> {
  return apiFetch<{ message: string; job: Job }>(`/jobs/${id}/publish`, { method: "POST", token });
}

export function applyToJob(
  token: string,
  jobId: string,
  body: { pitch: string; requestedRate: number; deliveryDays: number }
): Promise<{ message: string; application: JobApplication }> {
  return apiFetch<{ message: string; application: JobApplication }>(`/jobs/${jobId}/applications`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function reviewApplication(token: string, jobId: string, applicationId: string): Promise<{ message: string; application: JobApplication }> {
  return apiFetch<{ message: string; application: JobApplication }>(`/jobs/${jobId}/applications/${applicationId}/review`, {
    method: "POST",
    token,
  });
}

export function rejectApplication(token: string, jobId: string, applicationId: string): Promise<{ message: string; application: JobApplication }> {
  return apiFetch<{ message: string; application: JobApplication }>(`/jobs/${jobId}/applications/${applicationId}/reject`, {
    method: "POST",
    token,
  });
}

export function selectFreelancer(token: string, jobId: string, applicationId: string): Promise<{ message: string; job: Job }> {
  return apiFetch<{ message: string; job: Job }>(`/jobs/${jobId}/select`, {
    method: "POST",
    token,
    body: JSON.stringify({ applicationId }),
  });
}

export function fundJobEscrow(
  token: string,
  jobId: string,
  escrowAddress: string,
  freelancerAddress?: string
): Promise<{ message: string; job: Job }> {
  return apiFetch<{ message: string; job: Job }>(`/jobs/${jobId}/fund`, {
    method: "POST",
    token,
    body: JSON.stringify({ escrowAddress, freelancerAddress }),
  });
}

export function fetchMyProjects(token: string): Promise<{ jobs: Job[] }> {
  return apiFetch<{ jobs: Job[] }>("/jobs/my-projects", { token });
}

export function submitMilestoneProof(
  token: string,
  milestoneId: string,
  data: { deliverableLink?: string; githubPrUrl?: string; deploymentUrl?: string; jobId?: string; milestoneNum?: number }
): Promise<{ message: string; milestone: any }> {
  return apiFetch<{ message: string; milestone: any }>(`/milestones/${milestoneId}/submit`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function verifyMilestoneOracle(
  token: string | null,
  milestoneId: string,
  data?: { jobId?: string; milestoneNum?: number; geminiApiKey?: string }
): Promise<{
  message: string;
  milestone: Milestone;
  verificationScore: number;
  aiSummary: string;
  status: string;
  pipelineResults: unknown;
}> {
  try {
    return await apiFetch<any>(`/oracle/milestone/${milestoneId}/verify`, {
      method: "POST",
      token,
      body: JSON.stringify(data || {}),
    });
  } catch (err: any) {
    return await apiFetch<any>(`/milestones/${milestoneId}/verify`, {
      method: "POST",
      token,
      body: JSON.stringify(data || {}),
    });
  }
}

export function releaseMilestonePayment(
  token: string,
  milestoneId: string,
  data?: { jobId?: string; milestoneNum?: number }
): Promise<{ message: string; milestone: any; txHash?: string }> {
  return apiFetch<{ message: string; milestone: any; txHash?: string }>(`/milestones/${milestoneId}/release`, {
    method: "POST",
    token,
    body: JSON.stringify(data || {}),
  });
}

export function rejectMilestone(
  token: string,
  milestoneId: string,
  data: { reason: string; jobId?: string; milestoneNum?: number }
): Promise<{ message: string; milestone: any }> {
  return apiFetch<{ message: string; milestone: any }>(`/milestones/${milestoneId}/reject`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

/** Opens a real dispute case for a milestone — creates a Dispute row, assigns
 *  jurors, and (best-effort) records an on-chain openDispute call. This does
 *  NOT change the milestone's own status (no current code path does). */
export function openDispute(
  token: string,
  data: { jobId: string; milestoneId: string; reason: string; evidenceUrls?: string[] }
): Promise<{ message: string; dispute: unknown; assignedJurors: string[]; txHash: string }> {
  return apiFetch(`/disputes/open`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

/* ------------------------------ Profile ------------------------------ */

export function fetchStablecoinMarkets(): Promise<{ success: boolean; data: StablecoinMarketsResponse }> {
  return apiFetch<{ success: boolean; data: StablecoinMarketsResponse }>("/stablecoins");
}

export function getProfile(token: string): Promise<{ user: Profile }> {
  return apiFetch<{ user: Profile }>("/auth/profile", { token });
}

export function updateProfile(
  token: string,
  body: Partial<Pick<Profile, "name" | "bio" | "location" | "walletAddress" | "portfolioLinks" | "skills">>
): Promise<{ message: string; user: Profile }> {
  return apiFetch<{ message: string; user: Profile }>("/auth/profile", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
}

/* ------------------------------ Onboarding ------------------------------ */

/** Persist the final onboarding payload and mark onboarding complete. */
export function completeOnboarding(
  token: string,
  body: Partial<Pick<Profile, "name" | "bio" | "location" | "portfolioLinks" | "skills">>
): Promise<{ message: string; user: Profile }> {
  return apiFetch<{ message: string; user: Profile }>("/auth/onboarding/complete", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

/* ------------------------------ Formatting helpers ------------------------------ */

export const TOKEN_OPTIONS = ["USDC", "USDT", "ETH", "SOL", "DAI", "INR", "USD"];

export function formatBudget(job: Pick<Job, "budget" | "tokenSymbol">): string {
  return `${job.budget.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${job.tokenSymbol}`;
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatRelative(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  FREELANCER_SELECTED: "Freelancer Selected",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};
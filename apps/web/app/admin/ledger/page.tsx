"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useApiFetch } from "@/hooks/useApiFetch";
import {
  fetchLedgerSummary,
  fetchLedgerEntries,
  fetchLedgerJobTimeline,
  type LedgerEntry,
  type LedgerSummary,
  type LedgerEventType,
  type LedgerStatus,
} from "@/lib/ledgerApi";
import {
  ArrowLeft,
  BookText,
  Search,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  Loader2,
  ExternalLink,
  WifiOff,
} from "lucide-react";

/** Same rule as app/admin/page.tsx: only a real backend JWT can call
 *  authenticateToken-protected routes — a synthetic offline-demo token can't. */
function isRealToken(t: string | null): boolean {
  return !!t && !t.startsWith("admin_auth_jwt_") && !t.startsWith("mock_jwt_token_");
}

const EVENT_TYPES: LedgerEventType[] = [
  "JOB_CREATED",
  "JOB_ACTIVATED",
  "MILESTONE_CREATED",
  "MILESTONE_SUBMITTED",
  "MILESTONE_APPROVED",
  "MILESTONE_REJECTED",
  "MILESTONE_RELEASED",
  "ESCROW_CREATED",
  "ESCROW_FUNDED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
];

const STATUSES: LedgerStatus[] = ["PENDING", "PROCESSING", "CONFIRMED", "FAILED", "CANCELLED"];

function statusBadge(status: LedgerStatus) {
  const map: Record<LedgerStatus, { icon: typeof CheckCircle2; cls: string }> = {
    CONFIRMED: { icon: CheckCircle2, cls: "bg-moss/10 text-moss border-moss/30" },
    PENDING: { icon: Clock, cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    PROCESSING: { icon: Loader2, cls: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
    FAILED: { icon: XCircle, cls: "bg-red-500/10 text-red-400 border-red-500/30" },
    CANCELLED: { icon: Ban, cls: "bg-muted/10 text-muted border-surface-border" },
  };
  const { icon: Icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold uppercase ${cls}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function timeFmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateHash(h: string | null): string {
  if (!h) return "N/A";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${tone || "text-foreground"}`}>{value}</div>
    </div>
  );
}

export default function AdminLedgerPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState("");
  const [jobFilter, setJobFilter] = useState<{ id: string; title: string } | null>(null);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);

  const liveDataEnabled = Boolean(user && user.role === "ADMIN") && isRealToken(token);

  const {
    data: summary,
    isLoading: summaryLoading,
  } = useApiFetch<LedgerSummary | null>(async () => {
    if (!liveDataEnabled || !token) return null;
    return fetchLedgerSummary(token);
  }, [liveDataEnabled, token]);

  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    reload: reloadList,
  } = useApiFetch<{ entries: LedgerEntry[]; nextCursor: string | null }>(async () => {
    if (!liveDataEnabled || !token) return { entries: [], nextCursor: null };
    if (jobFilter) {
      const res = await fetchLedgerJobTimeline(token, jobFilter.id);
      return { entries: res.entries, nextCursor: null };
    }
    return fetchLedgerEntries(token, {
      q: q || undefined,
      eventType: eventType || undefined,
      status: status || undefined,
      limit: 100,
    });
  }, [liveDataEnabled, token, jobFilter?.id, q, eventType, status]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm font-mono">Loading…</div>;
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <BookText className="w-10 h-10 text-muted mx-auto" />
          <p className="text-sm text-muted">Admin access required.</p>
          <Link href="/admin" className="text-xs text-moss underline">
            Go to admin sign-in
          </Link>
        </div>
      </div>
    );
  }

  const entries = listData?.entries ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-surface-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="p-2 rounded-xl bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border transition"
            title="Back to admin console"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-surface border border-purple-500/30 text-xs font-mono text-purple-400">
            <BookText className="w-3.5 h-3.5" />
            <span className="font-bold">FINANCIAL LEDGER</span>
          </div>
          {!liveDataEnabled && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-400">
              <WifiOff className="w-3.5 h-3.5" />
              Offline session — live data unavailable
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {!liveDataEnabled && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>This session doesn&apos;t have a live backend connection, so the ledger can&apos;t load real data.</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Total Entries" value={summaryLoading ? "…" : summary?.total ?? 0} />
          <SummaryCard label="Confirmed" value={summaryLoading ? "…" : summary?.confirmed ?? 0} tone="text-moss" />
          <SummaryCard
            label="Pending / Processing"
            value={summaryLoading ? "…" : summary?.pendingOrProcessing ?? 0}
            tone="text-amber-400"
          />
          <SummaryCard label="Failed" value={summaryLoading ? "…" : summary?.failed ?? 0} tone="text-red-400" />
          <SummaryCard label="Jobs Represented" value={summaryLoading ? "…" : summary?.jobsRepresented ?? 0} />
        </div>

        {/* Job timeline mode banner */}
        {jobFilter && (
          <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs flex items-center justify-between">
            <span className="text-purple-300">
              Viewing full history for <span className="font-bold">{jobFilter.title}</span>
            </span>
            <button
              onClick={() => setJobFilter(null)}
              className="flex items-center gap-1 text-muted hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Back to full ledger
            </button>
          </div>
        )}

        {/* Filters */}
        {!jobFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search job title, description, tx hash, actor…"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-moss/50"
              />
            </div>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-foreground focus:outline-none"
            >
              <option value="">All event types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-foreground focus:outline-none"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {(q || eventType || status) && (
              <button
                onClick={() => {
                  setQ("");
                  setEventType("");
                  setStatus("");
                }}
                className="text-xs text-muted hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* Entry list */}
        <div className="rounded-2xl border border-surface-border bg-surface overflow-hidden">
          {listLoading ? (
            <div className="p-8 text-center text-muted text-xs font-mono">Loading ledger entries…</div>
          ) : listError ? (
            <div className="p-4 text-xs text-red-300 flex items-center justify-between">
              <span>{listError}</span>
              <button onClick={reloadList} className="underline">
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted text-xs font-mono">
              No ledger entries {jobFilter || q || eventType || status ? "match these filters" : "yet"}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-left text-muted font-mono uppercase text-[10px]">
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Job</th>
                    <th className="px-4 py-3 font-semibold">Milestone</th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className="border-b border-surface-border/50 last:border-0 hover:bg-surface-hover cursor-pointer transition"
                    >
                      <td className="px-4 py-3 text-muted font-mono whitespace-nowrap">{timeFmt(e.createdAt)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                        {e.eventType}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate text-foreground">
                        {e.jobTitle || <span className="text-muted italic">N/A</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate text-muted">{e.milestoneTitle || "—"}</td>
                      <td className="px-4 py-3 text-muted">{e.actorLabel || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-foreground whitespace-nowrap">
                        {e.amount != null ? `${e.amount} ${e.currency || ""}` : "—"}
                      </td>
                      <td className="px-4 py-3">{statusBadge(e.status)}</td>
                      <td className="px-4 py-3 font-mono text-muted">{truncateHash(e.blockchainTransactionHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-background border-l border-surface-border overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold font-mono text-foreground">{selected.eventType}</h2>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            {statusBadge(selected.status)}
            <p className="text-xs text-muted">{selected.description}</p>

            <dl className="space-y-2 text-xs">
              <Row label="Entry ID" value={selected.id} mono />
              <Row label="Timestamp" value={new Date(selected.createdAt).toLocaleString()} />
              <Row label="Job" value={selected.jobTitle || "N/A"} />
              <Row label="Job ID" value={selected.jobId || "N/A"} mono />
              <Row label="Milestone" value={selected.milestoneTitle || "—"} />
              <Row label="Milestone ID" value={selected.milestoneId || "—"} mono />
              <Row label="Escrow / Vault" value={selected.escrowId || "—"} mono />
              <Row label="Actor" value={selected.actorLabel || "—"} />
              <Row label="Actor Role" value={selected.actorRole || "—"} />
              <Row
                label="Amount"
                value={selected.amount != null ? `${selected.amount} ${selected.currency || ""}` : "—"}
              />
              <Row label="Previous Status" value={selected.previousStatus || "—"} />
              <Row label="New Status" value={selected.newStatus || "—"} />
              <Row label="Blockchain Tx Hash" value={selected.blockchainTransactionHash || "N/A (no real on-chain tx)"} mono />
              <Row label="Dedupe Key" value={selected.dedupeKey || "—"} mono />
            </dl>

            {selected.details && Object.keys(selected.details).length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-muted mb-1">Details</div>
                <pre className="text-[10px] font-mono bg-surface border border-surface-border rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            )}

            {selected.jobId && (
              <button
                onClick={() => {
                  setJobFilter({ id: selected.jobId!, title: selected.jobTitle || selected.jobId! });
                  setSelected(null);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-moss text-background text-xs font-bold hover:opacity-90 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View full job history
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-surface-border/50">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className={`text-right break-all ${mono ? "font-mono text-[11px]" : ""} text-foreground`}>{value}</dd>
    </div>
  );
}

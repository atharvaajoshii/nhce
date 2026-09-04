"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ADMIN_TEAM_ACCOUNTS } from "@/contexts/AuthContext";
import { useApiFetch } from "@/hooks/useApiFetch";
import { ApiError } from "@/lib/api";
import {
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminDisputes,
  fetchAdminActivity,
  resolveAdminDispute,
  castDisputeVote,
  type AdminOverview,
  type AdminUserRow,
  type AdminDispute,
  type AdminActivityEvent,
  type JurorVoteChoice,
} from "@/lib/adminApi";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Users,
  History,
  TrendingUp,
  ExternalLink,
  RefreshCw,
  LogOut,
  Scale,
  FolderGit2,
  WifiOff,
  BookText,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/** Synthetic client-only sessions (offline demo fallback) can't call the real
 *  authenticateToken-protected API — only a token from the real backend
 *  (POST /auth/admin-login, or a normal user/JWT session) can. */
function isRealToken(t: string | null): boolean {
  return !!t && !t.startsWith("admin_auth_jwt_") && !t.startsWith("mock_jwt_token_");
}

/** The Supabase-seeded admin user object carries a placeholder wallet string
 *  ("0x71C...b821") that isn't a real, votable address — only trust a value
 *  that actually looks like one. */
function isRealWalletAddress(addr: string | null | undefined): addr is string {
  return !!addr && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function formatUSD(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminPortalPage() {
  const { user, token, logout, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"disputes" | "overview" | "users" | "audit">("disputes");
  const [adminTeam, setAdminTeam] = useState<{ id: string; email: string; name: string }[]>(
    ADMIN_TEAM_ACCOUNTS
  );

  // Dynamically load admin arbitrators from Supabase public.admins table
  useEffect(() => {
    fetch("/api/admins")
      .then((res) => res.json())
      .then((data) => {
        if (data.admins && data.admins.length > 0) setAdminTeam(data.admins);
      })
      .catch((err) => console.warn("Using local admin seed", err));
  }, []);

  const liveDataEnabled = Boolean(user && user.role === "ADMIN") && isRealToken(token);

  // ------------------------------ Real data ------------------------------

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    reload: reloadOverview,
  } = useApiFetch<AdminOverview | null>(async () => {
    if (!liveDataEnabled || !token) return null;
    return fetchAdminOverview(token);
  }, [liveDataEnabled, token]);

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    reload: reloadUsers,
  } = useApiFetch<AdminUserRow[]>(async () => {
    if (!liveDataEnabled || !token) return [];
    const res = await fetchAdminUsers(token, { limit: 100 });
    return res.users;
  }, [liveDataEnabled, token]);

  const {
    data: disputesData,
    isLoading: disputesLoading,
    error: disputesError,
    reload: reloadDisputes,
  } = useApiFetch<AdminDispute[]>(async () => {
    if (!liveDataEnabled || !token) return [];
    const res = await fetchAdminDisputes(token);
    return res.disputes;
  }, [liveDataEnabled, token]);

  const {
    data: activityData,
    isLoading: activityLoading,
    error: activityError,
    reload: reloadActivity,
  } = useApiFetch<AdminActivityEvent[]>(async () => {
    if (!liveDataEnabled || !token) return [];
    const res = await fetchAdminActivity(token);
    return res.activity;
  }, [liveDataEnabled, token]);

  const disputes = disputesData ?? [];
  const users = usersData ?? [];
  const activity = activityData ?? [];

  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const activeDispute = disputes.find((d) => d.id === selectedDisputeId) ?? disputes[0] ?? null;

  // Voting
  const [voterWallet, setVoterWallet] = useState("");
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const effectiveWallet = isRealWalletAddress(user?.walletAddress) ? user!.walletAddress! : voterWallet;
  const myVote = activeDispute?.votes.find(
    (v) => v.jurorAddress.toLowerCase() === effectiveWallet.toLowerCase()
  );

  const handleCastVote = async (choice: JurorVoteChoice) => {
    if (!activeDispute || !token) return;
    if (!isRealWalletAddress(effectiveWallet)) {
      setVoteError("Enter a valid wallet address (0x...) to vote as a juror.");
      return;
    }
    setVoting(true);
    setVoteError(null);
    try {
      await castDisputeVote(token, activeDispute.id, choice);
      reloadDisputes();
    } catch (e) {
      setVoteError(e instanceof ApiError ? e.message : "Failed to cast vote.");
    } finally {
      setVoting(false);
    }
  };

  const handleResolve = async () => {
    if (!activeDispute || !token) return;
    setResolving(true);
    setVoteError(null);
    try {
      await resolveAdminDispute(token, activeDispute.id);
      reloadDisputes();
    } catch (e) {
      setVoteError(e instanceof ApiError ? e.message : "Failed to resolve dispute.");
    } finally {
      setResolving(false);
    }
  };

  // 1. Authoritative access check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-moss animate-spin" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted">
          Verifying Admin Credentials...
        </p>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full p-8 rounded-3xl bg-surface border border-red-900/40 shadow-2xl space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold">
              HTTP 403 • RESTRICTED CONSOLE
            </span>
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              Administrative Access Denied
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              This route is restricted to the platform&apos;s admin team. Non-admin users cannot access the
              arbitration operations console.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-background border border-surface-border text-xs text-left space-y-2">
            <div className="flex items-center justify-between text-muted font-mono text-[11px]">
              <span>Current Account:</span>
              <span className="text-foreground">{user ? user.email : "Unauthenticated"}</span>
            </div>
            <div className="flex items-center justify-between text-muted font-mono text-[11px]">
              <span>Authenticated Role:</span>
              <span className="text-red-400 uppercase font-bold">{user ? user.role : "NONE"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/"
              className="w-full py-3 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs font-semibold text-foreground transition"
            >
              Return to Landing Page
            </Link>
            <button
              onClick={logout}
              className="w-full py-3 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold transition shadow-sm"
            >
              Sign In with Team Admin Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-moss selection:text-background font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b border-surface-border bg-background/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-surface border border-surface-border flex items-center justify-center font-black text-sm">
              <span className="text-foreground">W</span>
              <span className="text-moss">3</span>
            </div>
            <span className="font-extrabold text-lg text-foreground tracking-tight">W3HIRE</span>
          </Link>

          <span className="text-surface-border font-mono">/</span>

          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-surface border border-purple-500/30 text-xs font-mono text-purple-400">
            <Scale className="w-3.5 h-3.5" />
            <span className="font-bold">ARBITRATION CONSOLE</span>
          </div>

          {!liveDataEnabled && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-400">
              <WifiOff className="w-3.5 h-3.5" />
              Offline session — live data unavailable
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface border border-surface-border text-xs">
            <div className={`w-2 h-2 rounded-full ${liveDataEnabled ? "bg-moss animate-pulse" : "bg-amber-400"}`} />
            <span className="font-mono text-foreground font-semibold">{user.name || user.email}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold uppercase">
              Admin
            </span>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Admin team bar — real Supabase-backed roster (unchanged) */}
      <section className="border-b border-surface-border bg-surface/50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted font-mono">
            <Users className="w-4 h-4 text-moss" />
            <span className="uppercase tracking-wider font-semibold text-[11px]">
              Admin Team ({adminTeam.length}):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {adminTeam.map((adm, i) => {
              const isMe = user.email.toLowerCase() === adm.email.toLowerCase();
              return (
                <div
                  key={adm.id || i}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
                    isMe
                      ? "bg-purple-950/40 border-purple-500/60 text-purple-300 font-bold"
                      : "bg-background border-surface-border text-muted"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-moss" />
                  <span>{adm.name.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Tabs */}
        <div className="flex items-center justify-between gap-2 border-b border-surface-border pb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab("disputes")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "disputes"
                ? "bg-moss text-background shadow-md shadow-[#84CC16]/20"
                : "bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border"
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Disputes Queue</span>
            <span className="px-1.5 py-0.5 rounded-full bg-background/20 text-[10px] font-mono">
              {disputes.filter((d) => d.status === "VOTING" || d.status === "OPEN").length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "overview"
                ? "bg-moss text-background shadow-md shadow-[#84CC16]/20"
                : "bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Operations Metrics</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "users"
                ? "bg-moss text-background shadow-md shadow-[#84CC16]/20"
                : "bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Platform Users</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "audit"
                ? "bg-moss text-background shadow-md shadow-[#84CC16]/20"
                : "bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Recent Activity</span>
          </button>
        </div>

        <Link
          href="/admin/ledger"
          className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-surface-border"
        >
          <BookText className="w-4 h-4" />
          <span>Financial Ledger</span>
        </Link>
        </div>

        {!liveDataEnabled && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              This session doesn&apos;t have a live backend connection, so the console can&apos;t load real data.
              Sign out and sign back in once the API is reachable.
            </span>
          </div>
        )}

        {/* TAB 1: DISPUTES */}
        {activeTab === "disputes" && (
          <div className="space-y-6">
            {disputesLoading ? (
              <div className="p-8 text-center text-muted text-xs font-mono">Loading disputes…</div>
            ) : disputesError ? (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-800/40 text-xs text-red-300 flex items-center justify-between">
                <span>{disputesError}</span>
                <button onClick={reloadDisputes} className="font-semibold hover:underline">
                  Retry
                </button>
              </div>
            ) : disputes.length === 0 ? (
              <div className="p-10 rounded-3xl bg-surface border border-surface-border text-center text-sm text-muted">
                No disputes have been raised yet.
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-moss font-semibold">
                      Juror Arbitration Docket
                    </span>
                    <h2 className="text-2xl font-black text-foreground tracking-tight">
                      Case Review: {activeDispute?.job.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted font-mono">Case:</span>
                    <select
                      value={activeDispute?.id}
                      onChange={(e) => setSelectedDisputeId(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-surface border border-surface-border text-xs font-mono text-foreground focus:outline-none focus:border-moss"
                    >
                      {disputes.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.job.title} — {d.status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeDispute && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                      {/* Financials */}
                      <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-4">
                        <span className="text-xs font-mono uppercase text-muted font-bold">
                          Financial Escrow Accounting
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="p-3.5 rounded-2xl bg-background border border-surface-border">
                            <span className="text-[10px] font-mono text-muted uppercase">Total Contract</span>
                            <div className="text-xl font-black font-mono text-foreground">
                              {formatUSD(activeDispute.financials.totalBudget)}
                            </div>
                            <span className="text-[10px] text-muted">{activeDispute.job.tokenSymbol}</span>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-background border border-surface-border">
                            <span className="text-[10px] font-mono text-muted uppercase">Disputed Milestone</span>
                            <div className="text-xl font-black font-mono text-amber-400">
                              {formatUSD(activeDispute.financials.disputedAmount)}
                            </div>
                            <span className="text-[10px] text-amber-400/80 font-mono truncate block">
                              {activeDispute.milestone?.title || "—"}
                            </span>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-background border border-surface-border">
                            <span className="text-[10px] font-mono text-muted uppercase">Already Released</span>
                            <div className="text-xl font-black font-mono text-moss">
                              {formatUSD(activeDispute.financials.alreadyReleased)}
                            </div>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-background border border-surface-border">
                            <span className="text-[10px] font-mono text-muted uppercase">Remaining Vault</span>
                            <div className="text-xl font-black font-mono text-foreground">
                              {formatUSD(activeDispute.financials.remaining)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Parties */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 rounded-3xl bg-surface border border-red-950/40 space-y-3">
                          <div className="flex items-center justify-between border-b border-surface-border pb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-400" />
                              <span className="text-xs font-bold text-foreground">Client</span>
                            </div>
                            <span className="text-xs font-mono text-muted">
                              {activeDispute.job.client?.name || activeDispute.job.client?.email || "Unknown"}
                            </span>
                          </div>
                          <p className="text-xs text-muted leading-relaxed">&quot;{activeDispute.reason}&quot;</p>
                          <div className="pt-2 text-[11px] font-mono text-muted">
                            Wallet: <span className="text-foreground">{activeDispute.job.client?.walletAddress || "—"}</span>
                          </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-surface border border-moss/30 space-y-3">
                          <div className="flex items-center justify-between border-b border-surface-border pb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-moss" />
                              <span className="text-xs font-bold text-foreground">Freelancer</span>
                            </div>
                            <span className="text-xs font-mono text-moss font-bold">
                              {activeDispute.job.freelancer?.name || activeDispute.job.freelancer?.email || "Unassigned"}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-muted">
                            Wallet:{" "}
                            <span className="text-foreground">
                              {activeDispute.job.freelancer?.walletAddress || "—"}
                            </span>
                          </div>
                          {typeof activeDispute.job.freelancer?.rating === "number" && (
                            <div className="text-[11px] font-mono text-muted">
                              Rating: <strong className="text-foreground">{activeDispute.job.freelancer.rating} ★</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Evidence */}
                      {activeDispute.evidenceUrls.length > 0 && (
                        <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-3">
                          <div className="flex items-center gap-2 text-xs font-mono text-muted uppercase font-bold">
                            <FolderGit2 className="w-4 h-4 text-moss" />
                            <span>Evidence:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {activeDispute.evidenceUrls.map((f, idx) => (
                              <a
                                key={idx}
                                href={f}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-background border border-surface-border text-xs font-mono text-foreground flex items-center gap-2 hover:border-moss/50"
                              >
                                <FileText className="w-3.5 h-3.5 text-moss" />
                                <span className="max-w-[220px] truncate">{f}</span>
                                <ExternalLink className="w-3 h-3 text-muted" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Voting panel */}
                    <div className="space-y-6">
                      <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-6 shadow-xl">
                        <div className="flex items-center justify-between border-b border-surface-border pb-4">
                          <div className="flex items-center gap-2">
                            <Scale className="w-4 h-4 text-moss" />
                            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                              Juror Voting
                            </h3>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              activeDispute.status === "RESOLVED"
                                ? "bg-moss/20 text-moss"
                                : "bg-amber-500/20 text-amber-400 animate-pulse"
                            }`}
                          >
                            {activeDispute.status}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span>Votes cast:</span>
                            <span className="font-bold text-foreground">{activeDispute.tally.total}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="p-3 rounded-xl bg-background border border-moss/40 text-center">
                              <span className="text-[10px] text-muted uppercase">Freelancer Favor</span>
                              <div className="text-2xl font-black text-moss">{activeDispute.tally.freelancerFavor}</div>
                            </div>
                            <div className="p-3 rounded-xl bg-background border border-red-950/50 text-center">
                              <span className="text-[10px] text-muted uppercase">Client Favor</span>
                              <div className="text-2xl font-black text-red-400">{activeDispute.tally.clientFavor}</div>
                            </div>
                          </div>
                        </div>

                        {activeDispute.votes.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-surface-border">
                            <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                              Votes cast so far:
                            </span>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {activeDispute.votes.map((v, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 rounded-xl bg-background border border-surface-border text-xs font-mono"
                                >
                                  <span className="text-muted truncate max-w-[140px]">
                                    {v.jurorName || `${v.jurorAddress.slice(0, 6)}...${v.jurorAddress.slice(-4)}`}
                                  </span>
                                  <span className={`text-[11px] font-bold ${v.choice === "FREELANCER_FAVOR" ? "text-moss" : "text-red-400"}`}>
                                    {v.choice === "FREELANCER_FAVOR" ? "✓ FREELANCER" : "✗ CLIENT"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-4 border-t border-surface-border space-y-3">
                          {!isRealWalletAddress(user.walletAddress) && (
                            <div>
                              <label className="text-[10px] font-mono uppercase text-muted block mb-1">
                                Your juror wallet address
                              </label>
                              <input
                                type="text"
                                value={voterWallet}
                                onChange={(e) => setVoterWallet(e.target.value.trim())}
                                placeholder="0x..."
                                className="w-full px-3 py-2 rounded-xl bg-background border border-surface-border text-xs font-mono text-foreground focus:outline-none focus:border-moss"
                              />
                            </div>
                          )}

                          {voteError && (
                            <p className="text-[11px] text-red-400 font-mono">{voteError}</p>
                          )}

                          {myVote ? (
                            <div className="p-3 rounded-xl bg-moss/10 border border-moss/30 text-xs font-mono text-moss flex items-center justify-between font-bold">
                              <span>YOUR VOTE:</span>
                              <span>{myVote.choice.replace("_", " ")}</span>
                            </div>
                          ) : activeDispute.status === "RESOLVED" ? (
                            <div className="p-3 rounded-xl bg-surface border border-surface-border text-xs text-muted text-center font-mono">
                              Dispute resolved.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleCastVote("FREELANCER_FAVOR")}
                                disabled={voting}
                                className="py-3 px-3 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-bold text-xs transition shadow-md shadow-[#84CC16]/20 flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Favor Freelancer</span>
                              </button>
                              <button
                                onClick={() => handleCastVote("CLIENT_FAVOR")}
                                disabled={voting}
                                className="py-3 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-400 font-bold text-xs transition flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                <span>Favor Client</span>
                              </button>
                            </div>
                          )}

                          {activeDispute.status !== "RESOLVED" && activeDispute.tally.total > 0 && (
                            <button
                              onClick={handleResolve}
                              disabled={resolving || activeDispute.tally.freelancerFavor === activeDispute.tally.clientFavor}
                              className="w-full py-2.5 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs font-bold text-foreground transition disabled:opacity-40"
                            >
                              {resolving ? "Resolving…" : "Finalize by Current Majority"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 2: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {overviewLoading ? (
              <div className="p-8 text-center text-muted text-xs font-mono">Loading metrics…</div>
            ) : overviewError ? (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-800/40 text-xs text-red-300 flex items-center justify-between">
                <span>{overviewError}</span>
                <button onClick={reloadOverview} className="font-semibold hover:underline">
                  Retry
                </button>
              </div>
            ) : overview ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted">Escrow-Locked Volume</span>
                    <div className="text-3xl font-black font-mono text-foreground">
                      {formatUSD(overview.escrow.lockedVolume)}
                    </div>
                    <span className="text-xs text-muted font-mono">Across active/completed jobs</span>
                  </div>
                  <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted">Released to Freelancers</span>
                    <div className="text-3xl font-black font-mono text-[#22C55E]">
                      {formatUSD(overview.escrow.releasedVolume)}
                    </div>
                    <span className="text-xs text-muted font-mono">{overview.jobs.completed} completed jobs</span>
                  </div>
                  <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted">Disputes</span>
                    <div className="text-3xl font-black font-mono text-amber-400">{overview.disputes.total}</div>
                    <span className="text-xs text-amber-400 font-mono">
                      {overview.disputes.voting} voting · {overview.disputes.resolved} resolved
                    </span>
                  </div>
                  <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted">Platform Users</span>
                    <div className="text-3xl font-black font-mono text-moss">{overview.users.total}</div>
                    <span className="text-xs text-muted font-mono">
                      {overview.users.clients} clients · {overview.users.freelancers} freelancers
                    </span>
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-surface border border-surface-border space-y-4">
                  <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-foreground">
                    Marketplace Breakdown
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted">
                    <div className="p-4 rounded-xl bg-background border border-surface-border space-y-1.5">
                      <span className="font-bold text-foreground font-mono">Jobs</span>
                      <p>
                        {overview.jobs.total} total · {overview.jobs.published} published · {overview.jobs.inProgress} in
                        progress · {overview.jobs.completed} completed
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background border border-surface-border space-y-1.5">
                      <span className="font-bold text-foreground font-mono">Applications</span>
                      <p>{overview.applications.total} submitted across all jobs.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-background border border-surface-border space-y-1.5">
                      <span className="font-bold text-foreground font-mono">Dispute Resolution</span>
                      <p>
                        Any wallet-connected juror can vote (3 are assigned per case). An admin finalizes a case once
                        votes have a clear majority.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* TAB 3: USERS */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {usersLoading ? (
              <div className="p-8 text-center text-muted text-xs font-mono">Loading users…</div>
            ) : usersError ? (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-800/40 text-xs text-red-300 flex items-center justify-between">
                <span>{usersError}</span>
                <button onClick={reloadUsers} className="font-semibold hover:underline">
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Platform Accounts</h3>
                  <span className="text-xs font-mono text-muted">{users.length} users</span>
                </div>

                <div className="rounded-3xl bg-surface border border-surface-border overflow-hidden shadow-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background border-b border-surface-border font-mono text-muted uppercase text-[10px]">
                      <tr>
                        <th className="p-4">User</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Rating</th>
                        <th className="p-4">Wallet</th>
                        <th className="p-4">Onboarded</th>
                        <th className="p-4">Track Record</th>
                        <th className="p-4">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border font-mono">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-background/40 transition">
                          <td className="p-4">
                            <div className="font-bold text-foreground">{u.name || "Unnamed"}</div>
                            <div className="text-[11px] text-muted">{u.email}</div>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded bg-surface border border-surface-border text-[10px]">
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-foreground">{u.rating.toFixed(1)} ★</td>
                          <td className="p-4 text-muted">
                            {u.walletAddress ? `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}` : "—"}
                          </td>
                          <td className="p-4">
                            {u.onboardingCompleted ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-moss/20 text-moss">
                                ● YES
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-border/40 text-muted">
                                ● NO
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-muted">
                            {u.jobsPostedCount} posted • {u.jobsAppliedCount} applied
                          </td>
                          <td className="p-4 text-muted">{timeAgo(u.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: ACTIVITY */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">Recent Platform Activity</h3>
              <p className="text-xs text-muted">
                The latest job postings, applications, and disputes — derived live from platform records, newest
                first.
              </p>
            </div>

            {activityLoading ? (
              <div className="p-8 text-center text-muted text-xs font-mono">Loading activity…</div>
            ) : activityError ? (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-800/40 text-xs text-red-300 flex items-center justify-between">
                <span>{activityError}</span>
                <button onClick={reloadActivity} className="font-semibold hover:underline">
                  Retry
                </button>
              </div>
            ) : activity.length === 0 ? (
              <div className="p-10 rounded-3xl bg-surface border border-surface-border text-center text-sm text-muted">
                No activity yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activity.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-2xl bg-surface border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-moss text-xs">{log.type.replace(/_/g, " ")}</span>
                        <span className="text-[10px] text-muted font-mono">• {timeAgo(log.timestamp)}</span>
                      </div>
                      <p className="text-foreground text-xs">{log.detail}</p>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                        <span>
                          Actor: <strong className="text-foreground">{log.actor}</strong>
                        </span>
                        <span>
                          Project: <strong className="text-foreground">{log.title}</strong>
                        </span>
                      </div>
                    </div>
                    {typeof log.amount === "number" && (
                      <div className="text-right font-mono shrink-0">
                        <div className="font-bold text-foreground">{formatUSD(log.amount)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Users,
  XCircle,
  AlertCircle,
  Briefcase,
  Layers,
  FileText,
} from "lucide-react";
import InteractiveMilestoneTimeline from "@/components/milestones/InteractiveMilestoneTimeline";
import EmptyState from "@/components/ui/EmptyState";
import AuthModal from "@/components/auth/AuthModal";
import MetaMaskModal from "@/components/metamask-modal";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchJob,
  fetchMyApplications,
  applyToJob,
  getAuthToken,
  ApiError,
  Job,
  JobApplication,
  ApplicationStatus,
  formatBudget,
  formatDate,
  daysUntil,
  formatRelative,
} from "@/lib/api";
import { useApiFetch, apiErrorMessage } from "@/hooks/useApiFetch";

const APP_STATUS_UI: Record<ApplicationStatus, { label: string; className: string; icon: "check" | "x" | "clock" | "eye" }> = {
  SUBMITTED: { label: "Application Submitted", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30", icon: "clock" },
  UNDER_REVIEW: { label: "Application Under Review", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30", icon: "eye" },
  ACCEPTED: { label: "Application Accepted", className: "bg-moss/10 text-moss border-moss/30", icon: "check" },
  REJECTED: { label: "Application Rejected", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30", icon: "x" },
};

export default function BountyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [showApplyForm, setShowApplyForm] = useState(false);
  const [pitch, setPitch] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const {
    data,
    isLoading,
    error: loadError,
    reload: load,
    setData,
  } = useApiFetch<{ job: Job; myApplication: JobApplication | null }>(async () => {
    const jobResponse = await fetchJob(id);
    let myApplication: JobApplication | null = null;
    const token = getAuthToken();
    if (token) {
      try {
        const appsResponse = await fetchMyApplications(token);
        myApplication = (appsResponse.applications || []).find((a) => a.jobId === id) || null;
      } catch {
        // Ignore auth failures — application state simply stays unknown.
      }
    }
    return { job: jobResponse.job, myApplication };
  }, [id]);

  const job = data?.job ?? null;
  const myApplication = data?.myApplication ?? null;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setApplyError(null);
    if (!pitch.trim()) {
      setApplyError("Your proposal description is required.");
      return;
    }
    const days = Number(deliveryDays);
    if (!days || days <= 0) {
      setApplyError("Expected delivery days must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setApplyError("You need to sign in to apply.");
        setSubmitting(false);
        return;
      }

      // Combine cover pitch with GitHub & Portfolio links
      let combinedPitch = pitch.trim();
      if (githubUrl.trim()) {
        combinedPitch += `\n\n🐙 GitHub / PR Link: ${githubUrl.trim()}`;
      }
      if (portfolioUrl.trim()) {
        combinedPitch += `\n💼 Portfolio / Top Project Link: ${portfolioUrl.trim()}`;
      }

      const activeWallet = user?.walletAddress || (typeof window !== "undefined" ? localStorage.getItem("w3hire_active_address") : null);

      // Accept the client's decided budget (job.budget)
      const res = await applyToJob(token, id, {
        pitch: combinedPitch,
        requestedRate: job.budget,
        deliveryDays: days,
        ...(activeWallet ? { walletAddress: activeWallet } : {})
      } as any);

      setData((prev) => ({ job: prev?.job ?? job, myApplication: res.application }));
      setApplySuccess(true);
      setShowApplyForm(false);
      setPitch("");
      setGithubUrl("");
      setPortfolioUrl("");
      setDeliveryDays("7");
    } catch (err) {
      if (err instanceof ApiError) {
        setApplyError(err.message);
        if (err.status === 409) {
          load();
        }
      } else {
        setApplyError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resyncApplication = () => {
    load();
  };

  const due = job ? daysUntil(job.deadline) : null;

  if (isLoading) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-center py-32 text-muted space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-moss" />
          <p className="text-sm font-mono">Loading job…</p>
        </div>
      </main>
    );
  }

  if (loadError || !job) {
    return (
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-20">
        <EmptyState
          icon={AlertCircle}
          title="Job Not Found"
          description={loadError || "We couldn't find the job you're looking for. It may have been removed or the link is incorrect."}
          action={{ label: "Back to Marketplace", onClick: () => router.push("/bounties") }}
        />
      </main>
    );
  }

  const isOwner = user?.role === "CLIENT" && user.id === job.clientId;

  const renderApplyArea = () => {
    // Not signed in
    if (!user) {
      return (
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="w-full px-6 py-3 bg-moss hover:bg-[#BEF264] text-background font-semibold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
        >
          Sign in to Apply
          <ArrowRight className="w-4 h-4" />
        </button>
      );
    }

    // Job owner (client viewing their own job)
    if (isOwner) {
      return (
        <Link
          href={`/client/jobs/${job.id}`}
          className="w-full px-6 py-3 bg-background border border-surface-border hover:border-moss/50 text-foreground hover:text-moss font-semibold text-sm uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Briefcase className="w-4 h-4" />
          View Applications
          <ArrowRight className="w-4 h-4" />
        </Link>
      );
    }

    // Client viewing someone else's job
    if (user.role === "CLIENT") {
      return (
        <div className="px-6 py-4 bg-background border border-surface-border rounded-xl text-xs text-muted text-center">
          Clients cannot apply to jobs. Switch to a freelancer account to apply.
        </div>
      );
    }

    // Freelancer: job no longer accepting applications
    if (job.status !== "PUBLISHED") {
      return (
        <div className="px-6 py-4 bg-background border border-surface-border rounded-xl text-xs text-muted text-center">
          This job is no longer accepting applications ({job.status.replace(/_/g, " ")}).
        </div>
      );
    }

    // Freelancer: check wallet connection
    const activeAddress = user.walletAddress || (typeof window !== "undefined" ? localStorage.getItem("w3hire_active_address") : null);
    if (!activeAddress) {
      return (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Connect your Web3 Wallet (Phantom or MetaMask) before applying so your wallet address can be linked for milestone escrow payouts.</span>
          </div>
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="w-full px-6 py-3 bg-moss hover:bg-[#BEF264] text-background font-semibold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            Connect Wallet to Apply
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    // Freelancer: already applied
    if (myApplication) {
      const ui = APP_STATUS_UI[myApplication.status];
      return (
        <div className={`px-6 py-4 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold ${ui.className}`}>
          {ui.icon === "check" && <CheckCircle2 className="w-5 h-5" />}
          {ui.icon === "x" && <XCircle className="w-5 h-5" />}
          {ui.icon === "clock" && <Clock className="w-5 h-5" />}
          {ui.label}
        </div>
      );
    }

    // Freelancer: apply
    if (!user) {
      return (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-surface border border-moss/30 text-xs text-muted text-center space-y-1">
            <span className="font-semibold text-foreground block">Sign in required to apply</span>
            <p>Please sign in or create a freelancer account first to submit a proposal for this project.</p>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full px-6 py-3 bg-moss hover:bg-[#BEF264] text-background font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            First Login to Submit Proposal
          </button>
        </div>
      );
    }

    if (!showApplyForm) {
      return (
        <button
          onClick={() => setShowApplyForm(true)}
          className="w-full px-6 py-3 bg-moss hover:bg-[#BEF264] text-background font-semibold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          Apply Now
        </button>
      );
    }

    return (
      <form onSubmit={handleApply} className="space-y-4">
        {/* Fixed Budget Notice */}
        <div className="p-3 rounded-xl bg-background border border-surface-border text-xs flex justify-between items-center">
          <span className="text-muted font-mono">Job Fixed Budget:</span>
          <span className="font-mono font-bold text-moss">{formatBudget(job)}</span>
        </div>

        <div>
          <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
            Why are you a fit for this role? <span className="text-[#EF4444]">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="Describe your relevant skills, approach, and why you are the ideal fit for this project…"
            className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
            GitHub Profile / PR Link
          </label>
          <input
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/your-username or PR link"
            className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
            Portfolio / Top Projects Link
          </label>
          <input
            type="url"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            placeholder="https://yourportfolio.dev or project link"
            className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
            Expected Delivery Days
          </label>
          <input
            type="number"
            min={1}
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
            placeholder="7"
            className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors"
          />
        </div>

        {applyError && (
          <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444]">{applyError}</div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-6 py-3 bg-moss hover:bg-[#BEF264] text-background font-semibold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      </form>
    );
  };

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
      {applySuccess && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-moss/10 border border-moss/30 flex items-center gap-3 text-sm text-moss"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>
            <strong>Application submitted!</strong> The client has been notified and will review your proposal.
          </span>
        </motion.div>
      )}

      <div>
        <Link
          href="/bounties"
          className="inline-flex items-center gap-2 text-muted hover:text-moss transition-colors duration-300 font-mono text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>
      </div>

      {/* Escrow Funded & Work Started Banner */}
      {(job.status === "IN_PROGRESS" || job.escrowAddress) && (
        <div className="p-6 rounded-2xl bg-moss/10 border border-moss/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-moss text-background flex items-center justify-center shrink-0 font-bold text-xl">
              🔒
            </div>
            <div>
              <div className="text-base font-extrabold text-foreground flex items-center gap-2">
                Work Started & Money Locked in Escrow!
              </div>
              <p className="text-xs text-muted mt-0.5">
                The client has funded the project budget into the Smart Contract Escrow Vault on Sepolia Devnet. Complete the milestone deliverables to receive your payout.
              </p>
            </div>
          </div>

          {job.escrowAddress && (
            <a
              href={`https://sepolia.etherscan.io/address/${job.escrowAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-background border border-moss/40 hover:border-moss text-moss text-xs font-mono font-semibold transition shrink-0"
            >
              Vault: {job.escrowAddress.slice(0, 6)}...{job.escrowAddress.slice(-4)} ↗
            </a>
          )}
        </div>
      )}

      {/* Header */}
      <div className="bg-surface border border-surface-border rounded-2xl p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-semibold bg-moss/20 text-moss border border-moss/30">
                {job.status === "PUBLISHED" ? "Accepting Applications" : job.status.replace(/_/g, " ")}
              </span>
              <span className="text-[11px] text-muted font-mono">Posted {formatRelative(job.createdAt)}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight max-w-3xl">{job.title}</h1>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold text-foreground font-mono">{formatBudget(job)}</div>
            {due !== null && (
              <div className="text-xs text-muted font-mono mt-1 flex items-center justify-end gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {due <= 0 ? "Deadline passed" : `Due in ${due} days`}
                {job.deadline && <span>({formatDate(job.deadline)})</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t border-surface-border pt-6">
          <div className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <span key={skill} className="px-2 py-0.5 rounded-md bg-background border border-surface-border text-[11px] font-mono text-muted">
                {skill}
              </span>
            ))}
            {job.skills.length === 0 && <span className="text-[11px] font-mono text-muted">No skills specified</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted font-mono ml-auto">
            <Users className="w-4 h-4" />
            {job._count?.applications ?? 0} applications
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-12">
          {/* Project Description */}
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-6 tracking-tight">Project Description</h3>
            <p className="text-muted leading-relaxed font-light whitespace-pre-line">{job.description}</p>
          </div>

          {/* Dynamic Milestones Breakdown & Deliverable Instructions */}
          {(() => {
            const raw = (job as any).milestones || (job as any).milestoneList || [];
            let milestonesList: Array<{
              id: string;
              order: number;
              title: string;
              description: string;
              amount: number | string;
              status: string;
            }> = [];

            if (Array.isArray(raw) && raw.length > 0) {
              milestonesList = raw.map((m: any, idx: number) => ({
                id: m.id || `m-${idx + 1}`,
                order: m.order || idx + 1,
                title: m.title || `Milestone ${idx + 1}`,
                description: m.description || "Deliverable instructions and handoff criteria.",
                amount: m.amount || (job.budget / raw.length).toFixed(2),
                status: m.status || (idx === 0 ? "IN_PROGRESS" : "LOCKED")
              }));
            } else {
              const third = (job.budget / 3).toFixed(2);
              milestonesList = [
                { id: "m-1", order: 1, title: "Milestone 1: Architecture & Specification", description: "Design specs, architecture diagrams, and interface definitions.", amount: third, status: "IN_PROGRESS" },
                { id: "m-2", order: 2, title: "Milestone 2: Core Feature Implementation", description: "Development, unit tests, and smart contract integration.", amount: third, status: "LOCKED" },
                { id: "m-3", order: 3, title: "Milestone 3: Security Audit & Final Deployment", description: "Security audit verification, live deployment, and handoff.", amount: third, status: "LOCKED" }
              ];
            }

            return (
              <div className="space-y-6 pt-6 border-t border-surface-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                      <Layers className="w-5 h-5 text-moss" />
                      <span>Project Milestones & Deliverables</span>
                    </h3>
                    <p className="text-xs text-muted mt-1">Review the agreed milestone values, instructions, and payout structure.</p>
                  </div>
                  <span className="text-xs font-mono text-moss bg-moss/10 px-3 py-1 rounded-full border border-moss/30 font-semibold">
                    {milestonesList.length} {milestonesList.length === 1 ? "Milestone" : "Milestones"}
                  </span>
                </div>

                <InteractiveMilestoneTimeline
                  milestones={milestonesList as any}
                  tokenSymbol={job.tokenSymbol || "USDC"}
                />

                <div className="space-y-4 pt-2">
                  {milestonesList.map((m, idx) => {
                    const pct = Math.round((Number(m.amount) / job.budget) * 100) || Math.round(100 / milestonesList.length);
                    return (
                      <div key={m.id || idx} className="p-5 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-moss/10 border border-moss/30 flex items-center justify-center font-bold text-xs text-moss font-mono">
                              #{m.order || idx + 1}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-foreground">{m.title}</h4>
                              <span className="text-[11px] font-mono text-muted">Allocation: {pct}% of total budget</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right font-mono">
                              <span className="text-sm font-extrabold text-moss">{m.amount} {job.tokenSymbol || "USDC"}</span>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                              m.status === "COMPLETED"
                                ? "bg-moss/20 text-moss border-moss/30"
                                : m.status === "IN_PROGRESS"
                                ? "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30"
                                : "bg-background text-muted border-surface-border"
                            }`}>
                              {m.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[11px] font-mono uppercase font-semibold text-muted flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-moss" />
                            What To Do / Deliverable Instructions:
                          </span>
                          <div className="p-3.5 rounded-xl bg-background border border-surface-border text-xs text-foreground leading-relaxed whitespace-pre-line">
                            {m.description || "Deliverable specifications and verification criteria agreed for this milestone."}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-surface border border-surface-border rounded-2xl p-6">
            <h3 className="text-foreground font-bold text-base mb-6 tracking-tight">Client Info</h3>
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-background border border-surface-border rounded-full flex items-center justify-center text-moss font-bold text-lg">
                  {(job.client?.name || job.client?.email || "C").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-foreground text-sm">{job.client?.name || job.client?.email?.split("@")[0] || "Client"}</div>
                  <div className="text-xs text-muted">{job.client?.email || "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-surface-border">
                <div>
                  <div className="text-xs font-mono text-muted mb-1 uppercase">Rating</div>
                  <div className="text-foreground font-semibold text-base flex items-center">
                    {job.client?.rating?.toFixed(1) ?? "5.0"} <span className="text-[#F59E0B] ml-1">★</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted mb-1 uppercase">Member Since</div>
                  <div className="text-foreground font-semibold text-base">{formatDate(job.client?.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-4">
            <h3 className="text-foreground font-bold text-base tracking-tight">Apply for this Project</h3>
            {renderApplyArea()}
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode="signin"
        initialRole="FREELANCER"
        onSuccess={() => {
          resyncApplication();
        }}
      />

      <MetaMaskModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        role="freelancer"
        onSuccess={(account) => {
          setIsWalletModalOpen(false);
          resyncApplication();
        }}
      />
    </main>
  );
}
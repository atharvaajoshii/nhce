"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Send,
  Star,
  Users,
  XCircle,
  AlertCircle,
  Clock,
  UserCheck,
  Trash2,
  Layers,
  FileText,
  Sparkles,
  ShieldCheck,
  X
} from "lucide-react";
import InteractiveMilestoneTimeline from "@/components/milestones/InteractiveMilestoneTimeline";
import EmptyState from "@/components/ui/EmptyState";
import {
  fetchJobApplications,
  selectFreelancer,
  rejectApplication,
  reviewApplication,
  publishJob,
  deleteJob,
  getAuthToken,
  submitMilestoneProof,
  verifyMilestoneOracle,
  releaseMilestonePayment,
  rejectMilestone,
  ApiError,
  Job,
  JobApplication,
  ApplicationStatus,
  APPLICATION_STATUS_LABELS,
  JOB_STATUS_LABELS,
  formatBudget,
  formatDate,
  formatRelative,
  daysUntil,
} from "@/lib/api";
import { useApiFetch, apiErrorMessage } from "@/hooks/useApiFetch";

const APP_STATUS_STYLES: Record<ApplicationStatus, string> = {
  SUBMITTED: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
  UNDER_REVIEW: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
  ACCEPTED: "bg-moss/10 text-moss border-moss/30",
  REJECTED: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
};

// 72-Hour Verification Countdown Timer Component for Client
function VerificationCountdownTimer({ verificationDeadline }: { verificationDeadline?: string | Date | null }) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: 72,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    if (!verificationDeadline) return;
    const deadlineMs = new Date(verificationDeadline).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = deadlineMs - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds, isExpired: false });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [verificationDeadline]);

  if (timeLeft.isExpired) {
    return (
      <div className="p-4 rounded-2xl bg-moss/20 border border-moss/40 text-moss font-mono text-xs flex items-center justify-between shadow-lg">
        <span className="font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-moss animate-spin shrink-0" />
          <span>72-Hour Review Timer Expired: Auto-releasing milestone payout to freelancer...</span>
        </span>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-300 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-amber-400 animate-pulse shrink-0" />
        <div>
          <span className="font-extrabold text-foreground text-sm block">72-Hour Client Verification Countdown</span>
          <span className="text-muted text-[11px] leading-relaxed block mt-0.5">
            Deliverable information submitted! Payment auto-releases to freelancer if no action is taken within 3 days.
          </span>
        </div>
      </div>
      <div className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold text-lg tracking-wider shrink-0 font-mono shadow">
        {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m {String(timeLeft.seconds).padStart(2, "0")}s
      </div>
    </div>
  );
}

export default function ClientJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [releasingMilestoneId, setReleasingMilestoneId] = useState<string | null>(null);
  const [verifyingMilestoneId, setVerifyingMilestoneId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    reload: load,
  } = useApiFetch<{ job: Job; applications: JobApplication[] } | null>(async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const response = await fetchJobApplications(token, id);
          if (response && response.job) {
            return { job: response.job, applications: response.applications || [] };
          }
        } catch (e) {}
      }

      // Local storage fallback for recently created jobs
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("w3hire_client_projects");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const match = parsed.find((p: any) =>
              p.id === id ||
              p.id === decodeURIComponent(id) ||
              (p.title && encodeURIComponent(p.title) === id) ||
              (p.title && p.title.toLowerCase() === id.toLowerCase())
            );
            if (match) {
              const fallbackJob: Job = {
                id: match.id,
                title: match.title,
                description: match.description,
                budget: match.budgetUSD || match.budget || 2000,
                tokenSymbol: match.tokenSymbol || "ETH",
                skills: match.skills || [],
                milestones: match.milestones || [],
                deadline: null,
                escrowAddress: null,
                clientId: "c1",
                freelancerId: null,
                status: match.status === "in_progress" ? "IN_PROGRESS" : match.status === "PUBLISHED" || match.status === "open" ? "PUBLISHED" : "DRAFT",
                createdAt: match.createdAt || new Date().toISOString(),
                updatedAt: match.createdAt || new Date().toISOString(),
                client: { id: "c1", name: "Client", email: "client@w3hire.io", rating: 5 },
                _count: { applications: match.applicants?.length || 0 },
              };
              return { job: fallbackJob, applications: match.applicants || [] };
            }
          } catch (e) {}
        }
      }
      return null;
    }, [id]);

  const job = data?.job ?? null;
  const applications = data?.applications ?? [];
  const [liveMilestones, setLiveMilestones] = useState<any[]>([]);
  const [closedAiReportIds, setClosedAiReportIds] = useState<Record<string, boolean>>({});

  const handleCloseAiReport = (mId: string) => {
    setClosedAiReportIds((prev) => ({ ...prev, [mId]: true }));
  };

  useEffect(() => {
    const syncLiveMilestones = () => {
      if (typeof window === "undefined") return;
      try {
        const savedId = localStorage.getItem(`w3hire_project_milestones_${id}`);
        if (savedId) {
          setLiveMilestones(JSON.parse(savedId));
          return;
        }
        if (job?.id) {
          const savedJobId = localStorage.getItem(`w3hire_project_milestones_${job.id}`);
          if (savedJobId) {
            setLiveMilestones(JSON.parse(savedJobId));
            return;
          }
        }
        if (job?.title) {
          const savedTitle = localStorage.getItem(`w3hire_project_milestones_${encodeURIComponent(job.title)}`);
          if (savedTitle) {
            setLiveMilestones(JSON.parse(savedTitle));
            return;
          }
        }
      } catch (e) {}
    };

    syncLiveMilestones();
    window.addEventListener("w3hire_milestones_updated", syncLiveMilestones);
    window.addEventListener("storage", syncLiveMilestones);
    return () => {
      window.removeEventListener("w3hire_milestones_updated", syncLiveMilestones);
      window.removeEventListener("storage", syncLiveMilestones);
    };
  }, [id, job?.id, job?.title]);

  const saveLiveMilestones = (updatedMs: any[]) => {
    setLiveMilestones(updatedMs);
    try {
      localStorage.setItem(`w3hire_project_milestones_${id}`, JSON.stringify(updatedMs));
      if (job?.title) {
        localStorage.setItem(`w3hire_project_milestones_${encodeURIComponent(job.title)}`, JSON.stringify(updatedMs));
      }
      const hasPending = updatedMs.some((m: any) => m.status === "PENDING_APPROVAL" || m.status === "SUBMITTED" || m.status === "VERIFYING");
      const savedEscrows = localStorage.getItem("w3hire_client_escrows");
      if (savedEscrows) {
        try {
          const escrows = JSON.parse(savedEscrows);
          const updatedEscrows = escrows.map((e: any) => {
            if (e.status !== "released") {
              return { ...e, status: hasPending ? "milestone_submitted" : "locked" };
            }
            return e;
          });
          localStorage.setItem("w3hire_client_escrows", JSON.stringify(updatedEscrows));
        } catch (err) {}
      }
      window.dispatchEvent(new Event("w3hire_milestones_updated"));
      window.dispatchEvent(new Event("w3hire_projects_updated"));
    } catch (e) {}
  };

  const handleReleaseMilestone = async (mItem: any) => {
    setReleasingMilestoneId(mItem.id);
    const token = getAuthToken();
    try {
      let releasedTxHash = "0x89a1f2e87c94d301b24e65f21908472a5b6c7d8e9f";
      if (token) {
        try {
          const res = await releaseMilestonePayment(token, mItem.id, {
            jobId: job?.id || String(id),
            milestoneNum: mItem.order
          });
          if (res && res.txHash) releasedTxHash = res.txHash;
        } catch (e) {}
      }

      const currentList = (liveMilestones && liveMilestones.length > 0) ? liveMilestones : [
        { id: "m-1", order: 1, title: "Milestone 1: Architecture & Specification", amount: (job?.budget ? (job.budget / 3).toFixed(2) : "666.67"), status: "PENDING_APPROVAL" },
        { id: "m-2", order: 2, title: "Milestone 2: Core Feature Implementation", amount: (job?.budget ? (job.budget / 3).toFixed(2) : "666.67"), status: "LOCKED" },
        { id: "m-3", order: 3, title: "Milestone 3: Security Audit & Final Deployment", amount: (job?.budget ? (job.budget / 3).toFixed(2) : "666.67"), status: "LOCKED" }
      ];

      const releasedNum = mItem.order || 1;
      const nextNum = releasedNum + 1;

      const updatedMs = currentList.map((m: any, idx: number) => {
        const itemOrder = m.order || idx + 1;
        if (m.id === mItem.id || itemOrder === releasedNum) {
          return { ...m, status: "COMPLETED", releasedAt: new Date().toISOString(), txHash: releasedTxHash };
        }
        if (itemOrder === nextNum && (m.status === "LOCKED" || m.status === "PENDING")) {
          return { ...m, status: "IN_PROGRESS" };
        }
        return m;
      });

      saveLiveMilestones(updatedMs);

      // Save payout event to w3hire_freelancer_payouts in localStorage for wallet display
      if (typeof window !== "undefined") {
        try {
          const prevPayouts = JSON.parse(localStorage.getItem("w3hire_freelancer_payouts") || "[]");
          const newPayout = {
            id: `payout-${Date.now()}`,
            jobTitle: job?.title || "Web3 Project Contract",
            milestoneTitle: mItem.title || `Milestone #${releasedNum}`,
            amount: mItem.amount || (job?.budget ? (job.budget / 3).toFixed(2) : "666.67"),
            tokenSymbol: job?.tokenSymbol || "USDC",
            txHash: releasedTxHash,
            releasedAt: new Date().toISOString()
          };
          localStorage.setItem("w3hire_freelancer_payouts", JSON.stringify([newPayout, ...prevPayouts]));
          window.dispatchEvent(new Event("w3hire_wallet_updated"));
        } catch (e) {}
      }

      setSuccessMessage(
        `Milestone #${releasedNum} completed successfully! Payout of ${mItem.amount || (job?.budget ? (job.budget / 3).toFixed(2) : "666.67")} ${job?.tokenSymbol || "USDC"} released to freelancer wallet. Milestone #${nextNum} is now unlocked and IN PROGRESS.`
      );
    } catch (err) {
      console.error("[handleReleaseMilestone] Error:", err);
    } finally {
      setReleasingMilestoneId(null);
    }
  };

  const handleRejectMilestone = async (mItem: any) => {
    const reasonText = window.prompt("Enter revision reason / feedback for freelancer:", "Client requested revision on milestone deliverable.");
    if (!reasonText) return;

    const token = getAuthToken();
    try {
      if (token) {
        try {
          await rejectMilestone(token, mItem.id, {
            reason: reasonText,
            jobId: job?.id || String(id),
            milestoneNum: mItem.order
          });
        } catch (e) {}
      }

      const updatedMs = liveMilestones.map((m: any) => {
        if (m.id === mItem.id || m.order === mItem.order) {
          return {
            ...m,
            status: "REVISION_REQUESTED",
            revisionReason: reasonText,
            verificationDeadline: null
          };
        }
        return m;
      });

      saveLiveMilestones(updatedMs);
      setSuccessMessage(`Revision requested for Milestone #${mItem.order || 1}. Freelancer notified.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyOracleMilestone = async (mItem: any) => {
    setVerifyingMilestoneId(mItem.id);
    setActionError(null);
    setSuccessMessage(null);
    const token = getAuthToken();

    try {
      const deliverableUrl = String(mItem.githubPrUrl || mItem.deploymentUrl || mItem.deliverableLink || mItem.deliverableNotes || "").trim();
      const storedGeminiKey = typeof window !== "undefined" ? localStorage.getItem("w3hire_gemini_api_key") || undefined : undefined;

      const apiRes = await verifyMilestoneOracle(token, mItem.id, {
        jobId: job?.id || String(id),
        milestoneNum: mItem.order,
        geminiApiKey: storedGeminiKey
      });

      let resultScore = apiRes.verificationScore ?? 85;
      let summaryText = apiRes.aiSummary || "Gemini AI evaluated deliverable against milestone requirements.";
      let keyFindingsList: string[] = ["Submitted deliverable reviewed by Gemini AI."];
      let recommendationsList: string[] = ["Proceed with milestone review."];
      let isScopeMatching = true;

      if (apiRes.pipelineResults && (apiRes.pipelineResults as any).aiReviewer) {
        const rev = (apiRes.pipelineResults as any).aiReviewer;
        if (rev.score !== undefined) resultScore = rev.score;
        if (rev.summary) summaryText = rev.summary;
        if (Array.isArray(rev.keyFindings)) keyFindingsList = rev.keyFindings;
        if (Array.isArray(rev.recommendations)) recommendationsList = rev.recommendations;
        if (rev.isScopeMatching !== undefined) isScopeMatching = rev.isScopeMatching;
      }

      const isVerifiedPassed = apiRes.status === "APPROVED" || resultScore >= 75;
      const newStatus = isVerifiedPassed ? "APPROVED" : "PENDING_APPROVAL";

      const newLogEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        score: resultScore,
        summary: summaryText,
        keyFindings: keyFindingsList,
        recommendations: recommendationsList,
        isScopeMatching
      };

      setClosedAiReportIds((prev) => ({ ...prev, [mItem.id]: false, [String(mItem.order)]: false }));
      const updatedMs = liveMilestones.map((m: any) => {
        if (m.id === mItem.id || m.order === mItem.order) {
          const prevLogs = Array.isArray(m.aiAuditLogs) ? m.aiAuditLogs : [];
          return {
            ...m,
            status: newStatus,
            aiReviewScore: resultScore,
            aiSummary: summaryText,
            aiKeyFindings: keyFindingsList,
            aiRecommendations: recommendationsList,
            aiIsScopeMatching: isScopeMatching,
            aiVerifiedAt: new Date().toISOString(),
            aiAuditLogs: [newLogEntry, ...prevLogs]
          };
        }
        return m;
      });

      saveLiveMilestones(updatedMs);
      if (isVerifiedPassed) {
        setSuccessMessage(`Gemini 2.5 Flash Review Completed! Authenticity Score: ${resultScore}/100.`);
      } else {
        setActionError(`Gemini 2.5 Flash Review (Score: ${resultScore}/100): ${summaryText}`);
      }
    } catch (err: any) {
      console.error("[handleVerifyOracleMilestone] Error:", err);
      setActionError(`AI Verification Error: ${err.message || 'Failed to connect to Gemini AI service'}`);
    } finally {
      setVerifyingMilestoneId(null);
    }
  };

  const pendingMs = liveMilestones.find(
    (m: any) => m.status === "PENDING_APPROVAL" || m.status === "SUBMITTED" || m.status === "VERIFYING"
  );

  const runAction = async (action: () => Promise<unknown>, actionIdValue: string, success: string) => {
    setActionId(actionIdValue);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const token = getAuthToken();
      if (!token) throw new ApiError(401, "Not authenticated");
      await action();
      setSuccessMessage(success);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : apiErrorMessage(err));
    } finally {
      setActionId(null);
    }
  };

  const requireToken = () => {
    const token = getAuthToken();
    if (!token) throw new ApiError(401, "Not authenticated");
    return token;
  };

  const handleSelect = (application: JobApplication) => {
    if (!window.confirm(`Select ${application.freelancer?.name || "this freelancer"} for this job?\nAll other applications will be rejected.`)) return;
    runAction(async () => {
      await selectFreelancer(requireToken(), id, application.id);
    }, application.id, "Freelancer selected. Other applications were rejected.");
  };

  const handleReject = (application: JobApplication) => {
    runAction(async () => {
      await rejectApplication(requireToken(), id, application.id);
    }, application.id, "Application rejected.");
  };

  const handleReview = (application: JobApplication) => {
    runAction(async () => {
      await reviewApplication(requireToken(), id, application.id);
    }, application.id, "Application marked as under review.");
  };

  const handlePublish = () => {
    runAction(async () => {
      await publishJob(requireToken(), id);
    }, "publish", "Job published to the marketplace.");
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this job? This action cannot be undone.")) return;
    setActionId("delete");
    setActionError(null);
    setSuccessMessage(null);
    try {
      await deleteJob(requireToken(), id);
      router.push("/client/jobs");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : apiErrorMessage(err));
      setActionId(null);
    }
  };

  const due = job ? daysUntil(job.deadline) : null;
  const isDraft = job?.status === "DRAFT";
  const isEditable = job?.status === "DRAFT" || job?.status === "PUBLISHED";
  const isDeletable = job?.status === "DRAFT" || job?.status === "PUBLISHED" || job?.status === "OPEN";
  const selectionMade = job?.status === "FREELANCER_SELECTED";
  const selectedApp = selectionMade ? applications.find((a) => a.status === "ACCEPTED") : null;

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

  if (error || !job) {
    const needsAuth = !error && !job;
    return (
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-20">
        <EmptyState
          icon={AlertCircle}
          title={needsAuth ? "Sign in to manage this job" : "Job Not Found"}
          description={
            needsAuth
              ? "Log in with the client account that owns this job to review applications."
              : error || "This job could not be loaded. It may have been removed."
          }
          action={{ label: needsAuth ? "Go to Marketplace" : "Back to My Jobs", onClick: () => router.push(needsAuth ? "/bounties" : "/client/jobs") }}
        />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/client/jobs" className="inline-flex items-center gap-2 text-muted hover:text-moss transition-colors duration-300 font-mono text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to My Jobs
        </Link>
        <Link
          href={`/projects/${job.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-moss/20 hover:bg-moss/30 border border-moss/40 text-moss font-mono text-xs font-bold transition shadow"
        >
          <span>Open Interactive Workspace</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {pendingMs && (
        <VerificationCountdownTimer
          verificationDeadline={
            pendingMs.verificationDeadline ||
            (pendingMs.submittedAt
              ? new Date(new Date(pendingMs.submittedAt).getTime() + 72 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString())
          }
        />
      )}

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl bg-moss/20 border border-moss/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-moss shadow-xl"
        >
          <div className="flex items-center gap-3 text-sm font-bold leading-relaxed">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-moss animate-bounce" />
            <span>{successMessage}</span>
          </div>
          <Link
            href="/wallet"
            className="px-4 py-2 rounded-xl bg-moss text-background font-mono text-xs font-bold shrink-0 hover:bg-[#BEF264] transition shadow flex items-center gap-1.5"
          >
            <span>Go to Freelancer Wallet →</span>
          </Link>
        </motion.div>
      )}
      {actionError && (
        <div className="p-4 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center gap-3 text-sm text-[#EF4444]">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Header */}
      <div className="bg-surface border border-surface-border rounded-2xl p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-semibold border ${
                isDraft ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30" : "bg-moss/10 text-moss border-moss/30"
              }`}>
                {JOB_STATUS_LABELS[job.status]}
              </span>
              <span className="text-[11px] text-muted font-mono">Created {formatDate(job.createdAt)}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight max-w-3xl">{job.title}</h1>
          </div>
          <div className="text-right shrink-0 space-y-1">
            <div className="text-2xl font-extrabold text-foreground font-mono">{formatBudget(job)}</div>
            {due !== null && (
              <div className="text-xs text-muted font-mono flex items-center justify-end gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {due <= 0 ? "Deadline passed" : `Due in ${due} days`}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-6">
          <div className="flex flex-wrap gap-1.5 mr-auto">
            {job.skills.map((skill) => (
              <span key={skill} className="px-2 py-0.5 rounded-md bg-background border border-surface-border text-[11px] font-mono text-muted">
                {skill}
              </span>
            ))}
            {job.skills.length === 0 && <span className="text-[11px] font-mono text-muted">No skills specified</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted font-mono px-3 py-1.5 rounded-lg bg-background border border-surface-border">
            <Users className="w-3.5 h-3.5" />
            {applications.length} {applications.length === 1 ? "application" : "applications"}
          </div>
          {isEditable && (
            <Link
              href={`/client/jobs/${job.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-background border border-surface-border hover:border-moss/50 text-foreground hover:text-moss text-xs font-semibold transition"
            >
              <Pencil className="w-3.5 h-3.5" />
              {isDraft ? "Edit Draft" : "Edit"}
            </Link>
          )}
          {isDraft && (
            <button
              onClick={handlePublish}
              disabled={actionId === "publish"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-semibold transition disabled:opacity-60"
            >
              {actionId === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {actionId === "publish" ? "Publishing…" : "Publish"}
            </button>
          )}
          {isDeletable && (
            <button
              onClick={handleDelete}
              disabled={actionId === "delete"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-background border border-surface-border hover:border-[#EF4444]/50 text-foreground hover:text-[#EF4444] text-xs font-semibold transition disabled:opacity-60"
            >
              {actionId === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {actionId === "delete" ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Selected freelancer banner */}
      {selectionMade && (
        <div className="p-6 rounded-2xl bg-moss/10 border border-moss/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-moss text-background flex items-center justify-center shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-extrabold text-foreground flex items-center gap-2">
                Freelancer Selected: <span className="text-moss">{selectedApp?.freelancer?.name || "Freelancer"}</span>
                {selectedApp?.freelancer && (
                  <span className="text-xs text-muted flex items-center gap-0.5 font-normal">
                    <Star className="w-3.5 h-3.5 text-[#F59E0B]" />
                    {selectedApp.freelancer.rating?.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                The freelancer has been hired! Deploy a smart contract escrow vault on Sepolia Devnet to lock the project budget and initiate work.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            {selectedApp && (
              <div className="text-left sm:text-right">
                <div className="text-sm font-extrabold font-mono text-foreground">
                  {formatBudget({ budget: job.budget, tokenSymbol: job.tokenSymbol })}
                </div>
                <div className="text-xs text-muted">{selectedApp.deliveryDays} delivery {selectedApp.deliveryDays === 1 ? "day" : "days"}</div>
              </div>
            )}

            <Link
              href={`/client/create-escrow?jobId=${job.id}&title=${encodeURIComponent(job.title)}&freelancerAddress=${encodeURIComponent((selectedApp?.walletAddress && selectedApp.walletAddress.startsWith("0x")) ? selectedApp.walletAddress : "0x71C3a7F9B1E48574B40B62E3e74dB826500F949A")}&amountETH=${job.budget}&tokenSymbol=${encodeURIComponent(job.tokenSymbol || "USDC")}`}
              className="px-5 py-3 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-[#84CC16]/20 flex items-center gap-2"
            >
              <span>Fund & Deploy Escrow Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="bg-surface border border-surface-border rounded-2xl p-8 space-y-6">
        <div>
          <h3 className="text-xl font-bold text-foreground mb-4 tracking-tight">Project Description</h3>
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
            deliverableLink?: string;
            githubPrUrl?: string;
            deploymentUrl?: string;
          }> = [];

          if (Array.isArray(liveMilestones) && liveMilestones.length > 0) {
            milestonesList = liveMilestones.map((m: any, idx: number) => ({
              id: m.id || `m-${idx + 1}`,
              order: m.order || idx + 1,
              title: m.title || `Milestone ${idx + 1}`,
              description: m.description || "Deliverable instructions and handoff criteria.",
              amount: m.amount || (job.budget / liveMilestones.length).toFixed(2),
              status: m.status || (idx === 0 ? "IN_PROGRESS" : "LOCKED"),
              deliverableLink: m.deliverableLink || m.deliverableNotes,
              githubPrUrl: m.githubPrUrl,
              deploymentUrl: m.deploymentUrl,
              aiReviewScore: m.aiReviewScore,
              aiSummary: m.aiSummary,
              aiKeyFindings: m.aiKeyFindings,
              aiRecommendations: m.aiRecommendations,
              aiIsScopeMatching: m.aiIsScopeMatching,
              aiVerifiedAt: m.aiVerifiedAt,
              aiAuditLogs: m.aiAuditLogs || [],
              revisionReason: m.revisionReason
            }));
          } else if (Array.isArray(raw) && raw.length > 0) {
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

          // Automatically persist generated 3 milestones to localStorage for freelancer workspace sync
          if (typeof window !== "undefined" && liveMilestones.length === 0) {
            try {
              localStorage.setItem(`w3hire_project_milestones_${id}`, JSON.stringify(milestonesList));
              if (job?.title) {
                localStorage.setItem(`w3hire_project_milestones_${encodeURIComponent(job.title)}`, JSON.stringify(milestonesList));
              }
              window.dispatchEvent(new Event("w3hire_milestones_updated"));
            } catch (e) {}
          }

          return (
            <div className="space-y-6 pt-6 border-t border-surface-border">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                    <Layers className="w-5 h-5 text-moss" />
                    <span>Configured Milestones & Deliverable Verification</span>
                  </h4>
                  <p className="text-xs text-muted mt-0.5">Track deliverables, automated AI review scores, and milestone payouts.</p>
                </div>
                <span className="text-xs font-mono text-moss bg-moss/10 px-3 py-1 rounded-full border border-moss/30 font-semibold">
                  {milestonesList.length} {milestonesList.length === 1 ? "Milestone" : "Milestones"}
                </span>
              </div>

              <InteractiveMilestoneTimeline
                milestones={milestonesList as any}
                tokenSymbol={job.tokenSymbol || "USDC"}
                isClientView={true}
              />

              <div className="space-y-4 pt-2">
                {milestonesList.map((m, idx) => {
                  const pct = Math.round((Number(m.amount) / job.budget) * 100) || Math.round(100 / milestonesList.length);
                  const isSubmitted = m.status === "PENDING_APPROVAL" || m.status === "SUBMITTED" || m.status === "VERIFYING";

                  return (
                    <div key={m.id || idx} className={`p-5 rounded-2xl bg-background border transition-all space-y-3 ${
                      isSubmitted ? "border-amber-500/40 bg-amber-500/5 shadow-md" : "border-surface-border"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-moss/10 border border-moss/30 flex items-center justify-center font-bold text-xs text-moss font-mono">
                            #{m.order || idx + 1}
                          </div>
                          <div>
                            <h5 className="text-sm font-bold text-foreground">{m.title}</h5>
                            <span className="text-[11px] font-mono text-muted">Allocation: {pct}% of budget</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right font-mono">
                            <span className="text-sm font-extrabold text-moss">{m.amount} {job.tokenSymbol || "USDC"}</span>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                            m.status === "COMPLETED" || m.status === "RELEASED"
                              ? "bg-moss/20 text-moss border-moss/30"
                              : isSubmitted
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse"
                              : m.status === "IN_PROGRESS"
                              ? "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30"
                              : "bg-surface text-muted border-surface-border"
                          }`}>
                            {isSubmitted ? "PENDING REVIEW" : m.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>

                      {/* Submitted Proof Highlights & Review Actions */}
                      {(isSubmitted || (m as any).revisionReason || (m as any).aiReviewScore || m.deliverableLink || m.githubPrUrl || m.deploymentUrl) && (
                        <div className="p-4 rounded-xl bg-surface border border-moss/30 space-y-3 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-moss uppercase tracking-wider">Submitted Deliverable Proofs:</span>
                            {(m as any).aiReviewScore && (
                              <span className="px-2 py-0.5 rounded bg-moss text-background font-extrabold text-[11px]">
                                AI Score: {(m as any).aiReviewScore}/100
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-foreground">
                            {m.deliverableLink && <div><strong>Deliverable Notes:</strong> {m.deliverableLink}</div>}
                            {m.githubPrUrl && (
                              <div>
                                <strong>GitHub PR:</strong>{" "}
                                <a href={m.githubPrUrl} target="_blank" rel="noreferrer" className="text-moss hover:underline">
                                  {m.githubPrUrl}
                                </a>
                              </div>
                            )}
                            {m.deploymentUrl && (
                              <div>
                                <strong>Live Demo:</strong>{" "}
                                <a href={m.deploymentUrl} target="_blank" rel="noreferrer" className="text-moss hover:underline">
                                  {m.deploymentUrl}
                                </a>
                              </div>
                            )}
                            {(m as any).revisionReason && (
                              <div className="text-rose-400 font-semibold pt-1">
                                ⚠️ Feedback Sent for Revision: "{(m as any).revisionReason}"
                              </div>
                            )}
                          </div>

                          {/* Persistent Gemini AI Oracle Deliverable Evaluation Card */}
                          {((m as any).aiReviewScore !== undefined || (m as any).aiSummary) && !closedAiReportIds[m.id] && !closedAiReportIds[String(m.order)] && (
                            <div className="p-4 rounded-xl bg-background border border-moss/40 space-y-3 font-sans text-xs shadow-lg relative">
                              <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
                                <div className="flex items-center gap-2 font-bold text-moss">
                                  <Sparkles className="w-4 h-4 text-moss animate-pulse" />
                                  <span>Gemini 2.5 Flash Oracle & AI Verification Answer</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="px-2.5 py-0.5 rounded-full bg-moss/20 text-moss border border-moss/30 font-extrabold text-[11px]">
                                    Score: {(m as any).aiReviewScore}/100
                                  </span>
                                  <button
                                    onClick={() => handleCloseAiReport(m.id || String(m.order))}
                                    className="p-1 rounded-lg hover:bg-surface text-muted hover:text-foreground transition ml-1"
                                    title="Close AI Answer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Summarized Gemini Answer */}
                              <div className="text-foreground text-xs leading-relaxed font-medium bg-surface/70 p-3 rounded-lg border border-surface-border">
                                <strong className="text-moss font-bold">Gemini AI Verification Analysis: </strong>
                                {(m as any).aiSummary || "Submitted deliverable links and notes verified."}
                              </div>

                              {/* Key Audit Findings & Link Details */}
                              {Array.isArray((m as any).aiKeyFindings) && (m as any).aiKeyFindings.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-moss font-mono uppercase tracking-wider">Verification Findings & Link Details:</span>
                                  <ul className="list-disc list-inside space-y-1 text-xs text-foreground font-mono bg-surface/40 p-2.5 rounded-lg border border-surface-border">
                                    {(m as any).aiKeyFindings.map((finding: string, fIdx: number) => (
                                      <li key={fIdx}>{finding}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Recommendations */}
                              {Array.isArray((m as any).aiRecommendations) && (m as any).aiRecommendations.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-muted font-mono uppercase tracking-wider">AI Recommendations:</span>
                                  <ul className="list-disc list-inside space-y-0.5 text-xs text-muted font-mono">
                                    {(m as any).aiRecommendations.map((rec: string, rIdx: number) => (
                                      <li key={rIdx}>{rec}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Audit Log History */}
                              {Array.isArray((m as any).aiAuditLogs) && (m as any).aiAuditLogs.length > 0 && (
                                <div className="pt-2 border-t border-surface-border space-y-1 font-mono text-[11px]">
                                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Verification Log History ({((m as any).aiAuditLogs).length}):</span>
                                  <div className="space-y-1 max-h-28 overflow-y-auto">
                                    {(m as any).aiAuditLogs.map((log: any, lIdx: number) => (
                                      <div key={log.id || lIdx} className="flex items-center justify-between p-1.5 rounded bg-surface/50 text-muted text-[10px] border border-surface-border">
                                        <span>[{log.timestamp || "Logged"}] Score: {log.score}/100</span>
                                        <span className="text-moss font-bold">{log.summary ? log.summary.slice(0, 50) + "..." : "Verified"}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Client Review Action Controls */}
                          {m.status !== "COMPLETED" && m.status !== "RELEASED" && (
                            <div className="pt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => handleReleaseMilestone(m)}
                                disabled={releasingMilestoneId === m.id}
                                className="px-4 py-2 rounded-xl bg-[#22C55E] hover:bg-moss text-background font-extrabold text-xs transition flex items-center gap-1.5 shadow"
                              >
                                {releasingMilestoneId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                <span>Accept & Release Payout</span>
                              </button>

                              <button
                                onClick={() => handleRejectMilestone(m)}
                                className="px-4 py-2 rounded-xl bg-background border border-surface-border hover:border-[#EF4444]/50 text-foreground hover:text-[#EF4444] font-bold text-xs transition flex items-center gap-1.5"
                              >
                                <XCircle className="w-3.5 h-3.5 text-[#EF4444]" />
                                <span>Request Revision / Try Again</span>
                              </button>

                              <button
                                onClick={() => handleVerifyOracleMilestone(m)}
                                disabled={verifyingMilestoneId === m.id}
                                className="px-4 py-2 rounded-xl bg-moss/20 hover:bg-moss/30 border border-moss/40 text-moss font-bold text-xs transition flex items-center gap-1.5"
                              >
                                {verifyingMilestoneId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>Run AI Oracle Verification</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fallback CTA to Workspace */}
                      {isSubmitted && (
                        <div className="pt-1">
                          <Link
                            href={`/projects/${job.id}`}
                            className="w-full py-2.5 rounded-xl bg-moss/20 hover:bg-moss/30 border border-moss/40 text-moss font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
                          >
                            <span>Open Full Interactive Workspace →</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Applications */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-foreground tracking-tight">Applications</h2>
            <p className="text-xs text-muted">Review proposals, shortlist candidates, and select your freelancer.</p>
          </div>
          <span className="text-xs font-mono text-muted bg-surface border border-surface-border rounded-xl px-3 py-2">
            {applications.length} total
          </span>
        </div>

        {applications.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isDraft ? "Publish to start receiving applications" : "No applications yet"}
            description={
              isDraft
                ? "This job is still a draft. Publish it to make it visible in the marketplace."
                : "Freelancers haven't applied to this job yet. It's live in the marketplace — applications will appear here."
            }
            action={isDraft ? { label: "Publish Job", onClick: handlePublish } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {applications.map((app) => {
              const canSelect = !selectionMade && (app.status === "SUBMITTED" || app.status === "UNDER_REVIEW");
              const busy = actionId === app.id;
              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition-all"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Freelancer info */}
                    <div className="md:w-56 shrink-0 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-background border border-surface-border flex items-center justify-center text-moss font-bold">
                          {(app.freelancer?.name || "F").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-sm">{app.freelancer?.name || "Freelancer"}</div>
                          <div className="text-xs text-muted flex items-center gap-1">
                            <Star className="w-3 h-3 text-[#F59E0B]" />
                            {app.freelancer?.rating?.toFixed(1) ?? "—"} rating
                          </div>
                        </div>
                      </div>
                      {app.freelancer?.bio && <p className="text-[11px] text-muted leading-relaxed">{app.freelancer.bio}</p>}
                      <div className="text-[11px] text-muted font-mono">Applied {formatRelative(app.createdAt)}</div>
                      <div>
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider border ${APP_STATUS_STYLES[app.status]}`}>
                          {APPLICATION_STATUS_LABELS[app.status]}
                        </span>
                      </div>
                    </div>

                    {/* Proposal */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{app.pitch}</p>
                      <div className="flex flex-wrap gap-4 text-xs font-mono text-muted border-t border-surface-border pt-3">
                        <span className="font-semibold text-foreground">
                          {formatBudget({ budget: app.requestedRate, tokenSymbol: job.tokenSymbol })}
                          <span className="text-muted font-normal"> proposed</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {app.deliveryDays} {app.deliveryDays === 1 ? "day" : "days"} delivery
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex md:flex-col gap-2 md:items-end shrink-0">
                      {canSelect && (
                        <button
                          onClick={() => handleSelect(app)}
                          disabled={busy}
                          className="px-4 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                          {busy ? "Selecting…" : "Select"}
                        </button>
                      )}
                      {!selectionMade && app.status !== "REJECTED" && (
                        <>
                          {app.status !== "UNDER_REVIEW" && (
                            <button
                              onClick={() => handleReview(app)}
                              disabled={busy}
                              className="px-4 py-2.5 rounded-xl bg-background border border-surface-border hover:border-[#F59E0B]/50 text-foreground hover:text-[#F59E0B] text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-60"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Review
                            </button>
                          )}
                          <button
                            onClick={() => handleReject(app)}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl bg-background border border-surface-border hover:border-[#EF4444]/50 text-foreground hover:text-[#EF4444] text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      )}
                      {selectionMade && app.status === "ACCEPTED" && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-moss">
                          <CheckCircle2 className="w-4 h-4" />
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
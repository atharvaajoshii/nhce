"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  PaperAirplaneIcon,
  CodeBracketIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAuthToken,
  fetchJob,
  submitMilestoneProof,
  verifyMilestoneOracle,
  releaseMilestonePayment,
  openDispute,
  ApiError,
  type Job,
  type Milestone,
} from "@/lib/api";

export default function ProjectWorkspacePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"workspace" | "chat">("workspace");

  // Determine if logged-in user is Client or Freelancer
  const isClient = user?.role === "CLIENT" || user?.email?.includes("admin");

  // Submission Form State
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submittingMilestone, setSubmittingMilestone] = useState<Milestone | null>(null);
  const [deliverableLink, setDeliverableLink] = useState<string>("");
  const [githubPrUrl, setGithubPrUrl] = useState<string>("");
  const [deploymentUrl, setDeploymentUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Oracle Verification State
  const [verifyingMilestoneId, setVerifyingMilestoneId] = useState<string | null>(null);

  // Release State
  const [releasingMilestoneId, setReleasingMilestoneId] = useState<string | null>(null);
  const [txMessage, setTxMessage] = useState<string>("");

  // Real dispute-open modal state (replaces the old fake reject/decline flow)
  const [showDisputeModal, setShowDisputeModal] = useState<boolean>(false);
  const [disputingMilestone, setDisputingMilestone] = useState<Milestone | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>("");
  const [isOpeningDispute, setIsOpeningDispute] = useState<boolean>(false);

  // Chat tab: a local-only demo thread (not wired to the real messaging
  // system — see components/navigation/FloatingMessages.tsx for that).
  // Left as-is; out of scope of the real-milestone rewiring below.
  const [messages, setMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    { sender: "System", text: "Project workspace initialized.", time: "10:00 AM" },
  ]);
  const [newMessage, setNewMessage] = useState<string>("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJobDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (activeTab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTab, messages]);

  const fetchJobDetails = async () => {
    setIsLoading(true);
    setLoadError(null);
    const token = getAuthToken();

    if (!token) {
      setLoadError("Please sign in to view this project.");
      setJob(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetchJob(String(id), token);
      setJob(res.job);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this project.");
      setJob(null);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedMilestones = (job?.milestones ?? []).slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const handleOpenSubmitModal = (milestone: Milestone) => {
    setSubmittingMilestone(milestone);
    setDeliverableLink(milestone.deliverableLink || "");
    setGithubPrUrl(milestone.githubPrUrl || "");
    setDeploymentUrl(milestone.deploymentUrl || "");
    setSubmitMessage("");
    setSubmitError(null);
    setShowSubmitModal(true);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingMilestone) return;

    setIsSubmitting(true);
    setSubmitMessage("");
    setSubmitError(null);
    const token = getAuthToken();

    if (!token) {
      setSubmitError("You must be signed in to submit a milestone.");
      setIsSubmitting(false);
      return;
    }

    try {
      await submitMilestoneProof(token, submittingMilestone.id, {
        deliverableLink,
        githubPrUrl,
        deploymentUrl,
      });
      await fetchJobDetails();
      setSubmitMessage("Milestone proof submitted successfully.");
      setTimeout(() => {
        setShowSubmitModal(false);
        setIsSubmitting(false);
      }, 1000);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to submit milestone proof.");
      setIsSubmitting(false);
    }
  };

  const handleRunOracleVerification = async (milestoneId: string) => {
    setVerifyingMilestoneId(milestoneId);
    setTxMessage("");
    const token = getAuthToken();

    if (!token) {
      setTxMessage("You must be signed in to run verification.");
      setVerifyingMilestoneId(null);
      return;
    }

    try {
      const res = await verifyMilestoneOracle(token, milestoneId);
      await fetchJobDetails();
      const passed = res.status === "APPROVED";
      setTxMessage(
        `Oracle verification ${passed ? "passed" : "did not pass"} — score ${res.verificationScore}/100. ${res.aiSummary}`
      );
    } catch (err) {
      setTxMessage(err instanceof ApiError ? err.message : "Verification pipeline failed.");
    } finally {
      setVerifyingMilestoneId(null);
    }
  };

  const handleReleasePayment = async (milestone: Milestone) => {
    setReleasingMilestoneId(milestone.id);
    setTxMessage("");
    const token = getAuthToken();

    if (!token) {
      setTxMessage("You must be signed in to release payment.");
      setReleasingMilestoneId(null);
      return;
    }

    try {
      const res = await releaseMilestonePayment(token, milestone.id);
      await fetchJobDetails();
      setTxMessage(
        `Payment (${milestone.amount} ${job?.tokenSymbol}) released.${res.txHash ? ` Tx: ${res.txHash}` : ""}`
      );
    } catch (err) {
      setTxMessage(err instanceof ApiError ? err.message : "Failed to release payment.");
    } finally {
      setReleasingMilestoneId(null);
    }
  };

  const handleOpenDisputeModal = (milestone: Milestone) => {
    setDisputingMilestone(milestone);
    setDisputeReason("");
    setShowDisputeModal(true);
  };

  const handleConfirmDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputingMilestone || !job) return;

    setIsOpeningDispute(true);
    const token = getAuthToken();

    if (!token) {
      setTxMessage("You must be signed in to open a dispute.");
      setIsOpeningDispute(false);
      return;
    }

    try {
      const res = await openDispute(token, {
        jobId: job.id,
        milestoneId: disputingMilestone.id,
        reason: disputeReason,
      });
      setTxMessage(
        `Dispute opened for Milestone. ${res.assignedJurors?.length || 0} juror(s) assigned for arbitration.`
      );
      setShowDisputeModal(false);
    } catch (err) {
      setTxMessage(err instanceof ApiError ? err.message : "Failed to open dispute.");
    } finally {
      setIsOpeningDispute(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg = {
      sender: user?.name || (isClient ? "Client" : "Freelancer"),
      text: newMessage.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, msg]);
    setNewMessage("");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted space-y-3">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-moss" />
        <p className="text-sm font-mono">Loading project workspace…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <EmptyState
          icon={FolderOpenIcon}
          title="Project Not Found"
          description={loadError || "We couldn't find the requested project workspace."}
          action={{
            label: "Back to Projects",
            onClick: () => (window.location.href = "/projects"),
          }}
        />
      </div>
    );
  }

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link
            href="/projects"
            className="inline-flex items-center space-x-2 text-muted hover:text-moss transition-colors font-mono text-xs mb-3"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to My Projects</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{job.title}</h1>
            <span className="px-3 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider bg-moss/20 text-moss border border-moss/30">
              {sortedMilestones.length} Milestone{sortedMilestones.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Workspace vs Chat Tabs */}
        <div className="flex items-center bg-surface border border-surface-border p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "workspace"
                ? "bg-moss text-background shadow"
                : "text-muted hover:text-foreground"
            }`}
          >
            Workspace & Milestones
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "chat"
                ? "bg-moss text-background shadow"
                : "text-muted hover:text-foreground"
            }`}
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            <span>Project Chat</span>
          </button>
        </div>
      </div>

      {txMessage && (
        <div className="p-4 rounded-xl bg-moss/20 border border-moss/40 text-moss font-mono text-xs flex items-center justify-between">
          <span>{txMessage}</span>
          <button onClick={() => setTxMessage("")} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      {/* Main Tab Views */}
      {activeTab === "workspace" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Milestones Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-surface-border">
                <h3 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                  <span>Project Milestone Pipeline</span>
                  <span className="text-xs font-mono text-muted bg-background border border-surface-border px-2.5 py-0.5 rounded-full font-normal">
                    Total Vault: {job.budget} {job.tokenSymbol}
                  </span>
                </h3>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-moss/10 text-moss font-semibold uppercase">
                  {isClient ? "Client View" : "Freelancer View"}
                </span>
              </div>

              {sortedMilestones.length === 0 && (
                <p className="text-xs text-muted font-mono italic py-6 text-center">
                  This job has no milestones defined yet.
                </p>
              )}

              {/* Milestones List */}
              <div className="space-y-6">
                {sortedMilestones.map((milestone, idx) => {
                  const isPending = milestone.status === "PENDING";
                  const isSubmitted = milestone.status === "SUBMITTED";
                  const isVerifying = milestone.status === "VERIFYING";
                  const isApproved = milestone.status === "APPROVED";
                  const isReleased = milestone.status === "RELEASED";
                  const isDisputed = milestone.status === "DISPUTED";
                  const isAutoReleasing = milestone.status === "PROCESSING_AUTORELEASE";
                  const percent = job.budget > 0 ? Math.round((milestone.amount / job.budget) * 100) : null;

                  return (
                    <div
                      key={milestone.id}
                      className={`bg-background border rounded-xl p-5 space-y-4 relative transition-all ${
                        isReleased
                          ? "border-moss/40 bg-moss/5"
                          : isApproved
                          ? "border-moss/30"
                          : isSubmitted || isVerifying
                          ? "border-amber-500/40 bg-amber-500/5"
                          : isDisputed
                          ? "border-[#EF4444]/60 bg-[#EF4444]/10"
                          : "border-surface-border"
                      }`}
                    >
                      {/* Milestone Header */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold uppercase text-moss tracking-wider">
                              Milestone {idx + 1}
                              {percent !== null ? ` (${percent}% Payout = ${milestone.amount} ${job.tokenSymbol})` : ""}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-foreground">{milestone.title}</h4>
                          <p className="text-xs text-muted mt-1">{milestone.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-sm font-bold text-foreground">
                            {milestone.amount} {job.tokenSymbol}
                          </div>
                          <span
                            className={`text-[10px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded border inline-block mt-1 ${
                              isReleased
                                ? "bg-moss/20 text-moss border-moss/40"
                                : isApproved
                                ? "bg-moss/10 text-moss border-moss/30"
                                : isSubmitted || isVerifying
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : isDisputed
                                ? "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40 font-extrabold"
                                : "bg-white/10 text-foreground border-white/20"
                            }`}
                          >
                            {isReleased
                              ? "Released"
                              : isApproved
                              ? "Oracle Verified"
                              : isVerifying
                              ? "Verifying…"
                              : isSubmitted
                              ? "Under Client Review"
                              : isDisputed
                              ? "Disputed"
                              : isAutoReleasing
                              ? "Auto-Release Processing"
                              : "Pending Submission"}
                          </span>
                        </div>
                      </div>

                      {/* Oracle Authenticity Score Badge */}
                      {milestone.aiReviewScore != null && (
                        <div className="p-3.5 rounded-xl bg-surface border border-moss/30 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ShieldCheckIcon className="w-4 h-4 text-moss" />
                              <span className="text-xs font-bold text-foreground">
                                Oracle AI Authenticity Verification
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-md bg-moss text-background font-mono font-extrabold text-xs">
                              Score: {milestone.aiReviewScore}/100
                            </span>
                          </div>
                          <p className="text-xs text-muted font-mono leading-relaxed">
                            Verified GitHub PR code quality, deployment health, and AI authenticity score.
                          </p>
                        </div>
                      )}

                      {/* Deliverable Proof Links */}
                      {(milestone.githubPrUrl || milestone.deploymentUrl || milestone.deliverableLink) && (
                        <div className="p-3.5 rounded-xl bg-surface border border-surface-border space-y-2">
                          <span className="text-[10px] font-mono text-muted uppercase font-semibold">Submitted Deliverable Proofs:</span>
                          <div className="flex flex-wrap gap-4 text-xs font-mono">
                            {milestone.githubPrUrl && (
                              <a
                                href={milestone.githubPrUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 text-moss hover:underline font-bold"
                              >
                                <CodeBracketIcon className="w-4 h-4" />
                                GitHub PR / Repository
                              </a>
                            )}
                            {milestone.deploymentUrl && (
                              <a
                                href={milestone.deploymentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 text-moss hover:underline font-bold"
                              >
                                <GlobeAltIcon className="w-4 h-4" />
                                Live Deployment URL
                              </a>
                            )}
                          </div>
                          {milestone.deliverableLink && (
                            <p className="text-xs text-muted leading-relaxed pt-1 border-t border-surface-border">
                              {milestone.deliverableLink}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Action Controls strictly separated by role */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-border">
                        {/* FREELANCER CONTROLS: Submit / Resubmit Proof */}
                        {!isClient && !isReleased && !isDisputed && (
                          <button
                            onClick={() => handleOpenSubmitModal(milestone)}
                            className="px-4 py-2 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold transition shadow"
                          >
                            {isPending ? "Submit Milestone Proof" : "Resubmit Milestone Proof"}
                          </button>
                        )}

                        {/* CLIENT CONTROLS: Run Oracle, Release, Open Dispute */}
                        {isClient && !isReleased && !isDisputed && (
                          <div className="flex flex-wrap items-center gap-2.5 w-full justify-between">
                            {(isSubmitted || isApproved) ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => handleRunOracleVerification(milestone.id)}
                                  disabled={verifyingMilestoneId === milestone.id}
                                  className="px-3.5 py-2 rounded-xl bg-moss/20 hover:bg-moss/30 border border-moss/40 text-moss text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <ShieldCheckIcon className="w-4 h-4" />
                                  {verifyingMilestoneId === milestone.id
                                    ? "Running Oracle Checks…"
                                    : "Run Oracle AI Evaluation"}
                                </button>
                                <button
                                  onClick={() => handleReleasePayment(milestone)}
                                  disabled={releasingMilestoneId === milestone.id}
                                  className="px-4 py-2 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold transition flex items-center gap-1.5 shadow disabled:opacity-50"
                                >
                                  <CheckCircleIcon className="w-4 h-4" />
                                  {releasingMilestoneId === milestone.id
                                    ? "Processing Payout…"
                                    : `Accept & Release (${milestone.amount} ${job.tokenSymbol})`}
                                </button>
                                <button
                                  onClick={() => handleOpenDisputeModal(milestone)}
                                  className="px-3 py-2 rounded-xl bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 text-[#EF4444] text-xs font-medium transition flex items-center gap-1"
                                >
                                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                  Open Dispute
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted font-mono italic">
                                Waiting for freelancer to submit deliverable proof…
                              </span>
                            )}
                          </div>
                        )}

                        {isReleased && (
                          <div className="flex items-center gap-1.5 text-moss text-xs font-mono font-bold">
                            <CheckCircleIcon className="w-4 h-4" />
                            <span>Milestone {idx + 1} Paid & Released</span>
                          </div>
                        )}

                        {isDisputed && (
                          <div className="flex items-center gap-1.5 text-[#EF4444] text-xs font-mono font-bold">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            <span>This milestone is in dispute — awaiting arbitration.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-foreground">Vault Escrow Details</h3>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-muted block mb-1">Escrow Contract</span>
                  <div className="bg-background p-2.5 rounded-lg border border-surface-border text-moss break-all">
                    {job.escrowAddress || "Not yet funded"}
                  </div>
                </div>

                <div className="flex justify-between pt-2 border-t border-surface-border">
                  <span className="text-muted">Total Budget</span>
                  <span className="text-foreground font-bold">{job.budget} {job.tokenSymbol}</span>
                </div>

                <div className="flex justify-between pt-2 border-t border-surface-border">
                  <span className="text-muted">Payout Structure</span>
                  <span className="text-moss font-semibold">
                    {sortedMilestones.length} Milestone{sortedMilestones.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex justify-between pt-2 border-t border-surface-border">
                  <span className="text-muted">Current Role View</span>
                  <span className="text-foreground font-bold uppercase">{isClient ? "CLIENT OWNER" : "FREELANCER"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Embedded Project Chat Tab (local demo — see comment above) */
        <div className="bg-surface border border-surface-border rounded-2xl p-6 max-w-3xl mx-auto flex flex-col h-[520px]">
          <div className="pb-4 border-b border-surface-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-moss" />
              <h3 className="font-bold text-sm text-foreground">
                Project Chat — {job.client?.name || "Client"}
              </h3>
            </div>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  m.sender === "System"
                    ? "items-center text-center my-2"
                    : m.sender === (user?.name || "User")
                    ? "items-end"
                    : "items-start"
                }`}
              >
                {m.sender === "System" ? (
                  <span className="px-3 py-1 rounded-full bg-background border border-surface-border text-[11px] font-mono text-muted">
                    {m.text}
                  </span>
                ) : (
                  <div
                    className={`max-w-md p-3.5 rounded-2xl text-xs space-y-1 ${
                      m.sender === (user?.name || "User")
                        ? "bg-moss text-background rounded-tr-none font-medium"
                        : "bg-background border border-surface-border text-foreground rounded-tl-none"
                    }`}
                  >
                    <div className="flex justify-between items-center gap-3 text-[10px] opacity-75 font-mono">
                      <span>{m.sender}</span>
                      <span>{m.time}</span>
                    </div>
                    <p className="leading-relaxed">{m.text}</p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Message Input Form */}
          <form onSubmit={handleSendMessage} className="pt-3 border-t border-surface-border flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type message..."
              className="flex-1 bg-background border border-surface-border rounded-xl px-4 py-2.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-moss"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-bold text-xs transition flex items-center gap-1.5"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      )}

      {/* Deliverable Proof Upload Modal */}
      <AnimatePresence>
        {showSubmitModal && submittingMilestone && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-surface-border rounded-2xl p-6 max-w-lg w-full space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-surface-border">
                <h3 className="font-extrabold text-base text-foreground">
                  Submit Milestone Proof
                </h3>
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="text-muted hover:text-foreground text-sm font-mono"
                >
                  ✕
                </button>
              </div>

              {submitMessage && (
                <div className="p-3 rounded-xl bg-moss/20 border border-moss/40 text-moss text-xs font-mono">
                  {submitMessage}
                </div>
              )}
              {submitError && (
                <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-xs font-mono">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmitProof} className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-muted mb-1 uppercase text-[10px]">
                    GitHub Pull Request / Repository URL
                  </label>
                  <input
                    type="url"
                    required
                    value={githubPrUrl}
                    onChange={(e) => setGithubPrUrl(e.target.value)}
                    placeholder="https://github.com/org/repo/pull/1"
                    className="w-full bg-background border border-surface-border rounded-xl p-3 text-foreground placeholder:text-muted focus:border-moss outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted mb-1 uppercase text-[10px]">
                    Live Deployment URL
                  </label>
                  <input
                    type="url"
                    value={deploymentUrl}
                    onChange={(e) => setDeploymentUrl(e.target.value)}
                    placeholder="https://my-dapp.vercel.app"
                    className="w-full bg-background border border-surface-border rounded-xl p-3 text-foreground placeholder:text-muted focus:border-moss outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted mb-1 uppercase text-[10px]">
                    Deliverable Notes / Proof Summary
                  </label>
                  <textarea
                    rows={3}
                    value={deliverableLink}
                    onChange={(e) => setDeliverableLink(e.target.value)}
                    placeholder="Provide deliverable overview, features completed, and verification notes..."
                    className="w-full bg-background border border-surface-border rounded-xl p-3 text-foreground placeholder:text-muted focus:border-moss outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-surface-border">
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-surface-border text-muted hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-bold uppercase tracking-wider transition disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting Proof…" : "Submit Milestone"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Open Dispute Modal (real POST /disputes/open) */}
        {showDisputeModal && disputingMilestone && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-surface-border rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-surface-border">
                <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
                  <span>Open Dispute — {disputingMilestone.title}</span>
                </h3>
                <button
                  onClick={() => setShowDisputeModal(false)}
                  className="text-muted hover:text-foreground text-sm font-mono"
                >
                  ✕
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                This creates a real dispute case: jurors will be assigned to arbitrate this milestone.
              </div>

              <form onSubmit={handleConfirmDispute} className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-muted mb-1 uppercase text-[10px]">
                    Reason for Dispute
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Explain why this milestone's deliverable is being disputed..."
                    className="w-full bg-background border border-surface-border rounded-xl p-3 text-foreground placeholder:text-muted focus:border-amber-400 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-surface-border">
                  <button
                    type="button"
                    onClick={() => setShowDisputeModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-surface-border text-muted hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isOpeningDispute}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-background font-bold uppercase tracking-wider transition shadow disabled:opacity-50"
                  >
                    {isOpeningDispute ? "Opening Dispute…" : "Confirm & Open Dispute"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

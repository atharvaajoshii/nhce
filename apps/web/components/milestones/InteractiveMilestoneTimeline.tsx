"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Check,
  Clock,
  AlertTriangle,
  Lock,
  Sparkles,
  FileText,
  ExternalLink,
  ShieldCheck
} from "lucide-react";

export type MilestoneStatusType =
  | "LOCKED"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "REVISION_REQUESTED"
  | "COMPLETED"
  | "PENDING"
  | "SUBMITTED"
  | "VERIFYING"
  | "APPROVED"
  | "RELEASED"
  | "DISPUTED";

export interface TimelineMilestone {
  id: string;
  order?: number;
  title: string;
  description: string;
  amount: number;
  status: MilestoneStatusType;
  submittedAt?: string | Date | null;
  verificationDeadline?: string | Date | null;
  deliverableLink?: string | null;
  deliverableNotes?: string | null;
  revisionReason?: string | null;
  githubPrUrl?: string | null;
  deploymentUrl?: string | null;
  aiReviewScore?: number | null;
}

interface InteractiveMilestoneTimelineProps {
  milestones: TimelineMilestone[];
  tokenSymbol?: string;
  selectedIndex?: number;
  onSelectMilestone?: (index: number) => void;
  isClientView?: boolean;
}

export default function InteractiveMilestoneTimeline({
  milestones = [],
  tokenSymbol = "ETH",
  selectedIndex,
  onSelectMilestone,
  isClientView = false,
}: InteractiveMilestoneTimelineProps) {
  const [internalSelected, setInternalSelected] = useState<number>(0);

  if (!milestones || milestones.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-surface border border-surface-border text-center text-muted text-sm font-mono">
        No milestones configured for this project.
      </div>
    );
  }

  const activeIdx = selectedIndex !== undefined ? selectedIndex : internalSelected;

  const handleSelect = (idx: number) => {
    if (onSelectMilestone) onSelectMilestone(idx);
    else setInternalSelected(idx);
  };

  // Helper to map DB enum status to 5 core visual states
  const getNormalizedStatus = (status: MilestoneStatusType, idx: number): "LOCKED" | "IN_PROGRESS" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "COMPLETED" => {
    if (status === "COMPLETED" || status === "APPROVED" || status === "RELEASED") return "COMPLETED";
    if (status === "REVISION_REQUESTED") return "REVISION_REQUESTED";
    if (status === "PENDING_APPROVAL" || status === "SUBMITTED" || status === "VERIFYING") return "PENDING_APPROVAL";
    if (status === "IN_PROGRESS") return "IN_PROGRESS";
    if (status === "LOCKED" || status === "PENDING") return "LOCKED";

    // Fallback based on sequence
    const firstIncompleteIdx = milestones.findIndex(
      (m) => m.status !== "COMPLETED" && m.status !== "APPROVED" && m.status !== "RELEASED"
    );
    if (firstIncompleteIdx === -1) return "COMPLETED";
    if (idx < firstIncompleteIdx) return "COMPLETED";
    if (idx === firstIncompleteIdx) return "IN_PROGRESS";
    return "LOCKED";
  };

  // Compute percentage of line completed for fluid fill animation
  const completedCount = milestones.filter(
    (m, idx) => getNormalizedStatus(m.status, idx) === "COMPLETED"
  ).length;

  const progressPercentage =
    milestones.length <= 1
      ? completedCount > 0
        ? 100
        : 0
      : Math.min(100, Math.max(0, (completedCount / (milestones.length - 1)) * 100));

  const selectedMilestone = milestones[activeIdx] || milestones[0];
  const normalizedSelectedStatus = getNormalizedStatus(selectedMilestone.status, activeIdx);

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Glow background accent */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-moss/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-moss/10 text-moss border border-moss/20">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground tracking-tight">
              Project Milestone Timeline
            </h2>
            <p className="text-xs text-muted font-mono">
              {completedCount} of {milestones.length} Milestones Completed ({Math.round((completedCount / milestones.length) * 100)}%)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded-full bg-background border border-surface-border text-muted">
            {milestones.length} Dynamic Nodes
          </span>
        </div>
      </div>

      {/* Interactive Progress Line with $N$ Cup Nodes */}
      <div className="py-6 px-4 sm:px-8 relative">
        {/* Background Connecting Bar */}
        <div className="absolute top-1/2 left-8 right-8 h-1.5 -translate-y-1/2 bg-background border-t border-b border-surface-border rounded-full z-0" />

        {/* Animated Fluid Progress Fill Bar */}
        <motion.div
          className="absolute top-1/2 left-8 h-1.5 -translate-y-1/2 bg-gradient-to-r from-moss to-[#BEF264] rounded-full z-0 shadow-[0_0_12px_rgba(132,204,22,0.6)]"
          initial={{ width: "0%" }}
          animate={{ width: `${progressPercentage}%` }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        />

        {/* $N$ Cup Nodes */}
        <div className="relative z-10 flex items-center justify-between">
          {milestones.map((ms, idx) => {
            const state = getNormalizedStatus(ms.status, idx);
            const isSelected = activeIdx === idx;

            return (
              <button
                key={ms.id || idx}
                onClick={() => handleSelect(idx)}
                className="group relative flex flex-col items-center focus:outline-none cursor-pointer"
              >
                {/* Outer Node Circle / Cup Container */}
                <div className="relative">
                  {/* Glowing aura for IN_PROGRESS and PENDING_APPROVAL */}
                  {state === "IN_PROGRESS" && (
                    <span className="absolute -inset-2 rounded-full bg-moss/20 animate-ping opacity-75" />
                  )}
                  {state === "PENDING_APPROVAL" && (
                    <span className="absolute -inset-2 rounded-full bg-amber-500/20 animate-ping opacity-75" />
                  )}

                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-mono font-bold transition-all duration-300 relative border-2 ${
                      state === "COMPLETED"
                        ? "bg-moss text-background border-moss shadow-lg shadow-moss/20 scale-105"
                        : state === "PENDING_APPROVAL"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500 shadow-md shadow-amber-500/20"
                        : state === "REVISION_REQUESTED"
                        ? "bg-rose-500/20 text-rose-400 border-rose-500 shadow-md shadow-rose-500/20"
                        : state === "IN_PROGRESS"
                        ? "bg-surface border-moss text-moss shadow-lg shadow-moss/30 ring-2 ring-moss/40 scale-110"
                        : "bg-background border-surface-border text-muted hover:border-surface-border/80"
                    } ${isSelected ? "ring-4 ring-moss/50" : ""}`}
                  >
                    {/* Node Cup Icon */}
                    {state === "COMPLETED" ? (
                      <Trophy className="w-6 h-6 text-background" />
                    ) : state === "PENDING_APPROVAL" ? (
                      <Clock className="w-6 h-6 animate-pulse" />
                    ) : state === "REVISION_REQUESTED" ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : state === "IN_PROGRESS" ? (
                      <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: "8s" }} />
                    ) : (
                      <Lock className="w-5 h-5 text-muted/60" />
                    )}

                    {/* Checkmark overlay for completed cups */}
                    {state === "COMPLETED" && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border border-moss flex items-center justify-center text-moss shadow">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}

                    {/* Step number badge */}
                    <span className="absolute -top-2 -left-2 px-1.5 py-0.5 rounded-full bg-background border border-surface-border font-mono text-[9px] text-muted">
                      #{idx + 1}
                    </span>
                  </div>
                </div>

                {/* Node Label below cup */}
                <div className="mt-3 text-center max-w-[90px] sm:max-w-[120px]">
                  <span
                    className={`block text-[11px] font-mono font-bold truncate transition-colors ${
                      isSelected ? "text-moss" : state === "COMPLETED" ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {ms.title || `Milestone ${idx + 1}`}
                  </span>
                  <span className="text-[10px] font-mono text-muted block">
                    {ms.amount} {tokenSymbol}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Selected Milestone Detail Box */}
      <div className="p-5 sm:p-6 rounded-2xl bg-background border border-surface-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-surface border border-surface-border font-mono text-xs font-bold text-foreground">
              Milestone #{activeIdx + 1} of {milestones.length}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold uppercase border ${
                normalizedSelectedStatus === "COMPLETED"
                  ? "bg-moss/10 text-moss border-moss/30"
                  : normalizedSelectedStatus === "PENDING_APPROVAL"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : normalizedSelectedStatus === "REVISION_REQUESTED"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : normalizedSelectedStatus === "IN_PROGRESS"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                  : "bg-surface text-muted border-surface-border"
              }`}
            >
              {normalizedSelectedStatus.replace("_", " ")}
            </span>
          </div>

          <div className="font-mono text-base font-extrabold text-moss">
            {selectedMilestone.amount} {tokenSymbol}
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-foreground mb-1">
            {selectedMilestone.title}
          </h3>
          <p className="text-sm text-muted leading-relaxed">
            {selectedMilestone.description}
          </p>
        </div>

        {/* Deliverable Proof Notes / Revision Feedback */}
        {selectedMilestone.deliverableNotes && (
          <div className="p-3.5 rounded-xl bg-surface border border-surface-border space-y-1 text-xs font-mono">
            <span className="text-muted block font-semibold uppercase text-[10px]">Submitted Deliverable Notes:</span>
            <p className="text-foreground leading-relaxed">{selectedMilestone.deliverableNotes}</p>
          </div>
        )}

        {selectedMilestone.revisionReason && normalizedSelectedStatus === "REVISION_REQUESTED" && (
          <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-1 text-xs font-mono">
            <span className="text-rose-400 font-semibold uppercase text-[10px] flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Client Revision Feedback:
            </span>
            <p className="text-rose-300 leading-relaxed">{selectedMilestone.revisionReason}</p>
          </div>
        )}

        {/* Link attachments if any */}
        {(selectedMilestone.githubPrUrl || selectedMilestone.deploymentUrl || selectedMilestone.deliverableLink) && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-surface-border text-xs font-mono">
            {selectedMilestone.githubPrUrl && (
              <a
                href={selectedMilestone.githubPrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-moss hover:underline flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" /> GitHub PR <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {selectedMilestone.deploymentUrl && (
              <a
                href={selectedMilestone.deploymentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-moss hover:underline flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Live Deployment <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

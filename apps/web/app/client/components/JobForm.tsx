"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Trophy, DollarSign, Percent, AlertCircle, CheckCircle2 } from "lucide-react";
import { TOKEN_OPTIONS } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import WalletNoticeBanner from "@/components/ui/WalletNoticeBanner";
import MetaMaskModal from "@/components/metamask-modal";
import SkillsPicker from "@/components/ui/SkillsPicker";

export interface FormMilestone {
  id?: string;
  order?: number;
  title: string;
  description: string;
  amount: string;
}

export interface JobFormValues {
  title: string;
  description: string;
  skills: string[];
  budget: string;
  tokenSymbol: string;
  deadline: string;
  allocationMode?: "EQUAL" | "CUSTOM";
  milestones: FormMilestone[];
}

interface JobFormProps {
  initialValues?: Partial<JobFormValues>;
  submitLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onSubmit: (status: "DRAFT" | "PUBLISHED", values: JobFormValues) => void;
  allowMilestones?: boolean;
}

const DEFAULT_MILESTONES: FormMilestone[] = [
  { order: 1, title: "Milestone 1: Architecture & Specs", description: "System architecture, UI design, and interface specifications.", amount: "100" },
  { order: 2, title: "Milestone 2: Core Development", description: "Frontend and backend core feature implementation.", amount: "100" },
  { order: 3, title: "Milestone 3: Final Deployment & Review", description: "Testing, deployment verification, and handoff.", amount: "100" },
];

const EMPTY: JobFormValues = {
  title: "",
  description: "",
  skills: [],
  budget: "300",
  tokenSymbol: "USDC",
  deadline: "",
  allocationMode: "EQUAL",
  milestones: DEFAULT_MILESTONES,
};

export default function JobForm({
  initialValues,
  submitLabel = "Create Job",
  isSubmitting,
  error,
  onSubmit,
  allowMilestones = true,
}: JobFormProps) {
  const { user } = useAuth();
  const [values, setValues] = useState<JobFormValues>({
    ...EMPTY,
    ...initialValues,
    milestones: initialValues?.milestones?.length ? initialValues.milestones : DEFAULT_MILESTONES
  });

  const [allocationMode, setAllocationMode] = useState<"EQUAL" | "CUSTOM">(
    initialValues?.allocationMode || "EQUAL"
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const isWalletConnected = Boolean(
    user?.walletAddress ||
    user?.id ||
    (typeof window !== "undefined" && (localStorage.getItem("w3hire_active_address") || localStorage.getItem("w3hire_auth_token") || (window as any).ethereum))
  );

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // Helper to compute exact equal split amounts summing 100% to total budget
  const computeEqualSplits = (totalStr: string, count: number): string[] => {
    const total = parseFloat(totalStr || "0");
    if (isNaN(total) || total <= 0 || count <= 0) {
      return Array(count).fill("0");
    }
    const base = Math.floor((total / count) * 100) / 100;
    const amounts = Array(count).fill(base.toFixed(2));
    const sum = base * count;
    const diff = Number((total - sum).toFixed(2));
    if (diff !== 0) {
      amounts[count - 1] = (base + diff).toFixed(2);
    }
    return amounts;
  };

  // Recalculate milestone amounts when budget or milestone count changes in EQUAL mode
  useEffect(() => {
    if (allocationMode === "EQUAL" && values.budget && parseFloat(values.budget) > 0 && values.milestones.length > 0) {
      const splitAmounts = computeEqualSplits(values.budget, values.milestones.length);
      
      setValues((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m, idx) => ({
          ...m,
          order: idx + 1,
          amount: splitAmounts[idx] || "0"
        }))
      }));
    }
  }, [values.budget, values.milestones.length, allocationMode]);

  const handleAddMilestone = () => {
    const nextOrder = values.milestones.length + 1;
    const newMs: FormMilestone = {
      order: nextOrder,
      title: `Milestone ${nextOrder}: Deliverable ${nextOrder}`,
      description: `Deliverables and requirements for Milestone ${nextOrder}.`,
      amount: "0"
    };

    const updated = [...values.milestones, newMs];
    
    if (allocationMode === "EQUAL" && values.budget && parseFloat(values.budget) > 0) {
      const splitAmounts = computeEqualSplits(values.budget, updated.length);
      setValues((v) => ({
        ...v,
        milestones: updated.map((m, idx) => ({ ...m, order: idx + 1, amount: splitAmounts[idx] || "0" }))
      }));
    } else {
      const defaultAmount = values.budget && parseFloat(values.budget) > 0 ? (parseFloat(values.budget) / updated.length).toFixed(2) : "100";
      setValues((v) => ({
        ...v,
        milestones: updated.map((m, idx) => ({ ...m, order: idx + 1, amount: m.amount === "0" ? defaultAmount : m.amount }))
      }));
    }
  };

  const handleRemoveMilestone = (index: number) => {
    if (values.milestones.length <= 1) return;
    const updated = values.milestones.filter((_, idx) => idx !== index);
    
    if (allocationMode === "EQUAL" && values.budget && parseFloat(values.budget) > 0) {
      const splitAmounts = computeEqualSplits(values.budget, updated.length);
      setValues((v) => ({
        ...v,
        milestones: updated.map((m, idx) => ({ ...m, order: idx + 1, amount: splitAmounts[idx] || "0" }))
      }));
    } else {
      setValues((v) => ({
        ...v,
        milestones: updated.map((m, idx) => ({ ...m, order: idx + 1 }))
      }));
    }
  };

  const handleUpdateMilestone = (index: number, field: keyof FormMilestone, val: string) => {
    const updated = values.milestones.map((m, idx) => {
      if (idx === index) {
        return { ...m, [field]: val };
      }
      return m;
    });
    setValues((v) => ({ ...v, milestones: updated }));
  };

  const getTomorrowString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getTodayString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Compute total allocation
  const totalBudgetNum = parseFloat(values.budget || "0");
  const milestonesSum = values.milestones.reduce((acc, m) => acc + (parseFloat(m.amount) || 0), 0);
  const isAllocationMatch = Math.abs(totalBudgetNum - milestonesSum) < 0.05;

  const validate = (): string | null => {
    if (!values.title.trim()) return "Title is required.";
    if (!values.description.trim()) return "Description is required.";
    if (!values.budget || Number(values.budget) <= 0) return "Budget must be a positive number.";
    if (values.milestones.length === 0) return "At least one milestone is required.";
    
    for (let i = 0; i < values.milestones.length; i++) {
      if (!values.milestones[i].title.trim()) return `Milestone #${i + 1} title is required.`;
      if (!values.milestones[i].description.trim()) return `Milestone #${i + 1} description is required.`;
      if (parseFloat(values.milestones[i].amount) <= 0) return `Milestone #${i + 1} amount must be greater than 0.`;
    }

    if (allocationMode === "CUSTOM" && !isAllocationMatch) {
      return `Custom milestone amounts sum to ${milestonesSum.toFixed(2)} ${values.tokenSymbol}, which does not match total project budget of ${totalBudgetNum.toFixed(2)} ${values.tokenSymbol}.`;
    }

    if (values.deadline) {
      if (isNaN(new Date(values.deadline).getTime())) {
        return "Deadline is not a valid date.";
      }
      if (values.deadline <= getTodayString()) {
        return "Deadline must be greater than the current date.";
      }
    }
    return null;
  };

  const handleSubmit = (status: "DRAFT" | "PUBLISHED") => {
    if (!isWalletConnected) {
      setValidationError("Wallet Connection Required: Please connect your Web3 wallet before posting a job or saving a draft.");
      setIsWalletModalOpen(true);
      return;
    }
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onSubmit(status, {
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      budget: String(Number(values.budget)),
      allocationMode,
    });
  };

  return (
    <div className="space-y-6">
      <WalletNoticeBanner
        role="client"
        customMessage="Please connect your Web3 wallet before posting a job. An active wallet is required for smart contract escrow initialization and milestone locking."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
              Title <span className="text-[#EF4444]">*</span>
            </label>
            <input
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Build a React Dashboard"
              className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
              Description <span className="text-[#EF4444]">*</span>
            </label>
            <textarea
              rows={6}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Need a responsive analytics dashboard with charts and real-time updates…"
              className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors resize-none"
            />
          </div>

          <SkillsPicker
            label="Skills required"
            value={values.skills}
            onChange={(skills) => set("skills", skills)}
          />
        </div>

        {/* Right column: Budget & Deadline */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">
                Budget <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={values.budget}
                onChange={(e) => set("budget", e.target.value)}
                placeholder="300"
                className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">Token / Currency</label>
              <select
                value={values.tokenSymbol}
                onChange={(e) => set("tokenSymbol", e.target.value)}
                className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-moss/60 transition-colors appearance-none cursor-pointer font-mono"
              >
                {TOKEN_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">Deadline</label>
            <input
              type="date"
              min={getTomorrowString()}
              value={values.deadline}
              onChange={(e) => set("deadline", e.target.value)}
              className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-moss/60 transition-colors"
            />
            <p className="text-[11px] text-muted mt-1">Optional — future date when job should be delivered.</p>
          </div>

          <div className="rounded-2xl bg-background border border-surface-border p-4 text-xs text-muted space-y-2">
            <div className="font-mono text-moss uppercase text-[10px] font-semibold tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Dynamic Milestone System
            </div>
            <p className="leading-relaxed">
              Add any number of milestones ($N$). Funds are held in Smart Contract Escrow and released per milestone upon client approval or after the 72-hour review timer.
            </p>
          </div>
        </div>
      </div>

      {/* DYNAMIC MILESTONE BUILDER SECTION */}
      {allowMilestones && (
        <div className="pt-6 border-t border-surface-border space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-moss" />
                <h3 className="text-base font-extrabold text-foreground tracking-tight">
                  Dynamic Milestone Builder ({values.milestones.length})
                </h3>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Define custom milestones. Choose Equal Split or Custom Budget Allocation.
              </p>
            </div>

            {/* Allocation Mode Selector */}
            <div className="flex items-center p-1 rounded-xl bg-background border border-surface-border self-start">
              <button
                type="button"
                onClick={() => setAllocationMode("EQUAL")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                  allocationMode === "EQUAL"
                    ? "bg-moss text-background shadow"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Equal Split</span>
              </button>
              <button
                type="button"
                onClick={() => setAllocationMode("CUSTOM")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                  allocationMode === "CUSTOM"
                    ? "bg-moss text-background shadow"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Custom Amount</span>
              </button>
            </div>
          </div>

          {/* Real-time Allocation Summary Card */}
          <div className="p-3.5 rounded-xl bg-background border border-surface-border flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-muted">Total Budget:</span>
              <span className="font-bold text-foreground">{values.budget || "0"} {values.tokenSymbol}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Allocated Milestones:</span>
              <span className={`font-bold ${isAllocationMatch ? "text-moss" : "text-amber-400"}`}>
                {milestonesSum.toFixed(2)} {values.tokenSymbol}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isAllocationMatch ? (
                <span className="text-moss flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Budget 100% Allocated
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {totalBudgetNum > milestonesSum
                    ? `${(totalBudgetNum - milestonesSum).toFixed(2)} Unallocated`
                    : `${(milestonesSum - totalBudgetNum).toFixed(2)} Over Budget`}
                </span>
              )}
            </div>
          </div>

          {/* Milestone Cards List */}
          <div className="space-y-4">
            {values.milestones.map((ms, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-background border border-surface-border space-y-3 relative group">
                <div className="flex items-center justify-between gap-3 border-b border-surface-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-moss/10 border border-moss/30 text-moss font-mono font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                      Milestone Node #{idx + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-mono">
                      <span className="text-muted">Amount:</span>
                      <input
                        type="number"
                        disabled={allocationMode === "EQUAL"}
                        value={ms.amount}
                        onChange={(e) => handleUpdateMilestone(idx, "amount", e.target.value)}
                        className="w-24 bg-surface border border-surface-border rounded-lg px-2 py-1 text-right text-xs font-bold text-moss focus:outline-none focus:border-moss disabled:opacity-75"
                      />
                      <span className="text-foreground">{values.tokenSymbol}</span>
                    </div>

                    {values.milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(idx)}
                        className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-rose-950/20 transition cursor-pointer"
                        title="Remove Milestone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <input
                      type="text"
                      value={ms.title}
                      onChange={(e) => handleUpdateMilestone(idx, "title", e.target.value)}
                      placeholder={`Milestone ${idx + 1} Title`}
                      className="w-full bg-surface border border-surface-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-moss/60"
                    />
                  </div>
                  <div className="md:col-span-8">
                    <input
                      type="text"
                      value={ms.description}
                      onChange={(e) => handleUpdateMilestone(idx, "description", e.target.value)}
                      placeholder="Short description of deliverables for this milestone..."
                      className="w-full bg-surface border border-surface-border rounded-xl px-3 py-2 text-xs text-muted focus:outline-none focus:border-moss/60"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Milestone Button */}
          <button
            type="button"
            onClick={handleAddMilestone}
            className="w-full py-3 rounded-2xl bg-surface hover:bg-surface-hover border border-moss/40 text-moss font-bold font-mono text-xs transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Milestone (#{values.milestones.length + 1})</span>
          </button>
        </div>
      )}

      {(validationError || error) && (
        <div className="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444]">
          {validationError || error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-surface-border">
        <button
          type="button"
          onClick={() => handleSubmit("DRAFT")}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-background border border-surface-border hover:border-moss/50 text-foreground font-semibold text-xs uppercase tracking-wider transition disabled:opacity-60 cursor-pointer"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() => handleSubmit("PUBLISHED")}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-semibold text-xs uppercase tracking-wider transition shadow-md shadow-[#84CC16]/20 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>

      <MetaMaskModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        role="client"
      />
    </div>
  );
}
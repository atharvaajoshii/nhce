"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { TOKEN_OPTIONS } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import WalletNoticeBanner from "@/components/ui/WalletNoticeBanner";
import MetaMaskModal from "@/components/metamask-modal";
import SkillsPicker from "@/components/ui/SkillsPicker";

export interface JobMilestoneInput {
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
  milestones: JobMilestoneInput[];
}

interface JobFormProps {
  initialValues?: Partial<JobFormValues>;
  submitLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onSubmit: (status: "DRAFT" | "PUBLISHED", values: JobFormValues) => void;
  /** Milestones can only be set at job-creation time — the backend has no
   *  endpoint to add/edit milestones on an already-created job. Pass false
   *  on the edit form so it isn't shown where it can't take effect. */
  allowMilestones?: boolean;
}

const EMPTY_MILESTONE: JobMilestoneInput = { title: "", description: "", amount: "" };

const EMPTY: JobFormValues = {
  title: "",
  description: "",
  skills: [],
  budget: "",
  tokenSymbol: "USDC",
  deadline: "",
  milestones: [],
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
  const [values, setValues] = useState<JobFormValues>({ ...EMPTY, ...initialValues });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const isWalletConnected = Boolean(
    user?.walletAddress || (typeof window !== "undefined" && localStorage.getItem("w3hire_active_address"))
  );

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const addMilestone = () => {
    setValues((v) => ({ ...v, milestones: [...v.milestones, { ...EMPTY_MILESTONE }] }));
  };

  const removeMilestone = (index: number) => {
    setValues((v) => ({ ...v, milestones: v.milestones.filter((_, i) => i !== index) }));
  };

  const updateMilestone = (index: number, key: keyof JobMilestoneInput, value: string) => {
    setValues((v) => ({
      ...v,
      milestones: v.milestones.map((m, i) => (i === index ? { ...m, [key]: value } : m)),
    }));
  };

  const milestonesTotal = values.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

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

  const validate = (): string | null => {
    if (!values.title.trim()) return "Title is required.";
    if (!values.description.trim()) return "Description is required.";
    if (!values.budget || Number(values.budget) <= 0) return "Budget must be a positive number.";
    if (values.deadline) {
      if (isNaN(new Date(values.deadline).getTime())) {
        return "Deadline is not a valid date.";
      }
      if (values.deadline <= getTodayString()) {
        return "Deadline must be greater than the current date.";
      }
    }
    if (allowMilestones) {
      for (const m of values.milestones) {
        if (!m.title.trim() && !m.amount) continue; // ignore fully-blank rows
        if (!m.title.trim()) return "Every milestone needs a title.";
        if (!m.amount || Number(m.amount) <= 0) return "Every milestone needs a positive amount.";
      }
    }
    return null;
  };

  const handleSubmit = (status: "DRAFT" | "PUBLISHED") => {
    if (!isWalletConnected) {
      setValidationError("Wallet Connection Required: You cannot post a job or save a draft without connecting your Web3 wallet first. Please connect your MetaMask wallet.");
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
      milestones: allowMilestones
        ? values.milestones
            .filter((m) => m.title.trim() && Number(m.amount) > 0)
            .map((m) => ({ ...m, title: m.title.trim(), description: m.description.trim() }))
        : [],
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

        {/* Right column */}
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
                placeholder="500"
                className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1.5">Token / Currency</label>
              <select
                value={values.tokenSymbol}
                onChange={(e) => set("tokenSymbol", e.target.value)}
                className="w-full bg-background border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-moss/60 transition-colors appearance-none cursor-pointer"
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
            <p className="text-[11px] text-muted mt-1">Optional — must be a future date when the job should be delivered by.</p>
          </div>

          <div className="rounded-2xl bg-background border border-surface-border p-4 text-xs text-muted space-y-2">
            <div className="font-mono text-moss uppercase text-[10px] font-semibold tracking-wider">Tips</div>
            <ul className="space-y-1 list-disc pl-4">
              <li>Drafts are private — only you can see them.</li>
              <li>Publishing makes the job visible to freelancers in the marketplace.</li>
              <li>You can edit a draft or published job until a freelancer is selected.</li>
            </ul>
          </div>
        </div>
      </div>

      {allowMilestones && (
        <div className="space-y-4 pt-2 border-t border-surface-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1">
                Milestones (optional)
              </label>
              <p className="text-[11px] text-muted">
                Split the budget into deliverables the freelancer submits and you release one at a time. Leave empty for a single lump-sum payout — milestones can only be set now, not added later.
              </p>
            </div>
            {values.milestones.length > 0 && (
              <span
                className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border shrink-0 ${
                  values.budget && Number(values.budget) === milestonesTotal
                    ? "bg-moss/10 text-moss border-moss/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}
              >
                Milestones total: {milestonesTotal} {values.tokenSymbol} / Budget: {values.budget || 0} {values.tokenSymbol}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {values.milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_auto] gap-3 items-start bg-background border border-surface-border rounded-xl p-3.5">
                <div>
                  <label className="block text-[10px] font-mono text-muted uppercase mb-1">Title</label>
                  <input
                    value={m.title}
                    onChange={(e) => updateMilestone(i, "title", e.target.value)}
                    placeholder={`Milestone ${i + 1}`}
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-muted uppercase mb-1">Description</label>
                  <input
                    value={m.description}
                    onChange={(e) => updateMilestone(i, "description", e.target.value)}
                    placeholder="What must be delivered"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-muted uppercase mb-1">Amount</label>
                  <input
                    type="number"
                    min={0}
                    value={m.amount}
                    onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                    placeholder="0"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-moss/60"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  className="self-end sm:self-center p-2 rounded-lg text-muted hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition"
                  title="Remove milestone"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addMilestone}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-surface-border text-muted hover:text-foreground hover:border-moss/50 text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Milestone
          </button>
        </div>
      )}

      {(validationError || error) && (
        <div className="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444]">
          {validationError || error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-surface-border">
        <button
          type="button"
          onClick={() => handleSubmit("DRAFT")}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-background border border-surface-border hover:border-moss/50 text-foreground font-semibold text-xs uppercase tracking-wider transition disabled:opacity-60"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() => handleSubmit("PUBLISHED")}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-semibold text-xs uppercase tracking-wider transition shadow-md shadow-[#84CC16]/20 flex items-center justify-center gap-2 disabled:opacity-60"
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
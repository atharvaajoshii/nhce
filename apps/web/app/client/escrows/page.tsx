"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Lock, ArrowLeft, CheckCircle2, Clock, Plus, ExternalLink, ShieldCheck, Briefcase, Trash2 } from "lucide-react";
import EscrowCard, { EscrowItem } from "../components/EscrowCard";

export default function ClientEscrowsPage() {
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);

  useEffect(() => {
    const loadEscrows = async () => {
      let combined: EscrowItem[] = [];

      if (typeof window !== "undefined") {
        const savedEscrows = localStorage.getItem("w3hire_client_escrows");
        if (savedEscrows) {
          try {
            combined = JSON.parse(savedEscrows);
          } catch (e) {
            console.error(e);
          }
        }

        const token = localStorage.getItem("w3hire_auth_token");
        if (token) {
          try {
            const { fetchMyJobs } = await import("@/lib/api");
            const res = await fetchMyJobs(token);
            if (res.jobs) {
              const apiEscrows: EscrowItem[] = res.jobs
                .filter((j) => j.escrowAddress || j.status === "IN_PROGRESS" || j.status === "FREELANCER_SELECTED" || j.status === "COMPLETED")
                .map((j) => ({
                  id: j.id,
                  projectTitle: j.title,
                  freelancerName: j.freelancer?.name || j.freelancer?.email || "Freelancer",
                  freelancerAvatar: "",
                  amountEth: String(j.budget),
                  tokenSymbol: j.tokenSymbol || "ETH",
                  amountUSD: j.budget >= 1 ? Math.round(j.budget * 3000) : Number((j.budget * 3000).toFixed(2)),
                  amountINR: Math.round(j.budget * 250000),
                  status: j.status === "COMPLETED" ? "released" : "locked",
                  createdAt: j.createdAt,
                  txHash: j.escrowAddress || "0x851a1994eb212b6a1ab423121c96a50cc2ca3ed69828f39d639432d1a5d48bb2",
                  escrowAddress: j.escrowAddress || undefined,
                }));

              const existingIds = new Set(combined.map((e) => e.id));
              for (const apiE of apiEscrows) {
                if (!existingIds.has(apiE.id)) {
                  combined.push(apiE);
                }
              }
            }
          } catch (e) {
            console.warn("[escrows] Could not load API escrows:", e);
          }
        }
      }

      // Sync status with milestone submissions saved in localStorage
      if (typeof window !== "undefined") {
        combined = combined.map((e) => {
          if (e.status === "released") return e;
          try {
            const savedMsId = localStorage.getItem(`w3hire_project_milestones_${e.id}`);
            const savedMsTitle = e.projectTitle ? localStorage.getItem(`w3hire_project_milestones_${encodeURIComponent(e.projectTitle)}`) : null;
            const msArray = savedMsId ? JSON.parse(savedMsId) : (savedMsTitle ? JSON.parse(savedMsTitle) : null);
            if (Array.isArray(msArray)) {
              const hasPending = msArray.some((m: any) => m.status === "PENDING_APPROVAL" || m.status === "SUBMITTED" || m.status === "VERIFYING");
              if (hasPending) {
                return { ...e, status: "milestone_submitted" as const };
              }
            }
          } catch (err) {}
          return e;
        });
      }

      // Filter out stale dummy entries (e.g. amountUSD === 0 && !amountEth)
      const validEscrows = combined.filter((e) => {
        if (!e.projectTitle) return false;
        if (!e.amountEth && e.amountUSD === 0) return false;
        return true;
      });

      // Deduplicate by projectTitle so only 1 real card per project title is rendered
      const uniqueMap = new Map<string, EscrowItem>();
      for (const item of validEscrows) {
        const key = item.projectTitle.trim().toLowerCase();
        const existing = uniqueMap.get(key);
        if (!existing) {
          uniqueMap.set(key, item);
        } else {
          const isBetter =
            (item.escrowAddress && !existing.escrowAddress) ||
            (item.status === "milestone_submitted" && existing.status !== "milestone_submitted") ||
            (item.freelancerName !== "Freelancer" && existing.freelancerName === "Freelancer") ||
            (item.amountEth && !existing.amountEth);
          if (isBetter) {
            uniqueMap.set(key, item);
          }
        }
      }

      setEscrows(Array.from(uniqueMap.values()));
    };

    loadEscrows();
    window.addEventListener("w3hire_milestones_updated", loadEscrows);
    window.addEventListener("w3hire_projects_updated", loadEscrows);
    window.addEventListener("storage", loadEscrows);
    return () => {
      window.removeEventListener("w3hire_milestones_updated", loadEscrows);
      window.removeEventListener("w3hire_projects_updated", loadEscrows);
      window.removeEventListener("storage", loadEscrows);
    };
  }, []);

  const handleRelease = (id: string) => {
    const updated = escrows.map((e) => (e.id === id ? { ...e, status: "released" as const } : e));
    setEscrows(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("w3hire_client_escrows", JSON.stringify(updated));
    }
  };

  const handleClearEscrows = () => {
    if (!window.confirm("Delete all test project and escrow records?")) return;
    setEscrows([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("w3hire_client_escrows");
      localStorage.removeItem("w3hire_client_projects");
      localStorage.removeItem("w3hire_freelancer_projects");
      localStorage.removeItem("w3hire_freelancer_applications");
      window.dispatchEvent(new Event("w3hire_projects_updated"));
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-foreground flex flex-col selection:bg-moss selection:text-background">
      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              Active Milestone Escrows
            </h1>
            <p className="text-xs text-muted">
              Non-custodial smart contracts securing all client funds until deliverables are verified.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {escrows.length > 0 && (
              <button
                onClick={handleClearEscrows}
                className="px-3.5 py-2.5 rounded-xl bg-surface border border-surface-border hover:border-[#EF4444]/50 text-[#EF4444] text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All Test Escrows</span>
              </button>
            )}
            <Link
              href="/client/create-escrow"
              className="px-4 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-semibold flex items-center gap-2 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create Custom Escrow</span>
            </Link>
          </div>
        </div>

        {escrows.length === 0 ? (
          <div className="p-12 rounded-2xl bg-surface border border-surface-border text-center space-y-3">
            <Lock className="w-8 h-8 mx-auto text-surface-border" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">No Active Escrows</h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                When you hire a freelancer on a project or create a custom milestone vault, it will appear here.
              </p>
            </div>
            <Link
              href="/client"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-moss text-background text-xs font-semibold"
            >
              <Briefcase className="w-4 h-4" />
              <span>Go to Projects</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {escrows.map((escrow) => (
              <EscrowCard key={escrow.id} escrow={escrow} onRelease={handleRelease} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

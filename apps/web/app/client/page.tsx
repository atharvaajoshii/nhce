"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Plus,
  Users,
  Lock,
  CheckCircle2,
  Sparkles,
  Zap,
  Star,
  ExternalLink,
  ArrowRight,
  TrendingUp,
  Clock,
  Award,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import ApplicantsModal, { Applicant } from "./components/ApplicantsModal";
import EscrowCard, { EscrowItem } from "./components/EscrowCard";
import { fetchMyJobs, Job, formatBudget, formatDate, formatRelative, JOB_STATUS_LABELS, daysUntil } from "@/lib/api";

export interface Project {
  id: string;
  title: string;
  description: string;
  skills: string[];
  budgetUSD: number;
  budgetINR: number;
  duration: string;
  status: "open" | "in_progress" | "completed";
  createdAt: string;
  applicants: Applicant[];
}

export default function ClientDashboardPage() {
  const router = useRouter();
  const [activeProjectForApplicants, setActiveProjectForApplicants] = useState<Project | null>(null);
  const [roleConflictWarning, setRoleConflictWarning] = useState<string | null>(null);

  // Dynamic state: initially empty (no hardcoded projects)
  const [projects, setProjects] = useState<Project[]>([]);
  const [realJobs, setRealJobs] = useState<Job[]>([]);
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);

  const topFreelancers = [
    { name: "Vikram S.", role: "Smart Contract Dev", rating: 4.9 },
    { name: "Elena R.", role: "Frontend UI/UX", rating: 5.0 },
    { name: "Alex K.", role: "Solana Expert", rating: 4.8 }
  ];

  const recentActivity = [
    { action: "Escrow Released", title: "Defi Protocol Audit", time: "10m ago" },
    { action: "New Freelancer Joined", title: "Rust/WASM Developer", time: "1h ago" },
    { action: "Project Completed", title: "NFT Marketplace", time: "3h ago" }
  ];

  // Load persisted projects & check role authentication
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeAddress = (localStorage.getItem("w3hire_active_address") || "0x71C3a7F9B1E48574B40B62E3e74dB826500F949A").toLowerCase();
      const savedRole = localStorage.getItem(`w3hire_wallet_role_${activeAddress}`);

      if (savedRole && savedRole === "freelancer") {
        setRoleConflictWarning(`Your active wallet (${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}) is registered as a Freelancer. You cannot use the Client dashboard with this account.`);
      }

      // Load saved projects
      const loadProjects = () => {
        const savedProjects = localStorage.getItem("w3hire_client_projects");
        if (savedProjects) {
          try {
            setProjects(JSON.parse(savedProjects));
          } catch (e) {
            console.error(e);
          }
        }
      };
      
      loadProjects();

      // Load saved escrows
      const savedEscrows = localStorage.getItem("w3hire_client_escrows");
      if (savedEscrows) {
        try {
          const parsed: EscrowItem[] = JSON.parse(savedEscrows);
          const uniqueMap = new Map<string, EscrowItem>();
          for (const item of parsed) {
            if (!item.projectTitle) continue;
            const key = item.projectTitle.trim().toLowerCase();
            if (!uniqueMap.has(key)) uniqueMap.set(key, item);
          }
          setEscrows(Array.from(uniqueMap.values()));
        } catch (e) {
          console.error(e);
        }
      }
      // Load real jobs from the backend marketplace API
      const token = localStorage.getItem("w3hire_auth_token");
      if (token) {
        fetchMyJobs(token)
          .then((data) => setRealJobs(data.jobs || []))
          .catch((e) => console.warn("Could not load jobs from API", e));
      }

      window.addEventListener("w3hire_projects_updated", loadProjects);
      return () => window.removeEventListener("w3hire_projects_updated", loadProjects);
    }
  }, []);

  // Save projects on update
  const saveProjectsToStorage = (updatedProjects: Project[]) => {
    setProjects(updatedProjects);
    if (typeof window !== "undefined") {
      localStorage.setItem("w3hire_client_projects", JSON.stringify(updatedProjects));
    }
  };

  // Save escrows on update
  const saveEscrowsToStorage = (updatedEscrows: EscrowItem[]) => {
    setEscrows(updatedEscrows);
    if (typeof window !== "undefined") {
      localStorage.setItem("w3hire_client_escrows", JSON.stringify(updatedEscrows));
    }
  };

  // Handled in layout.tsx

  // Handle Hiring & Escrow Creation
  const handleHireApplicant = (applicant: Applicant) => {
    if (!activeProjectForApplicants) return;

    const newEscrow: EscrowItem = {
      id: `esc-${Date.now()}`,
      projectTitle: activeProjectForApplicants.title,
      freelancerName: applicant.name,
      freelancerAvatar: applicant.avatar,
      amountEth: (applicant.proposedUSD / 3000).toFixed(4),
      tokenSymbol: "ETH",
      amountUSD: applicant.proposedUSD,
      amountINR: applicant.proposedINR,
      status: "locked",
      createdAt: "Just now",
      txHash: `0x${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 6)}`,
    };

    saveEscrowsToStorage([newEscrow, ...escrows]);

    // Update project status to in_progress
    const updated = projects.map((p) =>
      p.id === activeProjectForApplicants.id ? { ...p, status: "in_progress" as const } : p
    );
    saveProjectsToStorage(updated);
  };

  const handleReleaseEscrow = (id: string) => {
    const updated = escrows.map((e) => (e.id === id ? { ...e, status: "released" as const } : e));
    saveEscrowsToStorage(updated);
  };

  // Removed duplicated functions

  return (
    <div className="flex-1 w-full flex flex-col">
      

      {/* Role Conflict Warning Banner (if user is logged in as freelancer) */}
      {roleConflictWarning && (
        <div className="bg-[#EF4444]/20 border-b border-[#EF4444]/40 px-6 py-3 text-xs text-[#EF4444] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{roleConflictWarning}</span>
          </div>
          <Link
            href="/freelancer"
            className="px-3 py-1 rounded-lg bg-[#EF4444] text-white font-bold hover:bg-red-600 transition"
          >
            Go to Freelancer Portal →
          </Link>
        </div>
      )}

      {/* Main Dashboard Body */}
      <main className="flex-1 min-h-screen pt-8 px-4 sm:px-8 max-w-7xl w-full mx-auto space-y-8 pb-12">
        
        {/* Quick Stats */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Active Escrow TVL */}
          <div className="p-6 rounded-2xl bg-surface border border-surface-border flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted uppercase">Locked Escrow Vaults</span>
              <div className="text-2xl font-black text-foreground font-mono">
                ${escrows.reduce((acc, curr) => acc + (curr.status !== "released" ? curr.amountUSD : 0), 0).toLocaleString()}
                <span className="text-xs text-[#22C55E] ml-2 font-normal font-sans">USDC</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-surface-border text-xs text-muted flex justify-between">
              <span>{escrows.filter((e) => e.status !== "released").length} Active Milestones</span>
              <span className="text-[#22C55E]">100% Non-Custodial</span>
            </div>
          </div>

          {/* Quick Post Action Box */}
          <div className="p-6 rounded-2xl bg-surface border border-surface-border flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-xs font-mono text-moss uppercase">Instant Milestone Hiring</span>
              <div className="text-lg font-bold text-foreground">
                Post a Project & Hire
              </div>
            </div>
            {/* Using window event to trigger modal open handled in layout */}
            <button
              onClick={() => router.push("/client/jobs/new")}
              className="mt-4 py-2.5 px-4 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-semibold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-md shadow-[#84CC16]/20"
            >
              <Plus className="w-4 h-4" />
              <span>Post a Job</span>
            </button>
          </div>

        </section>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-4">
          
          {/* Main Feed */}
          <div className="lg:col-span-3 space-y-12">
            {/* Section: Posted Works */}
            <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                Your Posted Projects
              </h2>
              <p className="text-xs text-muted">
                Review applications, filter talent by skills and ratings, and initiate smart contract escrows.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {realJobs.length === 0 ? (
              /* Clean Empty State */
              <div className="p-12 rounded-2xl bg-surface border border-surface-border text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-background border border-surface-border flex items-center justify-center mx-auto text-moss">
                  <Briefcase className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-foreground">No jobs posted yet</h3>
                  <p className="text-xs text-muted max-w-sm mx-auto">
                    Post your first job to receive proposals from freelancers. Jobs are stored on the marketplace backend.
                  </p>
                </div>
                <button
                  onClick={() => router.push("/client/jobs/new")}
                  className="py-2.5 px-5 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-semibold text-xs transition shadow-md inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Post Job</span>
                </button>
              </div>
            ) : (
              realJobs.map((job: any) => (
                <div
                  key={job.id}
                  className="p-6 rounded-2xl bg-surface border border-surface-border hover:border-moss/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  {/* Left Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-semibold bg-moss/20 text-moss border border-moss/30">
                        {(JOB_STATUS_LABELS as any)[job.status] || "OPEN"}
                      </span>
                      <span className="text-[11px] text-muted font-mono">Posted {formatRelative(job.createdAt)}</span>
                      {daysUntil(job.deadline) !== null && (
                        <span className="text-[11px] text-muted font-mono">
                          Due in {daysUntil(job.deadline)} days
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-foreground">{job.title}</h3>
                    <p className="text-xs text-muted line-clamp-2">{job.description}</p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.skills.map((s: string) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-md bg-background border border-surface-border text-[11px] font-mono text-muted"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right: Budget & Applicant CTA */}
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-4 border-t md:border-t-0 pt-4 md:pt-0 border-surface-border">
                    <div className="text-left md:text-right">
                      <div className="text-base font-extrabold text-foreground font-mono">
                        {formatBudget(job)}
                      </div>
                      <div className="text-xs text-muted font-mono">
                        Posted {formatDate(job.createdAt)}
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/client/jobs/${job.id}`)}
                      className="px-4 py-2.5 rounded-xl bg-background hover:bg-moss text-foreground hover:text-background border border-surface-border hover:border-moss transition-all text-xs font-semibold flex items-center gap-2 shadow-sm"
                    >
                      <Users className="w-3.5 h-3.5 text-moss group-hover:text-background" />
                      <span>
                        {job._count?.applications ?? 0}{" "}
                        {(job._count?.applications ?? 0) === 1 ? "Applicant" : "Applicants"}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section: Active Smart Contract Escrows */}
        {escrows.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Active Escrow Vaults
                </h2>
                <p className="text-xs text-muted">
                  Funds locked in multisig contracts. Release upon reviewing freelancer milestone deliveries.
                </p>
              </div>
              <Link
                href="/client/escrows"
                className="text-xs text-moss hover:underline font-mono"
              >
                View All Escrows →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {escrows.map((escrow) => (
                <EscrowCard
                  key={escrow.id}
                  escrow={escrow}
                  onRelease={handleReleaseEscrow}
                />
              ))}
            </div>
          </section>
        )}
        </div>

        {/* Right Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          {/* Top Freelancers */}
          <div className="bg-surface border border-surface-border rounded-2xl p-6 overflow-hidden flex flex-col h-[250px]">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono mb-4 shrink-0">Top Freelancers</h3>
            <div className="flex-1 overflow-hidden relative group">
              {/* Fade masks */}
              <div className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none" style={{ background: "linear-gradient(to bottom, var(--bg-surface) 0%, var(--bg-surface-transparent) 100%)" }}></div>
              <div className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none" style={{ background: "linear-gradient(to top, var(--bg-surface) 0%, var(--bg-surface-transparent) 100%)" }}></div>
              
              <motion.div 
                className="space-y-4"
                animate={{ y: [0, -150] }}
                transition={{ repeat: Infinity, duration: 10, ease: "linear", repeatType: "loop" }}
              >
                {/* Double the list for seamless loop */}
                {[...topFreelancers, ...topFreelancers].map((freelancer, i) => (
                  <div key={i} className="flex justify-between items-center pb-4 border-b border-surface-border">
                    <div>
                      <div className="text-xs text-foreground font-bold">{freelancer.name}</div>
                      <div className="text-[10px] text-muted font-mono">{freelancer.role}</div>
                    </div>
                    <div className="text-xs font-mono font-bold flex items-center text-[#F59E0B]">
                      {freelancer.rating} <Star className="w-3 h-3 ml-1" />
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface border border-surface-border rounded-2xl p-6 overflow-hidden flex flex-col h-[300px]">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono mb-4 shrink-0">Live Platform Activity</h3>
            <div className="flex-1 overflow-hidden relative group">
              {/* Fade masks */}
              <div className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none" style={{ background: "linear-gradient(to bottom, var(--bg-surface) 0%, var(--bg-surface-transparent) 100%)" }}></div>
              <div className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none" style={{ background: "linear-gradient(to top, var(--bg-surface) 0%, var(--bg-surface-transparent) 100%)" }}></div>

              <motion.div 
                className="space-y-4"
                animate={{ y: [0, -180] }}
                transition={{ repeat: Infinity, duration: 12, ease: "linear", repeatType: "loop" }}
              >
                {/* Double the list for seamless loop */}
                {[...recentActivity, ...recentActivity].map((activity, i) => (
                  <div key={i} className="flex gap-3 relative pb-4 border-b border-surface-border">
                    <div className="mt-1 h-2 w-2 rounded-full bg-moss shadow-[0_0_6px_rgba(132,204,22,0.8)] shrink-0"></div>
                    <div>
                      <div className="text-[11px] font-mono text-foreground uppercase mb-0.5">{activity.action}</div>
                      <div className="text-xs text-muted">{activity.title}</div>
                      <div className="text-[10px] text-muted/60 mt-1">{activity.time}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </aside>
      </div>

      </main>

      {/* Modals are handled in layout */}

      {activeProjectForApplicants && (
        <ApplicantsModal
          isOpen={!!activeProjectForApplicants}
          onClose={() => setActiveProjectForApplicants(null)}
          projectTitle={activeProjectForApplicants.title}
          budgetUSD={activeProjectForApplicants.budgetUSD}
          budgetINR={activeProjectForApplicants.budgetINR}
          applicants={activeProjectForApplicants.applicants}
          onHire={handleHireApplicant}
        />
      )}
    </div>
  );
}

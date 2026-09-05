"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FolderOpenIcon, Loader2, AlertCircle } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import FilterBar, { type FilterState, defaultFilters } from "@/components/filters/FilterBar";
import { useAuth } from "@/contexts/AuthContext";
import { useApiFetch } from "@/hooks/useApiFetch";
import { fetchMyProjects, getAuthToken, Job, formatBudget } from "@/lib/api";
import { activeProjects as mockProjects } from "@/lib/mock-data";

export default function ProjectsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { data: apiProjectsData, isLoading, error } = useApiFetch<{ jobs: Job[] } | null>(
    async () => {
      const token = getAuthToken();
      if (!token) return null;
      return await fetchMyProjects(token);
    },
    [authLoading]
  );

  const projects = useMemo(() => {
    const list: any[] = [];

    // 1. API backend assigned projects
    if (apiProjectsData && Array.isArray(apiProjectsData.jobs)) {
      apiProjectsData.jobs.forEach((j) => {
        list.push({
          id: j.id,
          title: j.title,
          status: j.status === "IN_PROGRESS" ? "In Progress" : j.status === "COMPLETED" ? "Completed" : "In Progress",
          budget: `${j.budget} ${j.tokenSymbol || "ETH"}`,
          rawBudget: j.budget,
          clientName: j.client?.name || "Client",
          freelancerName: j.freelancer?.name || "Assigned Freelancer",
          lastUpdated: new Date(j.updatedAt).toLocaleDateString(),
          isMine: true,
          tags: j.skills?.length ? j.skills : ["Web3", "Smart Contracts"],
          durationWeeks: 4,
          nextMilestone: (j.milestones?.[0] as any)?.title || "Milestone 1: Deliverable Proof Submission",
        });
      });
    }

    // 2. Real escrows / hired contracts from LocalStorage
    if (typeof window !== "undefined") {
      try {
        const savedEscrows = localStorage.getItem("w3hire_client_escrows");
        if (savedEscrows) {
          const escrows = JSON.parse(savedEscrows);
          escrows.forEach((e: any) => {
            if (!list.some((existing) => existing.title === e.projectTitle || existing.id === e.id)) {
              const numBudget = parseFloat(String(e.amountEth || "")) || e.amountUSD || 1000;
              const symbol = e.tokenSymbol || "USDC";
              list.push({
                id: e.id,
                title: e.projectTitle || "Smart Contract Escrow Project",
                status: e.status === "released" ? "Completed" : "In Progress",
                budget: `${numBudget} ${symbol}`,
                rawBudget: numBudget,
                clientName: "Client Owner",
                freelancerName: e.freelancerName || "Freelancer",
                lastUpdated: "Recently",
                isMine: true,
                tags: ["Smart Contracts", "Escrow Vault"],
                durationWeeks: 4,
                nextMilestone: "Milestone 1: Architecture & Specification",
              });
            }
          });
        }

        const savedProjects = localStorage.getItem("w3hire_client_projects");
        if (savedProjects) {
          const localProjects = JSON.parse(savedProjects);
          localProjects.forEach((p: any) => {
            if (p.status === "in_progress" && !list.some((existing) => existing.title === p.title || existing.id === p.id)) {
              const numBudget = p.budget || p.budgetUSD || 1000;
              const symbol = p.tokenSymbol || "USDC";
              list.push({
                id: p.id,
                title: p.title,
                status: "In Progress",
                budget: `${numBudget} ${symbol}`,
                rawBudget: numBudget,
                clientName: "Client Owner",
                freelancerName: "Freelancer",
                lastUpdated: new Date(p.createdAt || Date.now()).toLocaleDateString(),
                isMine: true,
                tags: p.skills?.length ? p.skills : ["Web3"],
                durationWeeks: 4,
                nextMilestone: "Milestone 1: Architecture & Specification",
              });
            }
          });
        }
      } catch (err) {}
    }

    // Return empty list if no active projects exist
    if (list.length === 0) {
      return [];
    }

    return list;
  }, [apiProjectsData]);

  const availableTags = useMemo(() => {
    return Array.from(new Set(projects.flatMap((p) => p.tags || [])));
  }, [projects]);

  const parseBudget = (budgetStr: string) => {
    return Number(budgetStr.replace(/[^0-9.-]+/g, ""));
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Tags match
      if (filters.tags.length > 0) {
        const pTags = project.tags || [];
        const hasAllTags = filters.tags.every((t) => pTags.includes(t));
        if (!hasAllTags) return false;
      }

      // Budget match
      const pBudget = project.rawBudget ?? parseBudget(project.budget);
      if (filters.budgetMin !== "" && pBudget < filters.budgetMin) return false;
      if (filters.budgetMax !== "" && pBudget > filters.budgetMax) return false;

      // Status match
      if (filters.status !== "Any" && project.status !== filters.status) return false;

      return true;
    });
  }, [projects, filters]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] as const } },
  };

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            My Assigned Projects
          </h1>
          <p className="text-xs text-muted">
            Active contracts with funded vaults assigned to your account.
          </p>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border ${
              showFilters || JSON.stringify(filters) !== JSON.stringify(defaultFilters)
                ? "bg-moss/20 border-moss/50 text-[#BEF264]"
                : "bg-surface border-surface-border text-foreground hover:bg-moss/10 hover:border-moss/50 hover:text-moss"
            }`}
          >
            Filter {JSON.stringify(filters) !== JSON.stringify(defaultFilters) && " (Active)"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <FilterBar
              availableTags={availableTags}
              filters={filters}
              onChange={setFilters}
              showStatus={true}
              resultCount={filteredProjects.length}
              totalCount={projects.length}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-moss" />
          <p className="text-sm font-mono">Loading your active projects…</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={FolderOpenIcon}
          title="No active projects assigned"
          description="Once a client accepts your application and funds the escrow vault, your assigned project will appear here."
          action={{
            label: "Explore Marketplace Bounties",
            onClick: () => (window.location.href = "/bounties"),
          }}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {filteredProjects.map((project) => {
            const numericBudget = project.rawBudget ?? parseBudget(project.budget);
            const budgetINR = numericBudget * 83;

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="block group">
                <motion.div
                  variants={itemVariants}
                  className="p-6 rounded-2xl bg-surface border border-surface-border hover:border-moss/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 interactive"
                >
                  {/* Left Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-mono px-2.5 py-1 rounded-md uppercase font-semibold border ${
                          project.status === "Completed"
                            ? "bg-[#A3A3A3]/20 text-muted border-[#A3A3A3]/30"
                            : project.status === "In Progress"
                            ? "bg-moss/20 text-moss border-moss/30 animate-pulse"
                            : "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30"
                        }`}
                      >
                        {project.status}
                      </span>

                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-md uppercase font-semibold bg-white/10 text-foreground border border-white/20">
                        Assigned Project
                      </span>

                      <span className="text-[11px] text-muted font-mono">
                        Updated {project.lastUpdated}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-foreground group-hover:text-moss transition-colors duration-300">
                      {project.title}
                    </h3>

                    <div className="text-xs text-muted">
                      Client: <span className="font-medium text-foreground">{project.clientName}</span>
                      {project.nextMilestone && (
                        <span className="ml-2 pl-2 border-l border-surface-border">
                          Next Milestone: <span className="text-foreground">{project.nextMilestone}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Budget & Action */}
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-4 border-t md:border-t-0 pt-4 md:pt-0 border-surface-border">
                    <div className="text-left md:text-right">
                      <div className="text-base font-extrabold text-foreground font-mono">
                        {project.budget}
                      </div>
                      {numericBudget > 0 && (
                        <div className="text-xs text-muted font-mono">
                          ≈ ₹{budgetINR.toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-2.5 rounded-xl bg-moss text-background transition-all text-xs font-semibold flex items-center gap-2 shadow-sm group-hover:bg-[#BEF264]">
                      <span>Open Workspace</span>
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14m-7-7 7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </motion.div>
      )}
    </main>
  );
}

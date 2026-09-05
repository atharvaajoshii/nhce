"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SlidersHorizontal, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import JobCard from "@/components/JobCard";
import EmptyState from "@/components/ui/EmptyState";
import { fetchJobs, Job, formatBudget } from "@/lib/api";
import { useApiFetch } from "@/hooks/useApiFetch";

type SortKey = "newest" | "budget_asc" | "budget_desc";

interface Filters {
  q: string;
  minBudget: number | "";
  maxBudget: number | "";
  skills: string[];
  token: string;
  status: string;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  minBudget: "",
  maxBudget: "",
  skills: [],
  token: "All",
  status: "All",
  sort: "newest",
};

export default function BountiesPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const recentEarners = [
    { name: "0xSam...", amount: "$4,500", project: "DeFi Auditing" },
    { name: "Elena R.", amount: "$2,100", project: "Frontend UI" },
    { name: "Aakash", amount: "$8,500", project: "Solana Contract" }
  ];

  const recentActivity = [
    { action: "New Job Posted", title: "Smart Contract Escrow", time: "5m ago" },
    { action: "Escrow Funded", title: "Smart Contract Audit", time: "1h ago" },
    { action: "Freelancer Hired", title: "Rust Protocol Engineer", time: "2h ago" }
  ];

  const { data: jobsData, isLoading, error, reload: loadJobs } = useApiFetch<Job[]>(async () => {
    let backendJobs: Job[] = [];
    try {
      const res = await fetchJobs();
      backendJobs = res.jobs || [];
    } catch (e) {}

    let localProjects: Job[] = [];
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("w3hire_client_projects");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          localProjects = parsed
            .filter((p: any) => p.status !== "DRAFT" && p.status !== "draft")
            .map((p: any) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              budget: p.budgetUSD || p.budget || 2000,
              tokenSymbol: p.tokenSymbol || "ETH",
              skills: p.skills || [],
              status: "PUBLISHED" as const,
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.createdAt || new Date().toISOString(),
              client: { id: "c1", name: "Client", email: "client@w3hire.io", rating: 5 },
              _count: { applications: p.applicants?.length || 0 },
            }));
        } catch (e) {}
      }
    }

    const merged = [...backendJobs];
    localProjects.forEach((lp) => {
      if (!merged.some((bj) => bj.id === lp.id || bj.title.toLowerCase() === lp.title.toLowerCase())) {
        merged.unshift(lp);
      }
    });

    return merged;
  });
  const jobs = useMemo(() => jobsData ?? [], [jobsData]);

  useEffect(() => {
    const handleUpdate = () => {
      loadJobs();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("w3hire_projects_updated", handleUpdate);
      return () => window.removeEventListener("w3hire_projects_updated", handleUpdate);
    }
  }, [loadJobs]);

  const availableSkills = useMemo(() => {
    return Array.from(new Set(jobs.flatMap((j) => j.skills))).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const availableTokens = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => j.tokenSymbol))).sort();
  }, [jobs]);

  const hasActiveFilters =
    filters.q !== "" ||
    filters.minBudget !== "" ||
    filters.maxBudget !== "" ||
    filters.skills.length > 0 ||
    filters.token !== "All" ||
    filters.status !== "All";

  const filteredJobs = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const results = jobs.filter((job) => {
      if (q) {
        const haystack = `${job.title} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.minBudget !== "" && job.budget < filters.minBudget) return false;
      if (filters.maxBudget !== "" && job.budget > filters.maxBudget) return false;
      if (filters.skills.length > 0 && !filters.skills.every((s) => job.skills.some((js) => js.toLowerCase() === s.toLowerCase()))) {
        return false;
      }
      if (filters.token !== "All" && job.tokenSymbol !== filters.token) return false;
      if (filters.status !== "All" && job.status !== filters.status) return false;
      return true;
    });

    switch (filters.sort) {
      case "budget_asc":
        return [...results].sort((a, b) => a.budget - b.budget);
      case "budget_desc":
        return [...results].sort((a, b) => b.budget - a.budget);
      default:
        return [...results].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [jobs, filters]);

  const totalValueLocked = useMemo(() => jobs.reduce((acc, j) => acc + j.budget, 0), [jobs]);

  const toggleSkill = (skill: string) => {
    setFilters((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-1">Marketplace</h1>
          <p className="text-xs text-muted">Discover real jobs posted by clients. Search, filter, and apply in one click.</p>
        </div>
        <div className="text-xs font-mono text-muted bg-surface border border-surface-border rounded-xl px-4 py-2.5">
          {isLoading ? "Loading jobs…" : `${filteredJobs.length} of ${jobs.length} jobs`}
        </div>
      </div>

      {/* Stats Banner */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-2xl bg-surface border border-surface-border flex flex-col justify-between">
          <span className="text-xs font-mono text-muted uppercase">Open Positions</span>
          <div className="text-2xl font-black text-foreground font-mono mt-2">{jobs.length}</div>
          <div className="mt-4 pt-3 border-t border-surface-border text-xs text-muted">Live on the marketplace</div>
        </div>
        <div className="p-6 rounded-2xl bg-surface border border-surface-border flex flex-col justify-between">
          <span className="text-xs font-mono text-muted uppercase">Total Value Listed</span>
          <div className="text-2xl font-black text-foreground font-mono mt-2">
            {jobs.length > 0 ? formatBudget({ budget: totalValueLocked, tokenSymbol: "USDC" }) : "—"}
          </div>
          <div className="mt-4 pt-3 border-t border-surface-border text-xs text-[#22C55E]">Backed by on-chain escrow</div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-2">
        {/* Main Feed */}
        <section className="lg:col-span-3 space-y-6">
          {/* Search & Filter Controls */}
          <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Search by title, description, or skills…"
                  className="w-full bg-background border border-surface-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-moss/50 transition-colors"
                />
              </div>

              <div className="flex gap-3">
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
                  className="bg-background border border-surface-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-moss/50 transition-colors appearance-none cursor-pointer"
                >
                  <option value="newest">Newest</option>
                  <option value="budget_asc">Budget: Low → High</option>
                  <option value="budget_desc">Budget: High → Low</option>
                </select>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border flex items-center gap-2 ${
                    showFilters || hasActiveFilters
                      ? "bg-moss/20 border-moss/50 text-[#BEF264]"
                      : "bg-surface border-surface-border text-foreground hover:bg-moss/10 hover:border-moss/50 hover:text-moss"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filter {hasActiveFilters && "· Active"}
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-[#EF4444] border border-surface-border transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-surface-border">
                    {/* Budget */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted uppercase tracking-wider">Budget Range</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minBudget}
                          onChange={(e) => setFilters((f) => ({ ...f, minBudget: e.target.value ? Number(e.target.value) : "" }))}
                          className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-moss/50 transition-colors"
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxBudget}
                          onChange={(e) => setFilters((f) => ({ ...f, maxBudget: e.target.value ? Number(e.target.value) : "" }))}
                          className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-moss/50 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Token */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted uppercase tracking-wider">Token / Currency</label>
                      <select
                        value={filters.token}
                        onChange={(e) => setFilters((f) => ({ ...f, token: e.target.value }))}
                        className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-moss/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="All">All tokens</option>
                        {availableTokens.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted uppercase tracking-wider">Status</label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-moss/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="All">All statuses</option>
                        <option value="PUBLISHED">Published</option>
                        <option value="OPEN">Open</option>
                      </select>
                    </div>

                    {/* Skills */}
                    <div className="space-y-2 lg:col-span-1">
                      <label className="text-xs font-semibold text-muted uppercase tracking-wider">Skills</label>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {availableSkills.length === 0 && <span className="text-xs text-muted">No skills listed yet.</span>}
                        {availableSkills.map((skill) => {
                          const isActive = filters.skills.includes(skill);
                          return (
                            <button
                              key={skill}
                              onClick={() => toggleSkill(skill)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                                isActive
                                  ? "bg-moss text-background border-moss"
                                  : "bg-background text-muted border-surface-border hover:border-moss/50 hover:text-foreground"
                              }`}
                            >
                              {skill}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Job Feed List */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-moss" />
              <p className="text-sm font-mono">Loading jobs…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 bg-surface border border-[#EF4444]/30 rounded-2xl space-y-4 px-6 text-center">
              <AlertCircle className="w-10 h-10 text-[#EF4444]" />
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Could not load the marketplace</h3>
                <p className="text-sm text-muted">{error}</p>
              </div>
              <button
                onClick={loadJobs}
                className="px-5 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background font-semibold text-xs uppercase tracking-wider transition"
              >
                Try Again
              </button>
            </div>
          ) : filteredJobs.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredJobs.map((job, i) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.4), ease: [0.25, 1, 0.5, 1] }}
                >
                  <JobCard job={job} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={hasActiveFilters ? "No jobs match your filters" : "No jobs yet"}
              description={
                hasActiveFilters
                  ? "Try adjusting your search or clearing the filters to see more opportunities."
                  : "Clients haven't posted any jobs yet. Check back soon!"
              }
              action={
                hasActiveFilters
                  ? { label: "Clear Filters", onClick: () => setFilters(DEFAULT_FILTERS) }
                  : undefined
              }
            />
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          {/* Top Earners */}
          <div className="bg-surface border border-surface-border rounded-2xl p-6 overflow-hidden flex flex-col h-[250px]">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono mb-4 shrink-0">
              Top Earners Today
            </h3>
            <div className="flex-1 overflow-hidden relative group">
              <div
                className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, var(--bg-surface) 0%, transparent 100%)" }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none"
                style={{ background: "linear-gradient(to top, var(--bg-surface) 0%, transparent 100%)" }}
              />

              <motion.div
                className="space-y-4"
                animate={{ y: [0, -150] }}
                transition={{ repeat: Infinity, duration: 10, ease: "linear", repeatType: "loop" }}
              >
                {[...recentEarners, ...recentEarners].map((earner, i) => (
                  <div key={i} className="flex justify-between items-center pb-4 border-b border-surface-border">
                    <div>
                      <div className="text-xs text-foreground font-bold">{earner.name}</div>
                      <div className="text-[10px] text-muted font-mono">{earner.project}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-moss">{earner.amount}</div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Live Activity */}
          <div className="bg-surface border border-surface-border rounded-2xl p-6 overflow-hidden flex flex-col h-[300px]">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono mb-4 shrink-0">
              Live Activity
            </h3>
            <div className="flex-1 overflow-hidden relative group">
              <div
                className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, var(--bg-surface) 0%, transparent 100%)" }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none"
                style={{ background: "linear-gradient(to top, var(--bg-surface) 0%, transparent 100%)" }}
              />

              <motion.div
                className="space-y-4"
                animate={{ y: [0, -180] }}
                transition={{ repeat: Infinity, duration: 12, ease: "linear", repeatType: "loop" }}
              >
                {[...recentActivity, ...recentActivity].map((activity, i) => (
                  <div key={i} className="flex gap-3 relative pb-4 border-b border-surface-border">
                    <div className="mt-1 h-2 w-2 rounded-full bg-moss shadow-[0_0_6px_rgba(132,204,22,0.8)] shrink-0" />
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
  );
}

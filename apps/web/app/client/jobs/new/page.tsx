"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createJob, getAuthToken } from "@/lib/api";
import { apiErrorMessage } from "@/hooks/useApiFetch";
import JobForm, { JobFormValues } from "@/app/client/components/JobForm";

export default function NewJobPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState<"DRAFT" | "PUBLISHED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/bounties");
    if (!authLoading && user && user.role !== "CLIENT") router.push("/bounties");
  }, [authLoading, user, router]);

  const handleSubmit = async (status: "DRAFT" | "PUBLISHED", values: JobFormValues) => {
    setSubmitting(status);
    setError(null);

    const newJobId = `job-${Date.now()}`;

    const formattedMilestones = values.milestones.map((m, idx) => ({
      order: idx + 1,
      title: m.title,
      description: m.description,
      amount: parseFloat(m.amount),
      status: idx === 0 ? "IN_PROGRESS" : "LOCKED"
    }));

    const newJobObj = {
      id: newJobId,
      title: values.title,
      description: values.description,
      budgetUSD: Number(values.budget),
      budget: Number(values.budget),
      tokenSymbol: values.tokenSymbol || "ETH",
      skills: values.skills || [],
      milestones: formattedMilestones,
      duration: "4 weeks",
      status: status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      applicants: [],
    };

    // Save to localStorage immediately so it appears across dashboard, client jobs, and bounties feed
    try {
      const existing = JSON.parse(localStorage.getItem("w3hire_client_projects") || "[]");
      localStorage.setItem("w3hire_client_projects", JSON.stringify([newJobObj, ...existing]));
      localStorage.setItem(`w3hire_project_milestones_${newJobId}`, JSON.stringify(formattedMilestones));
      if (values.title) {
        localStorage.setItem(`w3hire_project_milestones_${encodeURIComponent(values.title)}`, JSON.stringify(formattedMilestones));
      }
      window.dispatchEvent(new Event("w3hire_projects_updated"));
      window.dispatchEvent(new Event("w3hire_milestones_updated"));
    } catch (e) {
      console.error(e);
    }

    try {
      const token = getAuthToken();
      if (token) {
        const res = await createJob(token, {
          title: values.title,
          description: values.description,
          budget: Number(values.budget),
          tokenSymbol: values.tokenSymbol,
          skills: values.skills,
          milestones: formattedMilestones,
          deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
          status,
        });
        if (res && res.job && res.job.id) {
          try {
            const existing = JSON.parse(localStorage.getItem("w3hire_client_projects") || "[]");
            const updatedProjects = existing.map((p: any) => p.id === newJobId ? { ...p, id: res.job.id } : p);
            if (!updatedProjects.some((p: any) => p.id === res.job.id)) {
              updatedProjects.unshift({ ...newJobObj, id: res.job.id });
            }
            localStorage.setItem("w3hire_client_projects", JSON.stringify(updatedProjects));
            localStorage.setItem(`w3hire_project_milestones_${res.job.id}`, JSON.stringify(formattedMilestones));
            if (res.job.title) {
              localStorage.setItem(`w3hire_project_milestones_${encodeURIComponent(res.job.title)}`, JSON.stringify(formattedMilestones));
            }
            window.dispatchEvent(new Event("w3hire_projects_updated"));
            window.dispatchEvent(new Event("w3hire_milestones_updated"));
          } catch (err) {}

          router.push(`/client/jobs/${res.job.id}`);
          return;
        }
      }
    } catch (e) {
      console.warn("Backend sync failed, navigating to local job view", e);
    }

    router.push(`/client/jobs/${newJobId}`);
  };

  if (authLoading) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-moss" />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
      <div>
        <Link href="/client/jobs" className="inline-flex items-center gap-2 text-muted hover:text-moss transition-colors duration-300 font-mono text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to My Jobs
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Create a Job</h1>
        <p className="text-muted text-sm">Post a new opportunity — save it as a draft or publish it to the marketplace.</p>
      </div>

      <div className="bg-surface border border-surface-border rounded-2xl p-6 sm:p-8">
        <JobForm
          isSubmitting={submitting !== null}
          error={error}
          submitLabel={submitting === "PUBLISHED" ? "Publishing…" : "Publish to Marketplace"}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
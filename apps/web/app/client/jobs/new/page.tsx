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
    try {
      const token = getAuthToken();
      if (!token) {
        setError("You need to sign in to create a job.");
        setSubmitting(null);
        return;
      }
      const res = await createJob(token, {
        title: values.title,
        description: values.description,
        budget: Number(values.budget),
        tokenSymbol: values.tokenSymbol,
        skills: values.skills,
        deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
        status,
        milestones: values.milestones.map((m) => ({
          title: m.title,
          description: m.description,
          amount: Number(m.amount),
        })),
      });
      router.push(`/client/jobs/${res.job.id}`);
    } catch (e) {
      setError(apiErrorMessage(e));
      setSubmitting(null);
    }
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
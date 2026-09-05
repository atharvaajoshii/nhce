"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { fetchJob, updateJob, getAuthToken, Job } from "@/lib/api";
import { useApiFetch, apiErrorMessage } from "@/hooks/useApiFetch";
import JobForm, { JobFormValues } from "@/app/client/components/JobForm";

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data, isLoading, error } = useApiFetch<Job | null>(async () => {
    // Draft jobs are private to the owner — fetch with the authenticated token.
    const response = await fetchJob(id, getAuthToken());
    return response.job;
  }, [id]);
  const job = data ?? null;

  const handleSubmit = async (status: "DRAFT" | "PUBLISHED", values: JobFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        setSubmitError("You need to sign in to edit this job.");
        setSubmitting(false);
        return;
      }
      await updateJob(token, id, {
        title: values.title,
        description: values.description,
        budget: Number(values.budget),
        tokenSymbol: values.tokenSymbol,
        skills: values.skills,
        deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
        status,
      });
      router.push(`/client/jobs/${id}`);
    } catch (e) {
      setSubmitError(apiErrorMessage(e));
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-moss" />
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-20">
        <EmptyState
          icon={AlertCircle}
          title="Job Not Found"
          description={error || "This job could not be loaded."}
          action={{ label: "Back to My Jobs", onClick: () => router.push("/client/jobs") }}
        />
      </main>
    );
  }

  if (job.status !== "DRAFT" && job.status !== "PUBLISHED") {
    return (
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-20">
        <EmptyState
          icon={AlertCircle}
          title="This job can no longer be edited"
          description={`Jobs in the ${job.status.replace(/_/g, " ").toLowerCase()} state are locked. Escrow and contract setup arrive in a later phase.`}
          action={{ label: "View Job", onClick: () => router.push(`/client/jobs/${job.id}`) }}
        />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
      <div>
        <Link href={`/client/jobs/${job.id}`} className="inline-flex items-center gap-2 text-muted hover:text-moss transition-colors duration-300 font-mono text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to Job
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Edit Job</h1>
        <p className="text-muted text-sm">Update the details below, then save as a draft or publish to the marketplace.</p>
      </div>

      <div className="bg-surface border border-surface-border rounded-2xl p-6 sm:p-8">
        <JobForm
          initialValues={{
            title: job.title,
            description: job.description,
            skills: job.skills,
            budget: String(job.budget),
            tokenSymbol: job.tokenSymbol,
            deadline: job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : "",
          }}
          allowMilestones={false}
          isSubmitting={submitting}
          error={submitError}
          submitLabel={job.status === "DRAFT" ? "Save & Publish" : "Save Changes"}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
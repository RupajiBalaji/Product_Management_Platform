import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Scale,
  Sparkles,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  GitPullRequest,
  Figma,
  User,
  ShieldAlert,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  getPendingSubmissions,
  getPendingAppeals,
  reviewSubmissionHuman,
  resolveAppeal,
} from "@/lib/db";
import type { Submission, Appeal } from "@/lib/types";
import {
  EVALUATION_MODE_STYLES,
  SUBMISSION_STATUS_STYLES,
  APPEAL_STATUS_STYLES,
  PRIORITY_STYLES,
  normalizePriority,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/reviews")({
  component: ReviewsQueuePage,
});

function ReviewsQueuePage() {
  const [activeTab, setActiveTab] = useState<"submissions" | "appeals">("submissions");
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([]);
  const [pendingAppeals, setPendingAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected item for side-by-side review
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);

  // Form review notes
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subs, appeals] = await Promise.all([
        getPendingSubmissions(),
        getPendingAppeals(),
      ]);
      setPendingSubmissions(subs);
      setPendingAppeals(appeals);

      if (subs.length > 0 && !selectedSubId) {
        setSelectedSubId(subs[0].id || subs[0]._id!);
      }
      if (appeals.length > 0 && !selectedAppealId) {
        setSelectedAppealId(appeals[0].id || appeals[0]._id!);
      }
    } catch (err) {
      console.error("Failed to load review queues:", err);
      toast.error("Failed to load review queues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReviewSubmission = async (decision: "approved" | "rejected") => {
    if (!selectedSubId) return;
    setSubmittingAction(true);
    try {
      await reviewSubmissionHuman(selectedSubId, decision, reviewNotes);
      toast.success(`Submission marked as ${decision.toUpperCase()}`);
      setReviewNotes("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process review");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolveAppeal = async (decision: "overridden" | "upheld") => {
    if (!selectedAppealId) return;
    setSubmittingAction(true);
    try {
      await resolveAppeal(selectedAppealId, decision, reviewNotes);
      toast.success(
        decision === "overridden"
          ? "Appeal Overridden — Linked submission approved!"
          : "Appeal Upheld — Rejection maintained."
      );
      setReviewNotes("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to resolve appeal");
    } finally {
      setSubmittingAction(false);
    }
  };

  const selectedSubmission = pendingSubmissions.find((s) => (s.id || s._id) === selectedSubId);
  const selectedAppeal = pendingAppeals.find((a) => (a.id || a._id) === selectedAppealId);

  return (
    <AppShell
      eyebrow="Governance Quality Gates · Phase 4"
      title="QA Definition-of-Done & Appeals Queue"
      actions={
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          <span>Refresh Queue</span>
        </button>
      }
    >
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveTab("submissions")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
            activeTab === "submissions"
              ? "bg-primary text-primary-foreground shadow-glow"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="size-3.5" />
          <span>Subjective Sign-Offs ({pendingSubmissions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("appeals")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
            activeTab === "appeals"
              ? "bg-warning text-black shadow-xs"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Scale className="size-3.5" />
          <span>Contested Appeals ({pendingAppeals.length})</span>
        </button>
      </div>

      {loading && (
        <div className="panel p-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="size-8 animate-spin text-primary mb-3" />
          <p className="text-xs text-muted-foreground">Loading QA review queues...</p>
        </div>
      )}

      {!loading && activeTab === "submissions" && (
        pendingSubmissions.length === 0 ? (
          <div className="panel p-16 text-center text-muted-foreground">
            <CheckCircle2 className="size-10 mx-auto text-success/50 mb-3" />
            <h3 className="font-display font-bold text-base text-foreground">Review Queue is Clear</h3>
            <p className="text-xs mt-1">No subjective deliverables are currently awaiting sign-off.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Submissions List */}
            <div className="lg:col-span-5 space-y-2.5">
              <p className="text-eyebrow text-[10px] text-muted-foreground mb-1">
                Awaiting Human Sign-Off ({pendingSubmissions.length})
              </p>
              {pendingSubmissions.map((sub) => {
                const id = sub.id || sub._id;
                const isSelected = id === selectedSubId;
                const taskObj: any = sub.task_id;
                const employeeObj: any = sub.employee_id;

                return (
                  <div
                    key={id}
                    onClick={() => {
                      setSelectedSubId(id);
                      setReviewNotes("");
                    }}
                    className={cn(
                      "panel p-4 cursor-pointer transition-all border text-left",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : "border-border hover:border-primary/40 bg-card"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-xs text-foreground truncate flex-1">
                        {taskObj?.title || "Task Deliverable"}
                      </h4>
                      <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[9px] font-mono text-warning shrink-0">
                        {sub.evaluation_mode}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground truncate mb-2">
                      by <strong className="text-foreground">{employeeObj?.full_name || "Employee"}</strong> ({employeeObj?.role_title || "Contributor"})
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-2">
                      <span className="truncate max-w-[200px]">{sub.artifact_url}</span>
                      <span>{sub.created_at ? format(new Date(sub.created_at), "MMM d") : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Side-by-Side Detail & Decision Form */}
            <div className="lg:col-span-7">
              {selectedSubmission ? (
                <div className="panel p-6 bg-card border-border space-y-5 sticky top-6">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
                    <div>
                      <span className="text-eyebrow text-[10px] text-primary">
                        {(selectedSubmission.task_id as any)?.project_id?.title || "Project"}
                      </span>
                      <h3 className="font-display font-bold text-base text-foreground mt-0.5">
                        {(selectedSubmission.task_id as any)?.title || "Task Deliverable"}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted by {(selectedSubmission.employee_id as any)?.full_name || "Developer"}
                      </p>
                    </div>

                    <span className="rounded-full border border-pink-500/40 bg-pink-500/10 px-2.5 py-1 text-[10px] font-bold text-pink-300 font-mono shrink-0">
                      Subjective Mode
                    </span>
                  </div>

                  {/* Artifact Box */}
                  <div className="panel p-4 bg-elevated/60 text-xs space-y-2 border-border/70">
                    <p className="text-eyebrow text-[10px] text-muted-foreground">Deliverable Artifact:</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground truncate">
                        {selectedSubmission.artifact_url}
                      </span>
                      {selectedSubmission.artifact_url.startsWith("http") && (
                        <a
                          href={selectedSubmission.artifact_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 shrink-0"
                        >
                          <span>Open Link</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>

                    {selectedSubmission.ai_verdict?.reasoning && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 border-t border-border/40 pt-1.5">
                        <strong>Structural Check:</strong> {selectedSubmission.ai_verdict.reasoning}
                      </p>
                    )}
                  </div>

                  {/* Decision Form */}
                  <div className="space-y-3 pt-2">
                    <label className="text-eyebrow block">Reviewer Feedback / Sign-Off Notes</label>
                    <textarea
                      rows={3}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Add specific constructive feedback or approval remarks..."
                      className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                    />

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => handleReviewSubmission("rejected")}
                        disabled={submittingAction}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-destructive/50 bg-destructive/15 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        <XCircle className="size-4" />
                        <span>Request Changes</span>
                      </button>

                      <button
                        onClick={() => handleReviewSubmission("approved")}
                        disabled={submittingAction}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-success text-black py-2.5 text-xs font-extrabold hover:bg-success/90 disabled:opacity-50 transition-all cursor-pointer shadow-glow"
                      >
                        <CheckCircle2 className="size-4" />
                        <span>Approve Deliverable</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )
      )}

      {!loading && activeTab === "appeals" && (
        pendingAppeals.length === 0 ? (
            <div className="panel p-16 text-center text-muted-foreground">
              <CheckCircle2 className="size-10 mx-auto text-success/50 mb-3" />
              <h3 className="font-display font-bold text-base text-foreground">No Pending Appeals</h3>
              <p className="text-xs mt-1">There are no contested rejections waiting for review.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Appeals List */}
              <div className="lg:col-span-5 space-y-2.5">
                <p className="text-eyebrow text-[10px] text-muted-foreground mb-1">
                  Pending Appeals ({pendingAppeals.length})
                </p>
                {pendingAppeals.map((appeal) => {
                  const id = appeal.id || appeal._id;
                  const isSelected = id === selectedAppealId;
                  const subObj: any = appeal.submission_id;
                  const empObj: any = appeal.employee_id;

                  return (
                    <div
                      key={id}
                      onClick={() => {
                        setSelectedAppealId(id);
                        setReviewNotes("");
                      }}
                      className={cn(
                        "panel p-4 cursor-pointer transition-all border text-left",
                        isSelected
                          ? "border-warning bg-warning/5 shadow-xs"
                          : "border-border hover:border-warning/40 bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="font-bold text-xs text-foreground truncate flex-1">
                          {subObj?.task_id?.title || "Task Appeal"}
                        </h4>
                        <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[9px] font-mono text-warning font-bold shrink-0">
                          Appeal
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground truncate mb-2">
                        Filed by <strong className="text-foreground">{empObj?.full_name || "Employee"}</strong>
                      </p>

                      <p className="text-xs text-foreground/80 line-clamp-2 italic bg-elevated p-2 rounded-lg mb-2">
                        "{appeal.justification}"
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-2">
                        <span>Rejection Contested</span>
                        <span>{appeal.created_at ? format(new Date(appeal.created_at), "MMM d") : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Side-by-Side Rejection vs Justification */}
              <div className="lg:col-span-7">
                {selectedAppeal ? (
                  <div className="panel p-6 bg-card border-border space-y-5 sticky top-6">
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
                      <div>
                        <span className="text-eyebrow text-[10px] text-warning">Contested QA Evaluation</span>
                        <h3 className="font-display font-bold text-base text-foreground mt-0.5">
                          {((selectedAppeal.submission_id as any)?.task_id?.title) || "Task Deliverable"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Filed by {(selectedAppeal.employee_id as any)?.full_name || "Developer"}
                        </p>
                      </div>

                      <span className="rounded-full border border-warning/40 bg-warning/20 px-2.5 py-1 text-[10px] font-bold text-warning font-mono shrink-0">
                        Pending Decision
                      </span>
                    </div>

                    {/* Side-by-side: Rejection Reason vs Employee Justification */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Original Rejection */}
                      <div className="panel p-4 bg-destructive/10 border-destructive/30 space-y-2">
                        <p className="text-[10px] font-bold text-destructive uppercase tracking-wider flex items-center gap-1">
                          <XCircle className="size-3.5" /> Original Rejection
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {(selectedAppeal.submission_id as any)?.ai_verdict?.reasoning || "Requirements incomplete."}
                        </p>
                        {((selectedAppeal.submission_id as any)?.ai_verdict?.missing_items || []).length > 0 && (
                          <div className="text-[11px] text-destructive pt-1">
                            <strong>Missing:</strong>{" "}
                            {(selectedAppeal.submission_id as any).ai_verdict.missing_items.join(", ")}
                          </div>
                        )}
                      </div>

                      {/* Employee Justification */}
                      <div className="panel p-4 bg-primary/10 border-primary/30 space-y-2">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                          <Scale className="size-3.5" /> Employee Justification
                        </p>
                        <p className="text-xs text-foreground/90 leading-relaxed italic">
                          "{selectedAppeal.justification}"
                        </p>
                      </div>
                    </div>

                    {/* Contested Artifact Reference */}
                    <div className="panel p-3.5 bg-elevated text-xs flex items-center justify-between gap-2 border-border/80">
                      <span className="font-mono text-xs text-foreground truncate">
                        {(selectedAppeal.submission_id as any)?.artifact_url}
                      </span>
                      {(selectedAppeal.submission_id as any)?.artifact_url?.startsWith("http") && (
                        <a
                          href={(selectedAppeal.submission_id as any).artifact_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline shrink-0"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>

                    {/* Decision Form */}
                    <div className="space-y-3 pt-2 border-t border-border">
                      <label className="text-eyebrow block">Architectural Ruling Notes</label>
                      <textarea
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Explain rationale for overriding or upholding the rejection..."
                        className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                      />

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={() => handleResolveAppeal("upheld")}
                          disabled={submittingAction}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-destructive/50 bg-destructive/15 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          <XCircle className="size-4" />
                          <span>Uphold Rejection</span>
                        </button>

                        <button
                          onClick={() => handleResolveAppeal("overridden")}
                          disabled={submittingAction}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-success text-black py-2.5 text-xs font-extrabold hover:bg-success/90 disabled:opacity-50 transition-all cursor-pointer shadow-glow"
                        >
                          <CheckCircle2 className="size-4" />
                          <span>Override (Approve Work)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )
        )
      }
    </AppShell>
  );
}

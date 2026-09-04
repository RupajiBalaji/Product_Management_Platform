import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  Send,
  Loader2,
  ArrowLeft,
  GitPullRequest,
  Figma,
  FileText,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Scale,
  Sparkles,
  Layers,
  X,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import {
  getTaskById,
  submitDailyLog,
  getDailyLog,
  getProjectById,
  createSubmission,
  getSubmissionsByTask,
  createAppeal,
} from "@/lib/db";
import type { Task, DailyLog, Project, Submission, Appeal } from "@/lib/types";
import {
  EVALUATION_MODE_STYLES,
  SUBMISSION_STATUS_STYLES,
  APPEAL_STATUS_STYLES,
  type EvaluationMode,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/tasks/$taskId/log")({
  component: TaskDeliverableAndLogPage,
});

function TaskDeliverableAndLogPage() {
  const { taskId } = Route.useParams();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  // Tab State: "qa" (Deliverables & QA Gate) or "log" (Daily Log)
  const [activeTab, setActiveTab] = useState<"qa" | "log">("qa");

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("objective");

  // Daily Log State
  const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
  const [didWork, setDidWork] = useState(true);
  const [workText, setWorkText] = useState("");
  const [noWorkReason, setNoWorkReason] = useState("");
  const [submittingLog, setSubmittingLog] = useState(false);

  // Submissions State (Phase 4 QA Gate)
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [artifactUrl, setArtifactUrl] = useState("");
  const [artifactType, setArtifactType] = useState<"pr_link" | "figma_link" | "file" | "text">("pr_link");
  const [submittingArtifact, setSubmittingArtifact] = useState(false);

  // Appeal Modal State
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [selectedSubmissionForAppeal, setSelectedSubmissionForAppeal] = useState<Submission | null>(null);
  const [appealJustification, setAppealJustification] = useState("");
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadAll = async () => {
    if (!userProfile) return;
    try {
      const [t, log, subs] = await Promise.all([
        getTaskById(taskId),
        getDailyLog(taskId, userProfile.id, today),
        getSubmissionsByTask(taskId),
      ]);

      setTask(t);
      setExistingLog(log);
      setSubmissions(subs);

      if (log) {
        setDidWork(log.has_worked);
        setWorkText(log.work_text);
        setNoWorkReason(log.no_work_reason);
      }

      if (t?.project_id) {
        const projId = typeof t.project_id === "object" ? (t.project_id as any).id || (t.project_id as any)._id : t.project_id;
        const proj = await getProjectById(String(projId));
        setProject(proj);

        // Detect user's dynamic role evaluation mode
        const alloc = (proj?.team_allocations || []).find((a) => String(a.user_id) === String(userProfile.id));
        if (alloc && (alloc as any).role_id) {
          // If role_id is populated or an object
          const roleObj = (alloc as any).role_id;
          if (typeof roleObj === "object" && roleObj.evaluationMode) {
            setEvaluationMode(roleObj.evaluationMode);
          }
        }
      }
    } catch (err) {
      console.error("Error loading task data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [taskId, userProfile]);

  // Handle Daily Log Submit
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (didWork && !workText.trim()) {
      toast.error("Please describe what you worked on.");
      return;
    }
    if (!didWork && !noWorkReason.trim()) {
      toast.error("Please provide a reason for not working today.");
      return;
    }

    setSubmittingLog(true);
    try {
      await submitDailyLog({
        task_id: taskId,
        user_id: userProfile.id,
        log_date: today,
        work_text: didWork ? workText.trim() : "",
        has_worked: didWork,
        no_work_reason: !didWork ? noWorkReason.trim() : "",
      });
      toast.success(existingLog ? "Daily log updated!" : "Daily log submitted! ✓");
      loadAll();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit log");
    } finally {
      setSubmittingLog(false);
    }
  };

  // Handle QA Deliverable Submission
  const handleArtifactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artifactUrl.trim()) {
      toast.error("Please provide an artifact URL or deliverable text.");
      return;
    }

    setSubmittingArtifact(true);
    try {
      const res = await createSubmission({
        task_id: taskId,
        artifact_url: artifactUrl.trim(),
        artifact_type: artifactType,
      });

      toast.success(res.message || "Deliverable submitted! Definition-of-Done evaluation started.");
      setArtifactUrl("");

      // Poll after 2.5 seconds to see the automated evaluation result
      setTimeout(() => {
        loadAll();
      }, 2500);

      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit deliverable");
    } finally {
      setSubmittingArtifact(false);
    }
  };

  // Handle Appeal Submit
  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmissionForAppeal) return;
    if (!appealJustification.trim()) {
      toast.error("Please provide a justification for your appeal.");
      return;
    }

    setSubmittingAppeal(true);
    try {
      await createAppeal({
        submission_id: selectedSubmissionForAppeal.id || selectedSubmissionForAppeal._id!,
        justification: appealJustification.trim(),
      });
      toast.success("Appeal submitted! Escalated to Product Lead / Lead Architect review queue.");
      setAppealModalOpen(false);
      setSelectedSubmissionForAppeal(null);
      setAppealJustification("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit appeal");
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Task Deliverable & QA" eyebrow="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const latestSubmission = submissions.length > 0 ? submissions[0] : null;
  const isApproved = submissions.some((s) => s.status === "approved");
  const evalStyle = EVALUATION_MODE_STYLES[evaluationMode];

  return (
    <AppShell
      eyebrow={`Task Operations · ${project?.title || "Project"}`}
      title={task?.title || "Task Overview"}
      actions={
        <Link
          to="/employee/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      }
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Task Header Card */}
        <div className="panel p-6 bg-card border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-eyebrow text-[10px] text-primary">
                  {project?.title}
                </span>
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold font-mono", evalStyle.badge)}>
                  <span>{evalStyle.icon}</span>
                  <span>{evalStyle.shortLabel}</span>
                </span>
                {isApproved && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success font-mono">
                    <CheckCircle2 className="size-3" /> QA Approved
                  </span>
                )}
              </div>
              <h2 className="font-display text-lg font-bold text-foreground">{task?.title}</h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                Due: {task?.end_date ? format(parseISO(task.end_date), "MMM d, yyyy") : "TBD"}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            {task?.description || "No specific instructions provided for this milestone."}
          </p>

          {/* Tab Navigation Pill */}
          <div className="flex items-center gap-2 mt-5 pt-3 border-t border-border/60">
            <button
              onClick={() => setActiveTab("qa")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
                activeTab === "qa"
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "border border-border bg-elevated text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="size-3.5" />
              <span>QA Definition of Done & Deliverables</span>
              {submissions.length > 0 && (
                <span className="ml-1 rounded-full bg-background/30 px-1.5 py-0.2 text-[9px] font-mono">
                  {submissions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("log")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
                activeTab === "log"
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "border border-border bg-elevated text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="size-3.5" />
              <span>Daily Work Log</span>
              {existingLog && (
                <span className="ml-1 text-[9px] text-success">✓</span>
              )}
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: QA DEFINITION OF DONE & DELIVERABLES                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {activeTab === "qa" && (
          <div className="space-y-6">
            {/* QA Evaluation Mode Callout */}
            <div className="panel p-4 bg-elevated/60 border-border/80 flex items-start gap-3">
              <span className="text-xl mt-0.5">{evalStyle.icon}</span>
              <div>
                <p className="font-semibold text-xs text-foreground">
                  Task Evaluation Mode: <span className="font-bold text-primary">{evalStyle.label}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {evalStyle.desc}
                  {evaluationMode === "subjective" && (
                    <span className="block mt-1 text-pink-400 font-medium">
                      Note: Subjective deliverables always require manual sign-off from your Product Lead or Lead Architect.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Deliverable Submission Form */}
            <div className="panel p-6 bg-card border-border">
              <h3 className="font-display font-bold text-sm text-foreground mb-1 flex items-center gap-2">
                <Send className="size-4 text-primary" />
                <span>Submit Deliverable for QA Verification</span>
              </h3>
              <p className="text-eyebrow text-[10px] text-muted-foreground mb-4">
                Submit PR link, Figma design URL, or deliverable proof to satisfy Definition-of-Done
              </p>

              <form onSubmit={handleArtifactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Artifact Type */}
                  <div>
                    <label className="text-eyebrow mb-1.5 block">Artifact Type</label>
                    <select
                      value={artifactType}
                      onChange={(e: any) => setArtifactType(e.target.value)}
                      className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="pr_link">🔗 Pull Request (GitHub / GitLab)</option>
                      <option value="figma_link">🎨 Figma Design File</option>
                      <option value="file">📁 File / Cloud Asset Link</option>
                      <option value="text">📝 Written Copy / Report</option>
                    </select>
                  </div>

                  {/* Artifact URL / Content */}
                  <div className="sm:col-span-2">
                    <label className="text-eyebrow mb-1.5 block">Deliverable URL or Content</label>
                    <input
                      type="text"
                      value={artifactUrl}
                      onChange={(e) => setArtifactUrl(e.target.value)}
                      placeholder={
                        artifactType === "pr_link"
                          ? "https://github.com/org/repo/pull/123"
                          : artifactType === "figma_link"
                          ? "https://figma.com/file/xyz/design-spec"
                          : artifactType === "file"
                          ? "https://storage.googleapis.com/... or cloud link"
                          : "Paste summary text, documentation, or copy..."
                      }
                      required
                      className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    Submissions are automatically analyzed against task criteria.
                  </span>
                  <button
                    type="submit"
                    disabled={submittingArtifact}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {submittingArtifact ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    <span>{submittingArtifact ? "Submitting…" : "Submit Deliverable"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Submissions History & Verdict Breakdown */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-foreground">
                  Verification History ({submissions.length})
                </h3>
                <button
                  onClick={loadAll}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <RotateCcw className="size-3" /> Refresh Status
                </button>
              </div>

              {submissions.length === 0 ? (
                <div className="panel p-8 text-center text-muted-foreground text-xs">
                  <Sparkles className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="font-semibold text-foreground">No deliverables submitted yet</p>
                  <p className="text-[11px] mt-0.5">Submit your work above to trigger QA verification.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissions.map((sub, index) => {
                    const statusMeta = SUBMISSION_STATUS_STYLES[sub.status] || SUBMISSION_STATUS_STYLES.pending_review;
                    const isRejected = sub.status === "rejected";
                    const isPassed = sub.status === "approved";
                    const isPending = sub.status === "pending_review";

                    return (
                      <div
                        key={sub.id || sub._id}
                        className={cn(
                          "panel p-5 border-l-4 transition-all bg-card space-y-3",
                          isPassed
                            ? "border-l-success"
                            : isRejected
                            ? "border-l-destructive"
                            : "border-l-warning"
                        )}
                      >
                        {/* Header: Artifact & Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{submissions.length - index}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-mono uppercase bg-elevated">
                              {sub.artifact_type.replace("_", " ")}
                            </span>
                            <a
                              href={sub.artifact_url.startsWith("http") ? sub.artifact_url : "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-xs text-primary hover:underline truncate max-w-sm flex items-center gap-1"
                            >
                              <span className="truncate">{sub.artifact_url}</span>
                              {sub.artifact_url.startsWith("http") && <ExternalLink className="size-3 shrink-0" />}
                            </a>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono",
                                statusMeta.badge
                              )}
                            >
                              <span>{statusMeta.icon}</span>
                              <span>{statusMeta.label}</span>
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {sub.created_at ? format(new Date(sub.created_at), "MMM d, h:mm a") : ""}
                            </span>
                          </div>
                        </div>

                        {/* AI Verdict Reasoning */}
                        {sub.ai_verdict?.reasoning && (
                          <div
                            className={cn(
                              "rounded-xl p-3 text-xs leading-relaxed",
                              isPassed
                                ? "bg-success/10 text-success-foreground border border-success/30"
                                : isRejected
                                ? "bg-destructive/10 text-destructive border border-destructive/30"
                                : "bg-muted/40 text-muted-foreground border border-border/60"
                            )}
                          >
                            <p className="font-semibold text-[11px] mb-1">
                              {sub.evaluation_mode === "objective" ? "🤖 Automated AI Verdict:" : "📋 Structural QA Status:"}
                            </p>
                            <p className="text-[11px]">{sub.ai_verdict.reasoning}</p>

                            {/* Missing Requirements List */}
                            {sub.ai_verdict.missing_items && sub.ai_verdict.missing_items.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-destructive/20">
                                <p className="font-bold text-[10px] uppercase tracking-wider mb-1">Missing Requirements:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                                  {sub.ai_verdict.missing_items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rejected Actions: Appeal Mechanism */}
                        {isRejected && (
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <span className="text-[11px] text-muted-foreground">
                              Disagree with this evaluation? You can appeal to the Lead Architect.
                            </span>
                            <button
                              onClick={() => {
                                setSelectedSubmissionForAppeal(sub);
                                setAppealModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-warning/50 bg-warning/15 px-3 py-1.5 text-xs font-bold text-warning hover:bg-warning/25 transition-colors cursor-pointer shadow-xs"
                            >
                              <Scale className="size-3.5" />
                              <span>Appeal This Decision</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 2: DAILY WORK LOG                                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {activeTab === "log" && (
          <div className="panel p-6 bg-card border-border space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="font-display font-bold text-sm text-foreground">Daily Standup Log</h3>
                <p className="text-eyebrow text-[10px] text-muted-foreground">
                  Record daily hours, deliverables, and blockers
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {format(new Date(), "MMMM d, yyyy")}
              </span>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-4">
              <div>
                <label className="text-eyebrow mb-2 block">Did you work on this task today?</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDidWork(true)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all cursor-pointer",
                      didWork
                        ? "border-success bg-success/15 text-success shadow-xs"
                        : "border-border bg-elevated text-muted-foreground hover:border-success/40"
                    )}
                  >
                    ✅ Yes, I worked today
                  </button>
                  <button
                    type="button"
                    onClick={() => setDidWork(false)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all cursor-pointer",
                      !didWork
                        ? "border-warning bg-warning/15 text-warning shadow-xs"
                        : "border-border bg-elevated text-muted-foreground hover:border-warning/40"
                    )}
                  >
                    ⏸️ No work today / Blocked
                  </button>
                </div>
              </div>

              {didWork ? (
                <div>
                  <label className="text-eyebrow mb-1.5 block">Describe what you completed today</label>
                  <textarea
                    rows={3}
                    value={workText}
                    onChange={(e) => setWorkText(e.target.value)}
                    placeholder="Describe implementation details, test coverage, PRs opened, or milestones achieved..."
                    required
                    className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-eyebrow mb-1.5 block">Reason for inactivity or blocker</label>
                  <textarea
                    rows={3}
                    value={noWorkReason}
                    onChange={(e) => setNoWorkReason(e.target.value)}
                    placeholder="e.g. Blocked on upstream API access, attending sprint planning, sick leave..."
                    required
                    className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submittingLog}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {submittingLog ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  <span>{existingLog ? "Update Daily Log" : "Submit Daily Log"}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* APPEAL MODAL (Phase 4 Appeal Mechanism)                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {appealModalOpen && selectedSubmissionForAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-warning/10 text-warning">
                  <Scale className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Appeal QA Rejection
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Escalate to Product Lead / Lead Architect for architectural review
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAppealModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Submission Context Snippet */}
            <div className="panel p-3.5 bg-elevated text-xs space-y-1.5 border-border/80">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Contested Artifact:
              </p>
              <p className="font-mono text-xs text-foreground truncate">
                {selectedSubmissionForAppeal.artifact_url}
              </p>
              {selectedSubmissionForAppeal.ai_verdict?.reasoning && (
                <p className="text-[11px] text-destructive italic mt-1">
                  Rejection Reason: "{selectedSubmissionForAppeal.ai_verdict.reasoning}"
                </p>
              )}
            </div>

            <form onSubmit={handleAppealSubmit} className="space-y-4">
              <div>
                <label className="text-eyebrow mb-1.5 block">Your Counter-Argument & Justification</label>
                <textarea
                  rows={4}
                  value={appealJustification}
                  onChange={(e) => setAppealJustification(e.target.value)}
                  placeholder="Explain why the deliverable satisfies the task requirements, context on design trade-offs, or why the automated check was inaccurate..."
                  required
                  className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setAppealModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAppeal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-warning px-4 py-2 text-xs font-bold text-black hover:bg-warning/90 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                >
                  {submittingAppeal ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Scale className="size-3.5" />
                  )}
                  <span>Submit Appeal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

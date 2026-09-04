import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO, startOfWeek, endOfWeek } from "date-fns";
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
  ArrowUpDown,
  CalendarSync,
  MessageSquare,
  Ban,
  HelpCircle,
  Check,
  Info,
  Lock,
  ListTree,
  Plus,
  CheckCircle,
  Circle,
  ArrowUpRight,
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
  reorderTask,
  swapTask,
  requestClarification,
  getTaskActionHistory,
  createSubtask,
  getSubtasks,
  getTaskProgress,
  updateTask,
} from "@/lib/db";
import type { Task, DailyLog, Project, Submission, Appeal, ActionRequest, TaskProgressResponse } from "@/lib/types";
import {
  EVALUATION_MODE_STYLES,
  SUBMISSION_STATUS_STYLES,
  APPEAL_STATUS_STYLES,
  ACTION_STATUS_STYLES,
  ACTION_TYPE_LABELS,
  TASK_PRIORITY_STYLES,
  type EvaluationMode,
  type TaskPriority,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/tasks/$taskId/log")({
  component: TaskDeliverableAndLogPage,
});

function TaskDeliverableAndLogPage() {
  const { taskId } = Route.useParams();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  // Tab State: "qa" | "log" | "subtasks" | "actions"
  const [activeTab, setActiveTab] = useState<"qa" | "log" | "subtasks" | "actions">("qa");

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("objective");

  // Sub-Task State (Phase 7)
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [subtaskProgress, setSubtaskProgress] = useState<TaskProgressResponse | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDesc, setSubtaskDesc] = useState("");
  const [subtaskHours, setSubtaskHours] = useState<number>(4);
  const [subtaskCriteriaOverride, setSubtaskCriteriaOverride] = useState("");
  const [submittingSubtask, setSubmittingSubtask] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);

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

  // Phase 6 Action Mode State
  const [actionHistory, setActionHistory] = useState<ActionRequest[]>([]);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [newPosition, setNewPosition] = useState<number>(0);
  const [submittingReorder, setSubmittingReorder] = useState(false);

  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [submittingSwap, setSubmittingSwap] = useState(false);

  const [clarificationModalOpen, setClarificationModalOpen] = useState(false);
  const [clarificationQuestion, setClarificationQuestion] = useState("");
  const [submittingClarification, setSubmittingClarification] = useState(false);
  const [autoAnswerResult, setAutoAnswerResult] = useState<{ question: string; answer: string } | null>(null);

  const [postponeModalOpen, setPostponeModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadAll = async () => {
    if (!userProfile) return;
    try {
      const [t, log, subs, history, childTasks, prog] = await Promise.all([
        getTaskById(taskId),
        getDailyLog(taskId, userProfile.id, today),
        getSubmissionsByTask(taskId),
        getTaskActionHistory(taskId),
        getSubtasks(taskId),
        getTaskProgress(taskId),
      ]);

      setTask(t);
      setExistingLog(log);
      setSubtasks(childTasks);
      setSubtaskProgress(prog);
      if (t?.order_index !== undefined) {
        setNewPosition(t.order_index);
      }
      if (t?.end_date) {
        setTargetDate(t.end_date);
      }

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

  // Handle Sub-Task Creation (Phase 7)
  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskTitle.trim()) {
      toast.error("Please enter a title for the sub-task.");
      return;
    }
    setSubmittingSubtask(true);
    try {
      await createSubtask(taskId, {
        title: subtaskTitle.trim(),
        description: subtaskDesc.trim() || undefined,
        estimate_hours: Number(subtaskHours) || 0,
        acceptance_criteria_override: subtaskCriteriaOverride.trim() || undefined,
        start_date: task?.start_date,
        end_date: task?.end_date,
      });
      toast.success("Sub-task decomposed successfully!");
      setSubtaskTitle("");
      setSubtaskDesc("");
      setSubtaskCriteriaOverride("");
      setShowSubtaskForm(false);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to create subtask");
    } finally {
      setSubmittingSubtask(false);
    }
  };

  // Handle Sub-Task Status Toggle (Phase 7)
  const handleToggleSubtaskStatus = async (sub: Task) => {
    const nextStatus = sub.status === "completed" ? "active" : "completed";
    try {
      await updateTask(sub.id || sub._id!, { status: nextStatus });
      toast.success(`Sub-task marked as ${nextStatus === "completed" ? "completed ✓" : "active"}!`);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to update sub-task status");
    }
  };

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

  // Current week bounds (Monday to Sunday)
  const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const currentWeekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  // Handle Reorder Submit
  const handleReorderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReorder(true);
    try {
      const res = await reorderTask(taskId, Number(newPosition));
      if (res.actionRequest.status === "auto_approved") {
        toast.success(res.message || "Task reordered successfully!");
        setReorderModalOpen(false);
        loadAll();
      } else {
        toast.error(`Reorder blocked: ${res.actionRequest.decision_reasoning}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reorder task");
    } finally {
      setSubmittingReorder(false);
    }
  };

  // Handle Swap Submit
  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate) {
      toast.error("Please select a target date within the current week.");
      return;
    }
    setSubmittingSwap(true);
    try {
      const res = await swapTask(taskId, targetDate);
      if (res.actionRequest.status === "auto_approved") {
        toast.success(res.message || "Task swapped within week!");
        setSwapModalOpen(false);
        loadAll();
      } else {
        toast.error(`Swap blocked: ${res.actionRequest.decision_reasoning}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to swap task");
    } finally {
      setSubmittingSwap(false);
    }
  };

  // Handle Clarification Request
  const handleClarificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarificationQuestion.trim()) {
      toast.error("Please enter your clarification question.");
      return;
    }
    setSubmittingClarification(true);
    try {
      const res = await requestClarification(taskId, clarificationQuestion.trim());
      if (res.autoAnswered && res.answer) {
        toast.success("Instant clarification found by AI!");
        setAutoAnswerResult({
          question: clarificationQuestion.trim(),
          answer: res.answer,
        });
        setClarificationQuestion("");
        setClarificationModalOpen(false);
        loadAll();
      } else {
        toast.info("Clarification sent to Product Lead! Slippage clock is paused.");
        setClarificationQuestion("");
        setClarificationModalOpen(false);
        loadAll();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to request clarification");
    } finally {
      setSubmittingClarification(false);
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
        {/* Slippage Paused / Awaiting Clarification Banner */}
        {task?.slippage_frozen && (
          <div className="panel p-4 bg-amber-500/10 border-amber-500/40 flex items-center justify-between gap-3 text-amber-300">
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-amber-400 shrink-0 animate-pulse" />
              <div>
                <p className="font-bold text-xs">⏳ Awaiting Product Lead Clarification (Slippage Paused)</p>
                <p className="text-[11px] text-amber-300/80">
                  The 3-day slippage clock is frozen for this task until your Product Lead or Lead Architect answers your pending clarification.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 shrink-0">
              Clock Paused
            </span>
          </div>
        )}

        {/* Task Header Card */}
        <div className="panel p-6 bg-card border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-eyebrow text-[10px] text-primary">
                  {project?.title}
                </span>

                {/* Task Computed Priority Badge (Phase 7) */}
                {task?.computed_priority && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold font-mono",
                      TASK_PRIORITY_STYLES[task.computed_priority]?.badge || TASK_PRIORITY_STYLES.P2.badge
                    )}
                  >
                    <span>{TASK_PRIORITY_STYLES[task.computed_priority]?.icon}</span>
                    <span>{TASK_PRIORITY_STYLES[task.computed_priority]?.shortLabel}</span>
                  </span>
                )}

                {/* Sub-Task Breadcrumb / Parent Indicator */}
                {task?.is_subtask && task.parent_task_id && (
                  <Link
                    to="/employee/tasks/$taskId/log"
                    params={{ taskId: String(task.parent_task_id) }}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <span>Sub-task of Parent ↗</span>
                  </Link>
                )}

                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold font-mono", evalStyle.badge)}>
                  <span>{evalStyle.icon}</span>
                  <span>{evalStyle.shortLabel}</span>
                </span>
                {isApproved && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success font-mono">
                    <CheckCircle2 className="size-3" /> QA Approved
                  </span>
                )}
                {task?.order_index !== undefined && task.order_index > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary font-mono">
                    Order #{task.order_index}
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
          <div className="flex items-center gap-2 mt-5 pt-3 border-t border-border/60 flex-wrap">
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

            {/* Sub-Tasks Tab (Phase 7) */}
            <button
              onClick={() => setActiveTab("subtasks")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
                activeTab === "subtasks"
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "border border-border bg-elevated text-muted-foreground hover:text-foreground"
              )}
            >
              <ListTree className="size-3.5" />
              <span>Sub-Tasks</span>
              {subtasks.length > 0 && (
                <span className="ml-1 rounded-full bg-background/30 px-1.5 py-0.2 text-[9px] font-mono">
                  {subtaskProgress?.completedSubtasks || 0}/{subtasks.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("actions")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer",
                activeTab === "actions"
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "border border-border bg-elevated text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowUpDown className="size-3.5" />
              <span>Action Mode (Reorder/Swap/Clarify)</span>
              {(task?.clarifications || []).length > 0 && (
                <span className="ml-1 rounded-full bg-background/30 px-1.5 py-0.2 text-[9px] font-mono">
                  {task?.clarifications?.length}
                </span>
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

              {/* QA Rejection Warning Indicator (Streak >= 2) */}
              {(() => {
                let streak = 0;
                for (const s of submissions) {
                  if (s.status === "rejected") {
                    streak++;
                  } else if (s.status === "approved") {
                    break;
                  } else {
                    break;
                  }
                }
                if (streak < 2) return null;
                return (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 flex items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-warning">
                          QA Rejection Warning ({streak} consecutive rejections)
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {streak >= 3
                            ? "This deliverable has reached 3 consecutive rejections. A slippage alert has been dispatched to the Product Lead for assistance or criteria review."
                            : "This deliverable has failed QA verification 2 times in a row. A 3rd consecutive rejection will trigger an automated escalation to the Product Lead."}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full border border-warning/50 bg-warning/20 text-[10px] font-mono font-bold text-warning shrink-0">
                      Streak: {streak}/3
                    </span>
                  </div>
                );
              })()}

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

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 3: SUB-TASK DECOMPOSITION (PHASE 7)                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {activeTab === "subtasks" && (
          <div className="space-y-6">
            {/* Progress Header Banner */}
            <div className="panel p-5 bg-card border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                    <ListTree className="size-4 text-primary" />
                    <span>Sub-Task Decomposition & Progress</span>
                  </h3>
                  <p className="text-eyebrow text-[10px] text-muted-foreground mt-0.5">
                    Break large deliverables into granular, verifiable sub-tasks with independent acceptance criteria
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {subtaskProgress?.completedSubtasks || 0} / {subtaskProgress?.totalSubtasks || subtasks.length} Completed
                  </span>
                  <span className="rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-xs font-bold text-primary font-mono">
                    {subtaskProgress?.progressPct ?? (subtasks.length > 0 ? 0 : task?.status === "completed" ? 100 : 0)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        subtaskProgress?.progressPct ?? (subtasks.length > 0 ? 0 : task?.status === "completed" ? 100 : 0)
                      )
                    )}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50 text-xs">
                <span className="text-muted-foreground text-[11px]">
                  Parent task progress updates automatically as sub-tasks are marked complete.
                </span>
                <button
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="size-3.5" />
                  <span>{showSubtaskForm ? "Close Form" : "Break into Sub-Task"}</span>
                </button>
              </div>
            </div>

            {/* Subtask Creation Form Modal/Card */}
            {showSubtaskForm && (
              <div className="panel p-6 bg-card border-primary/40 shadow-glow">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
                  <h4 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
                    <Plus className="size-4 text-primary" /> Create Sub-Task
                  </h4>
                  <button
                    onClick={() => setShowSubtaskForm(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateSubtask} className="space-y-4">
                  <div>
                    <label className="text-eyebrow mb-1.5 block">Sub-Task Title *</label>
                    <input
                      type="text"
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="e.g. Implement repository query functions"
                      required
                      className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-eyebrow mb-1.5 block">Description</label>
                    <textarea
                      rows={2}
                      value={subtaskDesc}
                      onChange={(e) => setSubtaskDesc(e.target.value)}
                      placeholder="Optional implementation details, acceptance hints..."
                      className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-eyebrow mb-1.5 block">Estimated Hours</label>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={subtaskHours}
                        onChange={(e) => setSubtaskHours(Number(e.target.value) || 0)}
                        className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-eyebrow mb-1.5 block">Acceptance Criteria Override (Optional)</label>
                      <input
                        type="text"
                        value={subtaskCriteriaOverride}
                        onChange={(e) => setSubtaskCriteriaOverride(e.target.value)}
                        placeholder="Inherits parent criteria if left empty"
                        className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSubtaskForm(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-elevated transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingSubtask}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {submittingSubtask ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      <span>{submittingSubtask ? "Creating…" : "Save Sub-Task"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Subtasks List */}
            <div className="space-y-3">
              <h4 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Sub-Tasks Breakdown ({subtasks.length})
              </h4>

              {subtasks.length === 0 ? (
                <div className="panel p-8 text-center text-muted-foreground text-xs">
                  <ListTree className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="font-semibold text-foreground">No sub-tasks created yet</p>
                  <p className="text-[11px] mt-0.5">
                    Click "Break into Sub-Task" above to decompose this deliverable into manageable increments.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {subtasks.map((sub, idx) => {
                    const isDone = sub.status === "completed";
                    return (
                      <div
                        key={sub.id || sub._id}
                        className={cn(
                          "panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 transition-all bg-card",
                          isDone ? "border-l-success opacity-85" : "border-l-primary"
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Status Toggle Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleSubtaskStatus(sub)}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            title={isDone ? "Mark as active" : "Mark as completed"}
                          >
                            {isDone ? (
                              <CheckCircle className="size-5 text-success" />
                            ) : (
                              <Circle className="size-5 text-muted-foreground/60 hover:text-primary" />
                            )}
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <h5
                                className={cn(
                                  "font-bold text-xs text-foreground truncate",
                                  isDone && "line-through text-muted-foreground"
                                )}
                              >
                                {sub.title}
                              </h5>
                              <span className="rounded-full border border-border bg-elevated px-2 py-0.2 font-mono text-[9px] text-muted-foreground">
                                {sub.estimate_hours || 0}h
                              </span>
                              {sub.acceptance_criteria_override && (
                                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.2 font-mono text-[8px] font-bold text-primary truncate max-w-[200px]">
                                  Criteria: {sub.acceptance_criteria_override}
                                </span>
                              )}
                            </div>
                            {sub.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-1">
                                {sub.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <Link
                            to="/employee/tasks/$taskId/log"
                            params={{ taskId: sub.id || sub._id! }}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
                          >
                            <span>Open Task</span>
                            <ArrowUpRight className="size-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 4: EMPLOYEE ACTION MODE (REORDER / SWAP / CLARIFY / POSTPONE)   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {activeTab === "actions" && (
          <div className="space-y-6">
            {/* Action Mode Overview Banner */}
            <div className="panel p-5 bg-elevated/70 border-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                    <ArrowUpDown className="size-4 text-primary" />
                    <span>Employee Action Mode</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    You have autonomous control to reorder your work sequence and swap due dates within the current work week. Postponements beyond the week are strictly governed to protect project timelines.
                  </p>
                </div>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-mono font-bold text-primary shrink-0">
                  Week: {currentWeekStart} → {currentWeekEnd}
                </span>
              </div>
            </div>

            {/* Quick Action Tiles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tile 1: Reorder Task */}
              <div className="panel p-5 bg-card border-border hover:border-primary/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <ArrowUpDown className="size-4" />
                      </div>
                      <h4 className="font-bold text-xs text-foreground">Reorder Priority</h4>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-primary">
                      Current: #{task?.order_index ?? 0}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Change your execution sequence. Auto-approved if prerequisite dependencies in the DAG are satisfied.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/50">
                  <button
                    onClick={() => {
                      setNewPosition(task?.order_index ?? 0);
                      setReorderModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    <span>Change Position</span>
                  </button>
                </div>
              </div>

              {/* Tile 2: Swap Within Week */}
              <div className="panel p-5 bg-card border-border hover:border-primary/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                        <CalendarSync className="size-4" />
                      </div>
                      <h4 className="font-bold text-xs text-foreground">Swap Within Week</h4>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Due: {task?.end_date ? format(parseISO(task.end_date), "MMM d") : "TBD"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Shift this task to another day in the current work week. Auto-approved if weekly workload stays ≤ 40 hours.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/50">
                  <button
                    onClick={() => {
                      setTargetDate(task?.end_date || currentWeekStart);
                      setSwapModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                  >
                    <span>Swap to Date This Week</span>
                  </button>
                </div>
              </div>

              {/* Tile 3: Request Clarification */}
              <div className="panel p-5 bg-card border-border hover:border-amber-500/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                        <MessageSquare className="size-4" />
                      </div>
                      <h4 className="font-bold text-xs text-foreground">Request Clarification</h4>
                    </div>
                    {task?.slippage_frozen ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-amber-300">
                        Slippage Paused
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Pauses Slippage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ask requirements questions. AI checks project specs immediately, or freezes your slippage clock and alerts your Product Lead.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/50">
                  <button
                    onClick={() => setClarificationModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    <span>Ask Clarification Question</span>
                  </button>
                </div>
              </div>

              {/* Tile 4: Postpone (Blocked) */}
              <div className="panel p-5 bg-card border-destructive/30 flex flex-col justify-between opacity-80 hover:opacity-100 transition-opacity">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
                        <Lock className="size-4" />
                      </div>
                      <h4 className="font-bold text-xs text-foreground">Postpone Milestone</h4>
                    </div>
                    <span className="rounded-full bg-destructive/20 border border-destructive/40 px-2 py-0.5 text-[9px] font-mono font-bold text-destructive">
                      Strictly Blocked
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Arbitrary milestone postponements are strictly prevented by governance rules. You may swap within the week or clarify if blocked.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/50">
                  <button
                    onClick={() => setPostponeModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                  >
                    <Ban className="size-3.5" />
                    <span>View Policy Details</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Clarification Q&A Thread */}
            <div className="panel p-6 bg-card border-border space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h4 className="font-display font-bold text-xs text-foreground flex items-center gap-2">
                  <MessageSquare className="size-4 text-amber-400" />
                  <span>Clarification Questions & Answers ({(task?.clarifications || []).length})</span>
                </h4>
                <button
                  onClick={() => setClarificationModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  <span>+ Ask New Question</span>
                </button>
              </div>

              {(!task?.clarifications || task.clarifications.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No clarification requests have been raised for this task.
                </div>
              ) : (
                <div className="space-y-3">
                  {task.clarifications.map((item, idx) => (
                    <div key={item._id || idx} className="rounded-2xl border border-border bg-elevated/50 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span className="p-1 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] font-mono shrink-0">
                            Q
                          </span>
                          <p className="text-xs font-semibold text-foreground leading-relaxed">
                            {item.question}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {item.created_at ? format(new Date(item.created_at), "MMM d, h:mm a") : ""}
                        </span>
                      </div>

                      {item.answer ? (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-2.5">
                          <span className="p-1 rounded-md bg-primary/20 text-primary font-bold text-[10px] font-mono shrink-0">
                            A
                          </span>
                          <div className="space-y-1 text-xs">
                            <p className="text-foreground leading-relaxed font-medium">
                              {item.answer}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                              <span>Answered by {typeof item.answered_by === "object" ? (item.answered_by as any)?.full_name || "Lead" : (item.answered_by || "Product Lead / AI")}</span>
                              {item.answered_at && <span>• {format(new Date(item.answered_at), "MMM d, h:mm a")}</span>}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-center justify-between text-xs text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <Clock className="size-3.5 animate-spin" />
                            <span>Awaiting response from Product Lead / Lead Architect</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded-full">
                            Clock Paused
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action History Log */}
            <div className="panel p-6 bg-card border-border space-y-4">
              <h4 className="font-display font-bold text-xs text-foreground flex items-center gap-2 pb-3 border-b border-border">
                <Clock className="size-4 text-muted-foreground" />
                <span>Action Mode Audit Trail ({actionHistory.length})</span>
              </h4>

              {actionHistory.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No action requests recorded yet for this task.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {actionHistory.map((act) => {
                    const statusMeta = ACTION_STATUS_STYLES[act.status] || {
                      label: act.status,
                      badge: "border-border bg-secondary text-muted-foreground",
                      icon: "•",
                    };
                    const typeMeta = ACTION_TYPE_LABELS[act.action_type] || {
                      label: act.action_type,
                      icon: "⚡",
                      desc: "",
                    };

                    return (
                      <div
                        key={act.id || act._id}
                        className="rounded-2xl border border-border/80 bg-elevated/40 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground flex items-center gap-1">
                              <span>{typeMeta.icon}</span>
                              <span>{typeMeta.label}</span>
                            </span>
                            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold", statusMeta.badge)}>
                              <span>{statusMeta.icon}</span>
                              <span>{statusMeta.label}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {act.decision_reasoning || act.clarification_question}
                          </p>
                        </div>

                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {act.created_at ? format(new Date(act.created_at), "MMM d, h:mm a") : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* REORDER MODAL                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {reorderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <ArrowUpDown className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Reorder Priority</h3>
                  <p className="text-xs text-muted-foreground">Adjust execution sequence position</p>
                </div>
              </div>
              <button onClick={() => setReorderModalOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleReorderSubmit} className="space-y-4">
              <div>
                <label className="text-eyebrow mb-1.5 block">New Order Position (Index)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newPosition}
                  onChange={(e) => setNewPosition(parseInt(e.target.value, 10) || 0)}
                  required
                  className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Current position: #{task?.order_index ?? 0}. If this task has prerequisite dependencies, it cannot be positioned before them.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setReorderModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReorder}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer shadow-glow"
                >
                  {submittingReorder ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  <span>Save Reorder</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SWAP WITHIN WEEK MODAL                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {swapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <CalendarSync className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Swap Within Current Week</h3>
                  <p className="text-xs text-muted-foreground">Adjust due date under 40-hour weekly cap</p>
                </div>
              </div>
              <button onClick={() => setSwapModalOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSwapSubmit} className="space-y-4">
              <div>
                <label className="text-eyebrow mb-1.5 block">Select Target Date (Within Current Week)</label>
                <input
                  type="date"
                  min={currentWeekStart}
                  max={currentWeekEnd}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <div className="panel p-3 bg-elevated/70 border-border/80 text-[11px] text-muted-foreground mt-2 space-y-1">
                  <p className="font-bold text-foreground">Week Window: {currentWeekStart} to {currentWeekEnd}</p>
                  <p>Changes are auto-approved if your total weekly workload stays under 40 hours.</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSwapModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSwap}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-400 disabled:opacity-50 cursor-pointer shadow-glow"
                >
                  {submittingSwap ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  <span>Confirm Swap</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* REQUEST CLARIFICATION MODAL                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {clarificationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <MessageSquare className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Request Clarification</h3>
                  <p className="text-xs text-muted-foreground">Pauses slippage clock while waiting for answer</p>
                </div>
              </div>
              <button onClick={() => setClarificationModalOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleClarificationSubmit} className="space-y-4">
              <div>
                <label className="text-eyebrow mb-1.5 block">What do you need clarified?</label>
                <textarea
                  rows={4}
                  value={clarificationQuestion}
                  onChange={(e) => setClarificationQuestion(e.target.value)}
                  placeholder="e.g. Missing API contract specification, ambiguity in Figma spacing rules, or undefined error handling behavior..."
                  required
                  className="w-full rounded-xl border border-input bg-elevated p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
                <div className="panel p-3 bg-amber-500/10 border-amber-500/30 text-[11px] text-amber-300 mt-2 space-y-0.5">
                  <p className="font-bold flex items-center gap-1">
                    <Sparkles className="size-3 text-amber-400" /> Instant PRD Scan
                  </p>
                  <p>Our AI will first scan project requirements to attempt an immediate answer. If missing, this task's 3-day slippage timer is frozen and your Lead is notified.</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setClarificationModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingClarification}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50 cursor-pointer shadow-glow"
                >
                  {submittingClarification ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  <span>Submit Question</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* INSTANT AI ANSWER MODAL                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {autoAnswerResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-primary/40 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/20 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Instant Answer Found</h3>
                  <p className="text-xs text-muted-foreground">Answered automatically from project specifications</p>
                </div>
              </div>
              <button onClick={() => setAutoAnswerResult(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="panel p-3 bg-elevated border-border/80">
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Your Question:</p>
                <p className="font-medium text-foreground">{autoAnswerResult.question}</p>
              </div>

              <div className="panel p-4 bg-primary/10 border-primary/30 space-y-1.5">
                <p className="text-[10px] uppercase font-bold text-primary flex items-center gap-1">
                  <Sparkles className="size-3.5" /> AI Resolved Specification:
                </p>
                <p className="text-foreground leading-relaxed font-semibold">
                  {autoAnswerResult.answer}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setAutoAnswerResult(null)}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-glow"
              >
                Got It, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* POSTPONE BLOCKED GOVERNANCE NOTICE MODAL                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {postponeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-destructive/20 text-destructive">
                  <Ban className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Postponement Blocked</h3>
                  <p className="text-xs text-muted-foreground">Governance policy strictly enforced</p>
                </div>
              </div>
              <button onClick={() => setPostponeModalOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <div className="panel p-4 bg-destructive/10 border-destructive/30 space-y-2 text-xs leading-relaxed">
              <p className="font-bold text-destructive">
                Why is postponing tasks blocked?
              </p>
              <p className="text-foreground/90">
                In Autonomous PM, milestone dates cannot be arbitrarily deferred because dependent teammates and deliverables rely on this milestone.
              </p>
              <p className="text-foreground/90">
                To keep work moving forward, you have two approved autonomous actions:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                <li><strong className="text-foreground">Swap Within Week:</strong> Move this task to another day in the current work week (under 40h cap).</li>
                <li><strong className="text-foreground">Request Clarification:</strong> If blocked by specifications, ask a question to immediately freeze the 3-day slippage clock.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setPostponeModalOpen(false);
                  setClarificationModalOpen(true);
                }}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                Ask Clarification
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostponeModalOpen(false);
                  setSwapModalOpen(true);
                }}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-glow"
              >
                Swap Within Week
              </button>
            </div>
          </div>
        </div>
      )}

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

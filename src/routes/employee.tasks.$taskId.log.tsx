import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Send, ToggleLeft, ToggleRight, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import { getTaskById, submitDailyLog, getDailyLog } from "@/lib/db";
import type { Task, DailyLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/employee/tasks/$taskId/log")({
  component: DailyLogPage,
});

function DailyLogPage() {
  const { taskId } = Route.useParams();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
  const [didWork, setDidWork] = useState(true);
  const [workText, setWorkText] = useState("");
  const [noWorkReason, setNoWorkReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!userProfile) return;
    const load = async () => {
      const [t, log] = await Promise.all([
        getTaskById(taskId),
        getDailyLog(taskId, userProfile.id, today),
      ]);
      setTask(t);
      setExistingLog(log);
      if (log) {
        setDidWork(log.has_worked);
        setWorkText(log.work_text);
        setNoWorkReason(log.no_work_reason);
      }
      setLoading(false);
    };
    load();
  }, [taskId, userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (didWork && !workText.trim()) { toast.error("Please describe what you worked on."); return; }
    if (!didWork && !noWorkReason.trim()) { toast.error("Please provide a reason for not working today."); return; }

    setSubmitting(true);
    try {
      await submitDailyLog({
        task_id: taskId,
        user_id: userProfile.id,
        log_date: today,
        work_text: didWork ? workText.trim() : "",
        has_worked: didWork,
        no_work_reason: !didWork ? noWorkReason.trim() : "",
      });
      setSubmitted(true);
      toast.success(existingLog ? "Log updated!" : "Daily log submitted! ✓");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit log");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Daily Log" eyebrow="Submit Today's Work">
        <div className="flex items-center justify-center h-64"><Loader2 className="size-8 animate-spin text-primary" /></div>
      </AppShell>
    );
  }

  if (submitted) {
    return (
      <AppShell title="Log Submitted" eyebrow="Daily Work Log">
        <div className="max-w-lg mx-auto panel p-10 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-success/15 mx-auto mb-4">
            <CheckCircle2 className="size-8 text-success" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            {existingLog ? "Log Updated!" : "Log Submitted!"}
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            Your work log for <span className="font-medium text-foreground">{format(new Date(), "MMMM d, yyyy")}</span> has been saved.
          </p>
          <div className="panel p-4 text-left mb-6">
            <p className="text-eyebrow text-[10px] mb-1">{task?.title}</p>
            {didWork ? (
              <p className="text-sm text-foreground">{workText}</p>
            ) : (
              <p className="text-sm text-warning">{noWorkReason}</p>
            )}
          </div>
          <Link
            to="/employee/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow={task?.title ?? "Task"}
      title="Daily Work Log"
    >
      <div className="max-w-lg mx-auto">
        <Link to="/employee/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="size-4" /> Back to Dashboard
        </Link>

        {/* Date Header */}
        <div className="panel p-5 mb-4 flex items-center justify-between">
          <div>
            <p className="text-eyebrow text-[10px]">Logging for</p>
            <p className="font-display text-lg font-bold text-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          {existingLog && (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning font-medium">Updating existing log</span>
          )}
        </div>

        <div className="panel p-5">
          <p className="text-sm font-semibold text-muted-foreground mb-1">Task:</p>
          <p className="font-semibold text-foreground mb-5">{task?.title}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Did you work toggle */}
            <div>
              <label className="text-eyebrow mb-2 block">Did you work today?</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDidWork(true)}
                  className={cn("flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all",
                    didWork ? "border-success bg-success/15 text-success" : "border-border bg-elevated text-muted-foreground hover:border-success/40")}
                >
                  ✅ Yes, I worked
                </button>
                <button
                  type="button"
                  onClick={() => setDidWork(false)}
                  className={cn("flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all",
                    !didWork ? "border-warning bg-warning/15 text-warning" : "border-border bg-elevated text-muted-foreground hover:border-warning/40")}
                >
                  ⚠️ No work done
                </button>
              </div>
            </div>

            {/* Work text or no-work reason */}
            {didWork ? (
              <div>
                <label className="text-eyebrow mb-1.5 block">What did you work on today?</label>
                <textarea
                  value={workText}
                  onChange={(e) => setWorkText(e.target.value)}
                  placeholder="Describe the tasks you completed, progress made, blockers resolved…"
                  rows={5}
                  required
                  className="w-full resize-none rounded-xl border border-input bg-elevated px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all leading-relaxed"
                />
                <p className="text-xs text-muted-foreground mt-1">{workText.length} characters</p>
              </div>
            ) : (
              <div>
                <label className="text-eyebrow mb-1.5 block">Reason for not working today</label>
                <textarea
                  value={noWorkReason}
                  onChange={(e) => setNoWorkReason(e.target.value)}
                  placeholder="e.g. Sick leave, Public holiday, Waiting for client feedback, Blocked by dependency…"
                  rows={4}
                  required
                  className="w-full resize-none rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-warning focus:ring-1 focus:ring-warning transition-all leading-relaxed"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-60 transition-all"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? "Submitting…" : existingLog ? "Update Log" : "Submit Daily Log"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

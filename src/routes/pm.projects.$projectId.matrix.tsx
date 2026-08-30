import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { eachDayOfInterval, format, parseISO, isToday, isPast, isFuture } from "date-fns";
import { Loader2, ArrowLeft, Plus, Calendar, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getProjectById, getTasksByProject, getAllEmployees, getLogsByProject } from "@/lib/db";
import type { Project, Task, UserProfile, DailyLog } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/projects/$projectId/matrix")({
  component: CalendarMatrixPage,
});

type CellStatus = "logged" | "no-work" | "pending" | "future" | "out-of-range";

interface MatrixRow {
  employee: UserProfile;
  task: Task;
  days: Array<{ date: string; status: CellStatus; log: DailyLog | null }>;
}

function CalendarMatrixPage() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [allDays, setAllDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<{ log: DailyLog; empName: string; taskTitle: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [proj, tasks, emps, logs] = await Promise.all([
        getProjectById(projectId),
        getTasksByProject(projectId),
        getAllEmployees(),
        getLogsByProject(projectId),
      ]);
      setProject(proj);

      if (!proj || tasks.length === 0) {
        setLoading(false);
        return;
      }

      // Find global date range across all tasks
      const allStartDates = tasks.map((t) => parseISO(t.start_date));
      const allEndDates = tasks.map((t) => parseISO(t.end_date));
      const globalStart = new Date(Math.min(...allStartDates.map((d) => d.getTime())));
      const globalEnd = new Date(
        Math.min(Math.max(...allEndDates.map((d) => d.getTime())), new Date().getTime() + 7 * 86400000)
      );

      const days = eachDayOfInterval({ start: globalStart, end: globalEnd }).map((d) => format(d, "yyyy-MM-dd"));
      setAllDays(days);

      const logMap = new Map<string, DailyLog>();
      logs.forEach((l) => logMap.set(`${l.task_id}::${l.user_id}::${l.log_date}`, l));

      const matrixRows: MatrixRow[] = [];
      for (const task of tasks) {
        const assignees = emps.filter((e) => (task.assignee_ids || []).includes(e.id));
        for (const emp of assignees) {
          const taskStart = parseISO(task.start_date);
          const taskEnd = parseISO(task.end_date);
          const dayData = days.map((dateStr) => {
            const d = parseISO(dateStr);
            if (d < taskStart || d > taskEnd) {
              return { date: dateStr, status: "out-of-range" as CellStatus, log: null };
            }
            const log = logMap.get(`${task.id}::${emp.id}::${dateStr}`) ?? null;
            if (log) {
              return { date: dateStr, status: log.has_worked ? "logged" : "no-work", log };
            }
            if (isFuture(d) && !isToday(d)) return { date: dateStr, status: "future" as CellStatus, log: null };
            return { date: dateStr, status: "pending" as CellStatus, log: null };
          });
          matrixRows.push({ employee: emp, task, days: dayData });
        }
      }
      setRows(matrixRows);
      setLoading(false);
    };
    load();
  }, [projectId]);

  return (
    <AppShell
      eyebrow={`Visual Tracking Grid · ${project?.title ?? "Project"}`}
      title="Interactive Calendar Matrix"
      actions={
        <Link
          to="/pm/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary/50 transition-colors cursor-pointer shadow-xs"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Project</span>
        </Link>
      }
    >
      {/* Explanation Banner */}
      <div className="panel p-4 mb-6 border-l-4 border-l-primary bg-gradient-to-r from-primary/10 via-card to-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Calendar className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-display font-bold text-sm text-foreground">
              Core Daily Progress Heatmap Matrix
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click on any <strong>Green (✓)</strong> or <strong>Amber (!)</strong> cell to read the employee's raw submission notes, commits, or blocker reasons for that date.
            </p>
          </div>
        </div>

        {/* Legend Indicators */}
        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
          <LegendItem color="bg-success/25 border border-success/40 text-success" icon="✓" label="Work Logged" />
          <LegendItem color="bg-warning/25 border border-warning/40 text-warning" icon="!" label="No Work / Blocker" />
          <LegendItem color="bg-muted/30 border border-dashed border-border text-muted-foreground" icon="○" label="Pending / Missed" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-12 text-center max-w-lg mx-auto">
          <Calendar className="size-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-display font-bold text-base text-foreground">No Scheduled Tasks with Assignees</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
            The Calendar Matrix tracks daily updates between the scheduled Start and End dates of tasks. To populate the grid, create tasks and assign developers to them.
          </p>
          <Link
            to="/pm/projects/$projectId"
            params={{ projectId }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-all cursor-pointer"
          >
            <Plus className="size-4" /> Add Tasks to Project
          </Link>
        </div>
      ) : (
        <div className="panel overflow-x-auto shadow-sm">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="py-3.5 pr-4 pl-4 text-eyebrow text-[10px] font-semibold sticky left-0 bg-card z-10 min-w-[200px] border-r border-border/60">
                  Employee & Task
                </th>
                {allDays.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "py-2 px-1 text-center text-eyebrow text-[10px] font-normal min-w-[46px]",
                      isToday(parseISO(d)) && "text-primary font-bold bg-primary/10 rounded-t"
                    )}
                  >
                    <div className="font-mono text-xs">{format(parseISO(d), "d")}</div>
                    <div className="text-[9px] uppercase">{format(parseISO(d), "EEE")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 last:border-b-0 hover:bg-elevated/20 transition-colors">
                  <td className="py-3 pr-4 pl-4 sticky left-0 bg-card z-10 border-r border-border/60">
                    <p className="text-xs font-bold text-foreground truncate max-w-[180px]">{row.employee.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[180px] mt-0.5">{row.task.title}</p>
                  </td>
                  {row.days.map(({ date, status, log }, j) => (
                    <td key={j} className={cn("py-2 px-1 text-center", isToday(parseISO(date)) && "bg-primary/5")}>
                      {status === "out-of-range" || status === "future" ? (
                        <span className="flex size-7 mx-auto items-center justify-center rounded-lg bg-muted/15 text-[10px] text-muted-foreground/30 font-mono">
                          ·
                        </span>
                      ) : (
                        <button
                          className={cn(
                            "flex size-7 mx-auto items-center justify-center rounded-lg text-xs font-bold transition-all hover:scale-115 cursor-pointer shadow-xs",
                            status === "logged"
                              ? "bg-success/20 text-success border border-success/40 hover:bg-success/30"
                              : status === "no-work"
                              ? "bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30 animate-pulse"
                              : "bg-muted/30 text-muted-foreground/40 border border-dashed border-border hover:border-foreground/40"
                          )}
                          title={
                            status === "logged"
                              ? `Logged by ${row.employee.full_name}: Click to view`
                              : status === "no-work"
                              ? `Blocker logged by ${row.employee.full_name}: Click to view`
                              : "No submission recorded yet"
                          }
                          onClick={() => {
                            if (log) {
                              setSelectedLog({
                                log,
                                empName: row.employee.full_name,
                                taskTitle: row.task.title,
                              });
                            }
                          }}
                        >
                          {status === "logged" ? "✓" : status === "no-work" ? "!" : "○"}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Detail Modal / Viewer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                {selectedLog.log.has_worked ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <AlertTriangle className="size-5 text-warning" />
                )}
                <div>
                  <h3 className="font-display font-bold text-sm text-foreground">
                    {selectedLog.log.has_worked ? "Daily Work Submission" : "No Work / Blocker Record"}
                  </h3>
                  <p className="text-eyebrow text-[9px] text-muted-foreground">
                    {format(parseISO(selectedLog.log.log_date), "EEEE, MMMM d, yyyy")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Employee: <strong className="text-foreground">{selectedLog.empName}</strong></span>
                <span className="font-mono text-[10px] uppercase font-bold text-primary">{selectedLog.taskTitle}</span>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-elevated/50 text-xs leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                {selectedLog.log.has_worked
                  ? selectedLog.log.work_text
                  : `Blocker Reason: ${selectedLog.log.no_work_reason}`}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function LegendItem({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("flex size-4 items-center justify-center rounded text-[10px] font-bold font-mono", color)}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

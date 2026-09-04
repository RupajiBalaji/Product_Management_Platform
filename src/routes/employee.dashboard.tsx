import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Briefcase,
  Layers,
  CalendarDays,
  PlusCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Flame,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import { getEmployeeProjects, getMyTasks, getDailyLog, getLogsByEmployee } from "@/lib/db";
import type { Task, Project, DailyLog } from "@/lib/types";
import { PRIORITY_STYLES, PRIORITY_WEIGHT, normalizePriority, isElevatedPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/dashboard")({
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const { userProfile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [todayLogged, setTodayLogged] = useState<Record<string, boolean>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [onlyHighPriority, setOnlyHighPriority] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadData = async () => {
    setLoading(true);
    try {
      const [projs, tsks, userLogs] = await Promise.all([
        getEmployeeProjects(),
        getMyTasks(),
        userProfile ? getLogsByEmployee(userProfile.id) : Promise.resolve([]),
      ]);

      // Sort projects with P1 / P2 priority first
      const sortedProjs = [...projs].sort(
        (a, b) => (PRIORITY_WEIGHT[normalizePriority(b.priority)] || 0) - (PRIORITY_WEIGHT[normalizePriority(a.priority)] || 0)
      );

      setProjects(sortedProjs);
      setTasks(tsks);
      setLogs(userLogs);

      // Check today's submission for each task
      const logCheck: Record<string, boolean> = {};
      await Promise.all(
        tsks.map(async (t) => {
          if (userProfile) {
            const log = await getDailyLog(t.id, userProfile.id, today);
            logCheck[t.id] = !!log;
          }
        })
      );
      setTodayLogged(logCheck);
    } catch (err) {
      console.error("Error loading employee data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userProfile]);

  // Find project map for quick lookups
  const projectMap = new Map(projects.map((p) => [String(p.id), p]));

  // Filter tasks based on project and high priority filter
  const filteredTasks = tasks
    .filter((t) => {
      if (selectedProjectId !== "all" && String(t.project_id) !== String(selectedProjectId)) return false;
      if (onlyHighPriority) {
        const proj = projectMap.get(String(t.project_id));
        return isElevatedPriority(normalizePriority(proj?.priority));
      }
      return true;
    })
    .sort((a, b) => {
      const projA = projectMap.get(String(a.project_id));
      const projB = projectMap.get(String(b.project_id));
      const isHighA = isElevatedPriority(normalizePriority(projA?.priority)) ? 1 : 0;
      const isHighB = isElevatedPriority(normalizePriority(projB?.priority)) ? 1 : 0;
      return isHighB - isHighA; // High priority tasks first
    });

  const pendingTasks = tasks.filter((t) => !todayLogged[t.id]);
  const completedTodayCount = tasks.length - pendingTasks.length;

  const workedLogs = logs.filter((l) => l.has_worked);
  const consistencyScore = logs.length > 0 ? Math.round((workedLogs.length / logs.length) * 100) : 100;

  // Check if developer has any high priority project
  const highPriorityProjects = projects.filter((p) => isElevatedPriority(normalizePriority(p.priority)));

  return (
    <AppShell
      eyebrow={`Developer Workspace · ${format(new Date(), "EEEE, MMMM d")}`}
      title={`Welcome back, ${userProfile?.full_name?.split(" ")[0] || "Developer"}`}
      actions={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <TrendingUp className="size-3.5" /> {consistencyScore}% Consistency
          </span>
        </div>
      }
    >
      {/* High Priority Focus Guidance Banner (For Multi-Project Developers) */}
      {highPriorityProjects.length > 0 && (
        <div className="panel p-5 mb-6 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 animate-pulse">
              <Flame className="size-5.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display font-bold text-foreground text-sm">
                  Priority Focus: {highPriorityProjects[0].title}
                </p>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-amber-300 uppercase">
                  {highPriorityProjects[0].priority.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                You are allocated to <strong>{projects.length} projects</strong>. The Project Manager has marked{" "}
                <strong>"{highPriorityProjects[0].title}"</strong> as high priority — please focus on its deliverables first today!
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedProjectId(highPriorityProjects[0].id);
              setOnlyHighPriority(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 text-black px-3.5 py-2 text-xs font-bold hover:bg-amber-400 transition-colors shrink-0 cursor-pointer shadow-xs"
          >
            <span>Focus on High Priority</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Assigned Projects" value={projects.length} icon={Layers} tone="primary" subtitle="Multi-project active" />
        <MetricCard label="Active Tasks" value={tasks.length} icon={Briefcase} tone="muted" subtitle="Assigned to you" />
        <MetricCard label="Today's Submissions" value={completedTodayCount} icon={CheckCircle2} tone="success" subtitle="Work logs filed" />
        <MetricCard label="Pending Today" value={pendingTasks.length} icon={AlertTriangle} tone={pendingTasks.length > 0 ? "warning" : "success"} subtitle="Needs submission" />
      </div>

      {/* Today's Action Banner */}
      {tasks.length > 0 && (
        <div
          className={cn(
            "panel p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4",
            pendingTasks.length === 0 ? "border-l-success bg-success/5" : "border-l-warning bg-warning/5"
          )}
        >
          <div className="flex items-center gap-3">
            {pendingTasks.length === 0 ? (
              <CheckCircle2 className="size-6 text-success shrink-0" />
            ) : (
              <AlertTriangle className="size-6 text-warning shrink-0" />
            )}
            <div>
              <p className="font-display font-bold text-foreground text-sm">
                {pendingTasks.length === 0
                  ? "🎉 All daily logs submitted for today!"
                  : `⚠️ Action Required: ${pendingTasks.length} task${pendingTasks.length > 1 ? "s" : ""} pending today's log`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pendingTasks.length === 0
                  ? "Your daily progress is logged and visible to your Project Manager."
                  : "Submit your work done or record a blocker before the end of the day."}
              </p>
            </div>
          </div>

          {pendingTasks.length > 0 && (
            <Link
              to="/employee/tasks/$taskId/log"
              params={{ taskId: pendingTasks[0].id }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-all shrink-0 cursor-pointer"
            >
              <PlusCircle className="size-3.5" /> Log Next Task
            </Link>
          )}
        </div>
      )}

      {/* Assigned Projects Workspaces */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">My Assigned Projects</h2>
            <p className="text-eyebrow text-[10px]">Projects you are allocated to</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground font-mono">
            {projects.length} Active Project{projects.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel h-36 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="panel p-8 text-center text-muted-foreground">
            <Layers className="size-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="font-semibold text-foreground">No projects assigned yet</p>
            <p className="text-xs mt-1">Your Project Manager will allocate you to project teams.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((proj) => {
              const projTasks = tasks.filter((t) => String(t.project_id) === String(proj.id));
              const priority = normalizePriority(proj.priority);
              const isHigh = isElevatedPriority(priority);
              const prioMeta = PRIORITY_STYLES[priority];

              return (
                <div
                  key={proj.id}
                  className={cn(
                    "panel p-5 flex flex-col justify-between hover:border-primary/40 transition-all group relative",
                    isHigh && "border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-card to-card"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {proj.title}
                      </h3>
                      <span className="rounded-full border border-border bg-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
                        {proj.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                          prioMeta.badge
                        )}
                      >
                        <span>{prioMeta.icon}</span>
                        <span>{prioMeta.label}</span>
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                      {proj.description || "No description provided."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {projTasks.length} task{projTasks.length !== 1 ? "s" : ""}
                    </span>
                    <Link
                      to="/pm/projects/$projectId/matrix"
                      params={{ projectId: proj.id }}
                      className="text-primary hover:underline flex items-center gap-1 font-semibold text-[11px]"
                    >
                      Calendar Matrix <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filterable Tasks Stream with Priority Flagging */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">My Tasks & Daily Work Logging</h2>
            <p className="text-eyebrow text-[10px]">High priority tasks are elevated for immediate focus</p>
          </div>

          {/* Project & Priority Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            {highPriorityProjects.length > 0 && (
              <button
                onClick={() => {
                  setOnlyHighPriority(!onlyHighPriority);
                  setSelectedProjectId("all");
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                  onlyHighPriority
                    ? "bg-amber-500 text-black shadow-xs"
                    : "border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                )}
              >
                <Flame className="size-3" /> High Priority Only
              </button>
            )}

            <button
              onClick={() => {
                setSelectedProjectId("all");
                setOnlyHighPriority(false);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                selectedProjectId === "all" && !onlyHighPriority
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              All Projects
            </button>

            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProjectId(p.id);
                  setOnlyHighPriority(false);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer",
                  selectedProjectId === p.id && !onlyHighPriority
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {(isElevatedPriority(normalizePriority(p.priority))) && "🔥 "}
                {p.title.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="panel h-32 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="panel p-10 text-center text-muted-foreground">
            <Clock className="size-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="font-semibold text-foreground">No tasks matching current filter</p>
            <p className="text-xs mt-1">Select another project filter or view all projects.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredTasks.map((task) => {
              const daysLeft = differenceInDays(parseISO(task.end_date), new Date());
              const logged = todayLogged[task.id];
              const proj = projectMap.get(String(task.project_id));
              const isHighPrio = isElevatedPriority(normalizePriority(proj?.priority));

              return (
                <div
                  key={task.id}
                  className={cn(
                    "panel p-5 flex flex-col justify-between border-l-4 transition-all relative",
                    logged ? "border-l-success" : "border-l-warning",
                    isHighPrio && !logged && "border-amber-500/50 bg-gradient-to-r from-amber-500/5 to-transparent"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        {proj && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-eyebrow text-[9px] text-primary truncate">
                              {proj.title}
                            </span>
                            {isHighPrio && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[8px] font-bold text-amber-300">
                                <Flame className="size-2.5" /> High Priority Focus
                              </span>
                            )}
                          </div>
                        )}
                        <h3 className="font-display font-bold text-foreground text-sm truncate">{task.title}</h3>
                      </div>

                      {logged ? (
                        <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success shrink-0">
                          <CheckCircle2 className="size-3" /> Logged
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning shrink-0">
                          <Clock className="size-3" /> Due Today
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {task.description || "No description provided."}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                      <CalendarDays className="size-3" />
                      <span>{format(parseISO(task.end_date), "MMM d")}</span>
                      <span
                        className={cn(
                          daysLeft <= 1 ? "text-destructive font-semibold" : daysLeft <= 3 ? "text-warning font-semibold" : "text-muted-foreground"
                        )}
                      >
                        ({daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Due today" : `${Math.abs(daysLeft)}d overdue`})
                      </span>
                    </div>

                    <Link
                      to="/employee/tasks/$taskId/log"
                      params={{ taskId: task.id }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer",
                        logged
                          ? "border border-success/30 bg-success/10 text-success hover:bg-success/20"
                          : isHighPrio
                          ? "bg-amber-500 text-black hover:bg-amber-400 font-extrabold shadow-sm"
                          : "bg-primary text-primary-foreground shadow-glow hover:bg-primary/90"
                      )}
                    >
                      {logged ? "✓ Edit Log" : isHighPrio ? "🔥 Log Priority Task" : "📝 Log Work"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  subtitle,
}: {
  label: string;
  value: number;
  icon: any;
  tone: string;
  subtitle: string;
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    muted: "text-muted-foreground",
  };
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-eyebrow text-[10px]">{label}</p>
        <Icon className={cn("size-4", toneMap[tone])} />
      </div>
      <p className={cn("font-display text-3xl font-bold tabular-nums", toneMap[tone])}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

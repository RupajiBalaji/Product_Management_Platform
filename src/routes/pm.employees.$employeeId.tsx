import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  User,
  Briefcase,
  History,
  AlertCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  Activity,
  Flame,
  FileText,
  Clock,
  ShieldAlert,
  DollarSign,
  Lock,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import {
  getUserProfile,
  getLogsByEmployee,
  getEmployeeProjects,
  getTasksByEmployee,
  updateUserCostRate,
  getEmployeeGrowthTrajectory,
} from "@/lib/db";
import { generateAISummary } from "@/lib/gemini";
import type {
  UserProfile,
  Project,
  Task,
  DailyLog,
  GrowthTrajectoryResponse,
  PerformanceSnapshot,
  TrendResult,
} from "@/lib/types";
import { normalizePriority, PRIORITY_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/pm/employees/$employeeId")({
  component: EmployeeAnalyticsPage,
});

function EmployeeAnalyticsPage() {
  const { employeeId } = Route.useParams();
  const { userProfile } = useAuth();
  const isProductLead =
    userProfile?.user_type === "product_lead" || userProfile?.user_type === "pm";

  const [emp, setEmp] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "projects" | "history" | "leave" | "ai" | "trajectory"
  >("projects");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");

  const [costRateInput, setCostRateInput] = useState<string>("");
  const [savingCostRate, setSavingCostRate] = useState(false);

  const [trajectoryData, setTrajectoryData] = useState<GrowthTrajectoryResponse | null>(null);
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [profile, projs, tsks, lgLogs, traj] = await Promise.all([
        getUserProfile(employeeId),
        getEmployeeProjects(employeeId),
        getTasksByEmployee(employeeId),
        getLogsByEmployee(employeeId),
        getEmployeeGrowthTrajectory(employeeId).catch(() => null),
      ]);
      setEmp(profile);
      if (profile && profile.hourly_cost_rate !== undefined) {
        setCostRateInput(String(profile.hourly_cost_rate));
      }
      setProjects(projs);
      setTasks(tsks);
      setLogs(lgLogs);
      if (traj && traj.success) {
        setTrajectoryData(traj);
      }
      setLoading(false);
    };
    load();
  }, [employeeId]);

  const handleSaveCostRate = async () => {
    const rateNum = Number(costRateInput);
    if (isNaN(rateNum) || rateNum < 0) {
      toast.error("Please enter a valid non-negative hourly cost rate");
      return;
    }
    setSavingCostRate(true);
    try {
      const res = await updateUserCostRate(employeeId, rateNum);
      if (res.success) {
        setEmp((prev) => (prev ? { ...prev, hourly_cost_rate: rateNum } : null));
        toast.success(`Updated hourly cost rate to $${rateNum}/hr (Confidential audit recorded).`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update cost rate");
    } finally {
      setSavingCostRate(false);
    }
  };

  const workedLogs = logs.filter((l) => l.has_worked);
  const noWorkLogs = logs.filter((l) => !l.has_worked);
  const consistencyScore = logs.length > 0 ? Math.round((workedLogs.length / logs.length) * 100) : 100;

  const activeTasks = tasks.filter((t) => {
    const now = new Date();
    return new Date(t.end_date) >= now;
  });

  // Module 1: Workload Capacity Indicator
  const taskCount = activeTasks.length;
  let capacityStatus: { label: string; tone: string; description: string; pct: number } = {
    label: "Optimal / Single-Threaded",
    tone: "text-blue-400 border-blue-500/40 bg-blue-500/10",
    description: "Focusing on 1 core task deliverable",
    pct: 35,
  };
  if (taskCount === 0) {
    capacityStatus = {
      label: "Bench / Available",
      tone: "text-muted-foreground border-border bg-muted",
      description: "No active task assignments",
      pct: 0,
    };
  } else if (taskCount >= 2 && taskCount <= 3) {
    capacityStatus = {
      label: "Balanced Load (2–3 tasks)",
      tone: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
      description: "Healthy multi-task throughput",
      pct: 75,
    };
  } else if (taskCount > 3) {
    capacityStatus = {
      label: "Over-Allocated (>3 tasks)",
      tone: "text-red-400 border-red-500/40 bg-red-500/10",
      description: "High risk of context switching and delivery slippage",
      pct: 95,
    };
  }

  // Module 3: AI/Heuristic Leave & Blocker Categorization
  const categorizedBlockers = noWorkLogs.map((log) => {
    const reason = (log.no_work_reason || "").toLowerCase();
    let category: "External Blocker" | "Internal Dependency" | "Personal / Medical";
    if (reason.includes("fever") || reason.includes("sick") || reason.includes("leave") || reason.includes("personal") || reason.includes("vacation") || reason.includes("doctor")) {
      category = "Personal / Medical";
    } else if (reason.includes("api") || reason.includes("key") || reason.includes("client") || reason.includes("credential") || reason.includes("third-party") || reason.includes("vendor") || reason.includes("access")) {
      category = "External Blocker";
    } else {
      category = "Internal Dependency";
    }
    return { ...log, category };
  });

  const externalCount = categorizedBlockers.filter((b) => b.category === "External Blocker").length;
  const internalCount = categorizedBlockers.filter((b) => b.category === "Internal Dependency").length;
  const personalCount = categorizedBlockers.filter((b) => b.category === "Personal / Medical").length;

  const handleGenerateAI = async () => {
    if (!emp) return;
    setAiLoading(true);
    const logSummary = workedLogs
      .slice(0, 25)
      .map((l) => `[${l.log_date}] ${l.work_text}`)
      .join("\n");
    const blockers = noWorkLogs.map((l) => `[${l.log_date}] ${l.no_work_reason}`).join("\n");
    const prompt = `You are an executive project management intelligence engine. Generate a comprehensive 360° performance dossier for employee "${emp.full_name}" (${emp.role_title}).

Data:
- Total logs submitted: ${logs.length}
- Successful work completed days: ${workedLogs.length}
- Inactivity / No-work days: ${noWorkLogs.length}
- Submission Consistency Score: ${consistencyScore}%
- Active tasks: ${activeTasks.length}
- Workload status: ${capacityStatus.label} (${taskCount} active tasks)
- Allocated Projects: ${projects.map((p) => `${p.title} [Priority: ${normalizePriority(p.priority)}]`).join(", ")}

Recent work logs:
${logSummary || "No logs recorded"}

Recorded Inactivity/Blockers:
${blockers || "No blockers recorded"}

Provide a structured, executive-grade evaluation formatted in clear markdown sections:
1. 🌟 Core Technical Strengths & Key Milestone Deliveries
2. ⚡ Turnaround Speed & Task Execution Reliability
3. ⚠️ Impediment Analysis & Blocker Breakdown
4. 💡 Strategic PM Recommendation (Resource allocation, focus areas, risk mitigation)`;
    const result = await generateAISummary(prompt);
    setAiSummary(result);
    setAiLoading(false);
  };

  const handlePrintDossier = () => {
    window.print();
  };

  const filteredLogs = logs.filter((l) => {
    const matchesSearch = searchQuery
      ? l.work_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.no_work_reason.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesProject = selectedProjectFilter !== "all" ? String(l.project_id) === selectedProjectFilter : true;
    return matchesSearch && matchesProject;
  });

  if (loading) {
    return (
      <AppShell title="Employee Analytics" eyebrow="360° Analysis">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!emp) {
    return (
      <AppShell title="Not Found" eyebrow="Employee Analytics">
        <div className="panel p-10 text-center">
          <p className="text-muted-foreground">Employee not found.</p>
        </div>
      </AppShell>
    );
  }

  const tabs = [
    { id: "projects", label: "Projects & Tasks (Module 1)", icon: Briefcase },
    { id: "history", label: "Work History Stream (Module 2)", icon: History },
    { id: "leave", label: "Leave & Inactivity (Module 3)", icon: AlertCircle },
    { id: "ai", label: "AI Performance Profile (Module 4)", icon: Sparkles },
    { id: "trajectory", label: "Growth Trajectory (Module 5)", icon: TrendingUp },
  ] as const;

  return (
    <AppShell
      title={emp.full_name}
      eyebrow="Employee 360° Deep Analysis Portal"
      actions={
        <button
          onClick={handlePrintDossier}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-elevated transition-colors cursor-pointer"
        >
          <Printer className="size-3.5" />
          <span>Export 1-Page Dossier</span>
        </button>
      }
    >
      {/* Header Card */}
      <div className="panel p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 font-display text-xl font-bold text-primary">
            {emp.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-bold text-foreground">{emp.full_name}</h2>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-primary">
                {emp.role_title}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{emp.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <Stat
            label="Consistency Score"
            value={`${consistencyScore}%`}
            tone={consistencyScore >= 80 ? "success" : consistencyScore >= 60 ? "warning" : "danger"}
          />
          <Stat label="Total Submissions" value={String(logs.length)} />
          <Stat label="Active Tasks" value={String(activeTasks.length)} tone="primary" />
          <Stat label="Projects Assigned" value={String(projects.length)} />
        </div>
      </div>

      {/* Confidential Compensation Rate Editor (Product Lead Only) */}
      {isProductLead && (
        <div className="panel p-4 mb-6 border border-border bg-gradient-to-r from-surface to-surface-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <DollarSign className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  Hourly Resource Cost Rate
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Lock className="size-2.5" />
                  Confidential · Product Lead Only
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Baseline rate used to compute project budget burn and resource allocation expenditures
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                $
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={costRateInput}
                onChange={(e) => setCostRateInput(e.target.value)}
                placeholder="0"
                className="w-28 pl-7 pr-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-surface-elevated border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                /hr
              </span>
            </div>
            <button
              onClick={handleSaveCostRate}
              disabled={savingCostRate}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {savingCostRate ? "Saving..." : "Update Rate"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 panel p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <tab.icon className="size-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Module 1: Allocated Projects & Active Tasks Breakdown + Workload Capacity */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          {/* Workload Capacity Indicator */}
          <div className="panel p-5 border-l-4 border-l-primary bg-gradient-to-r from-primary/10 via-card to-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                <h3 className="font-display font-bold text-foreground text-sm">Workload Capacity Indicator</h3>
              </div>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold font-mono", capacityStatus.tone)}>
                {capacityStatus.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{capacityStatus.description}</p>
            <div className="w-full bg-muted rounded-full h-2 mt-3 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all rounded-full",
                  taskCount > 3 ? "bg-red-500" : taskCount >= 2 ? "bg-emerald-500" : "bg-primary"
                )}
                style={{ width: `${capacityStatus.pct}%` }}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-foreground text-sm">Allocated Projects ({projects.length})</h3>
                <span className="text-[11px] text-muted-foreground font-mono">Portfolio</span>
              </div>
              <div className="space-y-3">
                {projects.length === 0 ? (
                  <div className="panel p-8 text-center text-muted-foreground text-xs">No projects allocated</div>
                ) : (
                  projects.map((p) => (
                    <div key={p.id} className="panel p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-foreground text-sm">{p.title}</p>
                        <div className="flex items-center gap-1.5">
                          {(() => {
                            const prio = normalizePriority(p.priority);
                            const prioMeta = PRIORITY_STYLES[prio];
                            return (
                              <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold font-mono", prioMeta.badge)}>
                                {prioMeta.icon} {prio}
                              </span>
                            );
                          })()}
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                              p.status === "active"
                                ? "bg-success/15 text-success border-success/30"
                                : p.status === "in-review"
                                ? "bg-warning/15 text-warning border-warning/30"
                                : "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            {p.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {p.description || "No description provided."}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-foreground text-sm">Active Deliverables & Tasks ({activeTasks.length})</h3>
                <span className="text-[11px] text-muted-foreground font-mono">Scheduled Windows</span>
              </div>
              <div className="space-y-3">
                {activeTasks.length === 0 ? (
                  <div className="panel p-8 text-center text-muted-foreground text-xs">No active tasks assigned</div>
                ) : (
                  activeTasks.map((t) => {
                    const daysLeft = differenceInDays(parseISO(t.end_date), new Date());
                    return (
                      <div key={t.id} className="panel p-4 border-l-2 border-l-primary hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-foreground text-sm">{t.title}</p>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold px-2 py-0.5 rounded",
                              daysLeft <= 1 ? "bg-destructive/20 text-destructive" : daysLeft <= 3 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Due Today" : `${Math.abs(daysLeft)}d Overdue`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description || "No task description."}</p>
                        <p className="text-eyebrow text-[10px] mt-2 font-mono">
                          Window: {format(parseISO(t.start_date), "MMM d")} → {format(parseISO(t.end_date), "MMM d, yyyy")}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module 2: Complete Work History & Chronological Log Stream */}
      {activeTab === "history" && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display font-bold text-foreground text-sm">
                Chronological Work Feed ({filteredLogs.length} entries)
              </h3>
              <p className="text-eyebrow text-[10px]">Unedited record of raw updates, commits & progress notes</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search work notes or blockers…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-input bg-elevated text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary w-60"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="panel p-10 text-center text-muted-foreground text-xs">No matching logs found</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="panel p-4 flex gap-3.5 hover:border-primary/30 transition-colors">
                  {log.has_worked ? (
                    <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-5 text-warning shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-eyebrow text-[10px] font-mono">
                        {format(parseISO(log.log_date), "EEEE, MMMM d, yyyy")}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] font-mono font-bold uppercase px-2 py-0.2 rounded-full",
                          log.has_worked ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                        )}
                      >
                        {log.has_worked ? "🟢 Logged" : "⚠️ No Work"}
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed font-sans">
                      {log.has_worked ? (
                        log.work_text
                      ) : (
                        <span className="text-warning font-medium">Reason: {log.no_work_reason}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Module 3: Leave & Inactivity Track Record */}
      {activeTab === "leave" && (
        <div className="space-y-6">
          {/* Categorized Inactivity Breakdown Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="panel p-4 border-l-4 border-l-amber-500">
              <p className="text-eyebrow text-[10px]">External Blockers</p>
              <p className="font-display text-2xl font-bold text-amber-400 mt-1">{externalCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Client sandbox, missing API keys/creds</p>
            </div>
            <div className="panel p-4 border-l-4 border-l-blue-500">
              <p className="text-eyebrow text-[10px]">Internal Dependencies</p>
              <p className="font-display text-2xl font-bold text-blue-400 mt-1">{internalCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Waiting on PRs, UI assets, staging QA</p>
            </div>
            <div className="panel p-4 border-l-4 border-l-purple-500">
              <p className="text-eyebrow text-[10px]">Personal / Medical</p>
              <p className="font-display text-2xl font-bold text-purple-400 mt-1">{personalCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Sick leave, planned time-off</p>
            </div>
          </div>

          <div>
            <h3 className="font-display font-bold text-foreground text-sm mb-3">
              Impediment History & Reason Log ({noWorkLogs.length} recorded events)
            </h3>
            {noWorkLogs.length === 0 ? (
              <div className="panel p-10 text-center">
                <CheckCircle2 className="size-10 text-success mx-auto mb-2" />
                <p className="font-semibold text-foreground text-sm">Perfect Attendance & Zero Blockers!</p>
                <p className="text-xs text-muted-foreground mt-1">No inactivity days or impediments logged.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {categorizedBlockers.map((log) => (
                  <div
                    key={log.id}
                    className="panel p-4 border-l-4 border-l-warning flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="size-5 text-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="text-eyebrow text-[10px] font-mono mb-0.5">
                          {format(parseISO(log.log_date), "EEEE, MMMM d, yyyy")}
                        </p>
                        <p className="text-xs text-foreground font-medium">{log.no_work_reason}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-elevated px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0 self-start sm:self-auto">
                      {log.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module 4: Employee Performance Profile & AI Diagnostic Summary */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-foreground text-sm">
                AI Performance Profile & Diagnostic Dossier
              </h3>
              <p className="text-eyebrow text-[10px]">Automated synthesis powered by Gemini 3.5 Flash-Lite</p>
            </div>
            <button
              onClick={handleGenerateAI}
              disabled={aiLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer shrink-0"
            >
              {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {aiLoading ? "Synthesizing Dossier…" : "✨ Synthesize AI Dossier"}
            </button>
          </div>

          {aiSummary ? (
            <div className="panel p-6 border-l-4 border-l-primary bg-gradient-to-b from-primary/5 via-card to-card">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex size-7 items-center justify-center rounded-xl bg-primary/20 font-bold text-primary text-xs">
                  AI
                </span>
                <p className="text-eyebrow text-[10px] font-bold">Executive Diagnostic · {emp.full_name}</p>
              </div>
              <div className="prose prose-sm text-foreground max-w-none space-y-3">
                {aiSummary.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="panel p-12 text-center">
              <Sparkles className="size-10 text-primary/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground text-sm">No diagnostic dossier generated yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Click "Synthesize AI Dossier" to let Gemini 3.5 Flash-Lite evaluate historical logs, consistency, and deliverable velocity.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Module 5: Long-Term Employee Growth Trajectory & Trend Analytics */}
      {activeTab === "trajectory" && (
        <div className="space-y-6">
          {/* Header & Coaching Frame Callout */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-foreground text-base">
                  Long-Term Growth Trajectory & Trend Analytics
                </h3>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-primary">
                  12-Week Trailing Window
                </span>
              </div>
              <p className="text-eyebrow text-[10px] mt-0.5">
                Longitudinal performance regression tracking across delivery, quality, and estimation
              </p>
            </div>
          </div>

          {/* Supportive Coaching Statement Card */}
          <div className="panel p-4 border-l-4 border-l-primary/70 bg-gradient-to-r from-primary/5 via-card to-surface flex items-start gap-3 shadow-xs">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              <span className="font-semibold text-primary">Growth Coaching Philosophy: </span>
              Growth trajectories highlight trends over time to support coaching conversations and
              recognition. They are not a single-number performance rating. Use this data alongside
              your own judgment for reviews and development conversations.
            </p>
          </div>

          {/* Plain-English Trajectory Interpretation Banner */}
          {trajectoryData?.trends && (
            <div className="panel p-4 border border-border/80 bg-surface-elevated/40 flex items-center gap-3">
              <Activity className="size-4 text-primary shrink-0" />
              <div className="text-xs text-foreground">
                <span className="font-semibold text-muted-foreground">Trajectory Summary: </span>
                <span>{synthesizeInterpretation(trajectoryData.trends)}</span>
              </div>
            </div>
          )}

          {/* 3 Metric Trend KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. On-Time Reliability */}
            <TrendKpiCard
              title="On-Time Reliability"
              metricKey="on_time_reliability"
              trendResult={trajectoryData?.trends?.on_time_reliability}
              color="#10b981"
              unit="%"
            />

            {/* 2. First-Pass Quality */}
            <TrendKpiCard
              title="First-Pass Quality"
              metricKey="first_pass_quality"
              trendResult={trajectoryData?.trends?.first_pass_quality}
              color="#6366f1"
              unit="%"
            />

            {/* 3. Estimation Accuracy */}
            <TrendKpiCard
              title="Estimation Accuracy"
              metricKey="estimation_accuracy"
              trendResult={trajectoryData?.trends?.estimation_accuracy}
              color="#f59e0b"
              unit="%"
            />
          </div>

          {/* Multi-Line Recharts Trend Chart */}
          <div className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  Performance Trajectory Over Time
                </h4>
                <p className="text-eyebrow text-[10px] text-muted-foreground">
                  Weekly aggregated reliability, quality, and estimation accuracy benchmarks
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground hidden sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#10b981]" /> On-Time Delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#6366f1]" /> First-Pass Quality
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#f59e0b]" /> Estimation Accuracy
                </span>
              </div>
            </div>

            {(!trajectoryData?.snapshots || trajectoryData.snapshots.length === 0) ? (
              <div className="p-12 text-center border border-dashed border-border rounded-xl">
                <TrendingUp className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">No Snapshot History Recorded Yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Weekly performance snapshots aggregate automatically every Sunday at 23:55 or upon manual trigger.
                </p>
              </div>
            ) : (
              <div className="w-full pt-2">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={trajectoryData.snapshots.map((s) => ({
                      date: s.week_ending ? format(new Date(s.week_ending), "MMM d") : "",
                      on_time_reliability_pct: s.on_time_reliability_pct ?? 100,
                      first_pass_quality_pct: s.first_pass_quality_pct ?? 100,
                      estimation_accuracy_pct: s.estimation_accuracy_pct ?? 100,
                      tasks_completed: s.tasks_completed ?? 0,
                    }))}
                    margin={{ top: 10, right: 25, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "10px",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                        fontSize: "12px",
                      }}
                      formatter={(val: any) => [`${val}%`, ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                    <Line
                      type="monotone"
                      dataKey="on_time_reliability_pct"
                      name="On-Time Reliability %"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: "#10b981" }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="first_pass_quality_pct"
                      name="First-Pass Quality %"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: "#6366f1" }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="estimation_accuracy_pct"
                      name="Estimation Accuracy %"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: "#f59e0b" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Historical Snapshot Log Table */}
          {trajectoryData?.snapshots && trajectoryData.snapshots.length > 0 && (
            <div className="panel p-5 space-y-3">
              <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <History className="size-4 text-primary" />
                Snapshot History ({trajectoryData.snapshots.length} recorded weeks)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-eyebrow text-[10px]">
                      <th className="py-2 px-3">Week Ending</th>
                      <th className="py-2 px-3">On-Time %</th>
                      <th className="py-2 px-3">Quality %</th>
                      <th className="py-2 px-3">Estimation %</th>
                      <th className="py-2 px-3">Tasks Completed</th>
                      <th className="py-2 px-3">Active Projects</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {[...trajectoryData.snapshots].reverse().map((snap, idx) => (
                      <tr key={snap._id || snap.id || idx} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                          {snap.week_ending ? format(new Date(snap.week_ending), "yyyy-MM-dd (EEEE)") : "--"}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-emerald-500">
                          {snap.on_time_reliability_pct}%
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-400">
                          {snap.first_pass_quality_pct}%
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-amber-500">
                          {snap.estimation_accuracy_pct}%
                        </td>
                        <td className="py-2.5 px-3 font-mono text-foreground">
                          {snap.tasks_completed}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                          {snap.projects_active?.length || 0} active
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function TrendKpiCard({
  title,
  metricKey,
  trendResult,
  color,
  unit,
}: {
  title: string;
  metricKey: string;
  trendResult?: TrendResult;
  color: string;
  unit: string;
}) {
  const currentVal = trendResult?.endValue !== null && trendResult?.endValue !== undefined
    ? `${trendResult.endValue}${unit}`
    : "--";
  const trend = trendResult?.trend || "stable";
  const slope = trendResult?.slopePerWeek ?? 0;
  const change = trendResult?.changeOverPeriod ?? 0;
  const count = trendResult?.dataPointsCount ?? 0;

  return (
    <div className="panel p-4 border-l-4 bg-card flex flex-col justify-between gap-3 shadow-sm" style={{ borderLeftColor: color }}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-eyebrow text-[10px] font-bold text-muted-foreground">{title}</span>
          {getTrendBadge(trend)}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold text-foreground tabular-nums">
            {currentVal}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            current
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-border/50 text-[11px] space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Weekly Slope:</span>
          <span className="font-mono font-semibold text-foreground">
            {slope > 0 ? `+${slope.toFixed(1)}%` : `${slope.toFixed(1)}%`} / wk
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Trailing Change:</span>
          <span
            className={cn(
              "font-mono font-semibold",
              change > 0 ? "text-emerald-500" : change < 0 ? "text-rose-500" : "text-muted-foreground"
            )}
          >
            {change > 0 ? `+${change}%` : `${change}%`} over {count} wks
          </span>
        </div>
      </div>
    </div>
  );
}

function getTrendBadge(trend?: "improving" | "declining" | "stable") {
  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
        <TrendingUp className="size-3" /> Improving
      </span>
    );
  }
  if (trend === "declining") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
        <TrendingDown className="size-3" /> Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
      <Minus className="size-3" /> Stable
    </span>
  );
}

function synthesizeInterpretation(trends?: GrowthTrajectoryResponse["trends"]) {
  if (!trends) return "Insufficient historical snapshot data to calculate trend trajectories.";
  const parts: string[] = [];
  const { on_time_reliability, first_pass_quality, estimation_accuracy } = trends;

  if (on_time_reliability.trend === "improving") {
    parts.push(`on-time delivery is improving (${on_time_reliability.changeOverPeriod > 0 ? "+" : ""}${on_time_reliability.changeOverPeriod}% over ${on_time_reliability.dataPointsCount} weeks)`);
  } else if (on_time_reliability.trend === "declining") {
    parts.push(`on-time delivery shows a decline (${on_time_reliability.changeOverPeriod}% over ${on_time_reliability.dataPointsCount} weeks)`);
  } else {
    parts.push("on-time reliability is stable");
  }

  if (first_pass_quality.trend === "improving") {
    parts.push(`first-pass quality is trending upward (${first_pass_quality.changeOverPeriod > 0 ? "+" : ""}${first_pass_quality.changeOverPeriod}%)`);
  } else if (first_pass_quality.trend === "declining") {
    parts.push(`first-pass quality has declined (${first_pass_quality.changeOverPeriod}%)`);
  }

  if (estimation_accuracy.trend === "improving") {
    parts.push(`estimation accuracy is notably sharpening (${estimation_accuracy.changeOverPeriod > 0 ? "+" : ""}${estimation_accuracy.changeOverPeriod}%)`);
  } else if (estimation_accuracy.trend === "declining") {
    parts.push(`estimation variance has broadened (${estimation_accuracy.changeOverPeriod}%)`);
  }

  return "Consistently tracking: " + parts.join(", and ") + ".";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const colors: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    primary: "text-primary",
  };
  return (
    <div className="text-left sm:text-center">
      <p className={cn("font-display text-2xl font-bold tabular-nums", tone ? colors[tone] : "text-foreground")}>
        {value}
      </p>
      <p className="text-eyebrow text-[9px]">{label}</p>
    </div>
  );
}

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
  Activity,
  Flame,
  FileText,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getUserProfile, getLogsByEmployee, getEmployeeProjects, getTasksByEmployee } from "@/lib/db";
import { generateAISummary } from "@/lib/gemini";
import type { UserProfile, Project, Task, DailyLog } from "@/lib/types";
import { normalizePriority, PRIORITY_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/pm/employees/$employeeId")({
  component: EmployeeAnalyticsPage,
});

function EmployeeAnalyticsPage() {
  const { employeeId } = Route.useParams();
  const [emp, setEmp] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"projects" | "history" | "leave" | "ai">("projects");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const [profile, projs, tsks, lgLogs] = await Promise.all([
        getUserProfile(employeeId),
        getEmployeeProjects(employeeId),
        getTasksByEmployee(employeeId),
        getLogsByEmployee(employeeId),
      ]);
      setEmp(profile);
      setProjects(projs);
      setTasks(tsks);
      setLogs(lgLogs);
      setLoading(false);
    };
    load();
  }, [employeeId]);

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
    </AppShell>
  );
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

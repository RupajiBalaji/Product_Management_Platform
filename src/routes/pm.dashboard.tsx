import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FolderKanban,
  Users,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  Sparkles,
  Flame,
  Calendar,
  Layers,
  Activity,
  ShieldAlert,
  Clock,
  RotateCcw,
  Loader2,
  TrendingUp,
  Award,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import {
  getAllProjects,
  getAllEmployees,
  getActiveSlippageEscalations,
  resolveSlippageEvent,
  getPendingGrowthAlerts,
  acknowledgeGrowthAlert,
} from "@/lib/db";
import type { Project, UserProfile, SlippageEvent, TrendAlertNotification } from "@/lib/types";
import { PRIORITY_STYLES, normalizePriority, isElevatedPriority, SLIPPAGE_LEVEL_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/pm/dashboard")({
  component: PMDashboard,
});

function PMDashboard() {
  const { userProfile } = useAuth();
  const isProductLead =
    userProfile?.user_type === "product_lead" ||
    userProfile?.user_type === "pm" ||
    userProfile?.user_type === "lead_architect";

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [slippageEscalations, setSlippageEscalations] = useState<SlippageEvent[]>([]);
  const [growthAlerts, setGrowthAlerts] = useState<TrendAlertNotification[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [p, e, s, g] = await Promise.all([
      getAllProjects(),
      getAllEmployees(),
      getActiveSlippageEscalations(),
      isProductLead ? getPendingGrowthAlerts().catch(() => ({ success: false, alerts: [] })) : Promise.resolve({ success: false, alerts: [] }),
    ]);
    setProjects(p);
    setEmployees(e);
    setSlippageEscalations(s);
    if (g && g.success && Array.isArray(g.alerts)) {
      setGrowthAlerts(g.alerts);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [isProductLead]);

  const handleResolve = async (id: string, option: string) => {
    setResolvingId(id);
    try {
      await resolveSlippageEvent(id, option);
      toast.success(`Escalation resolved via "${option}"`);
      setSlippageEscalations((prev) => prev.filter((item) => (item.id || item._id) !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to resolve escalation");
    } finally {
      setResolvingId(null);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setAcknowledgingAlertId(alertId);
    try {
      const res = await acknowledgeGrowthAlert(alertId);
      if (res.success) {
        toast.success("Trend alert acknowledged");
        setGrowthAlerts((prev) => prev.filter((a) => (a.id || a._id) !== alertId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to acknowledge trend alert");
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  const activeProjects = projects.filter((p) => p.status === "active");
  const highPriorityProjects = projects.filter((p) => isElevatedPriority(normalizePriority(p.priority)));

  return (
    <AppShell
      eyebrow={`Executive Overview · ${format(new Date(), "EEEE, MMMM d, yyyy")}`}
      title={`Welcome back, ${userProfile?.full_name?.split(" ")[0] ?? "Project Manager"}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/pm/ai-hub"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-glow"
          >
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline">AI Reports</span>
          </Link>
          <Link
            to="/pm/projects"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-all"
          >
            <Plus className="size-3.5" />
            <span>New Project</span>
          </Link>
        </div>
      }
    >
      {slippageEscalations.length > 0 && (
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-destructive animate-ping" />
              <h2 className="font-display text-base font-extrabold text-foreground flex items-center gap-2">
                <ShieldAlert className="size-4 text-destructive" />
                Active Delivery Escalations ({slippageEscalations.length})
              </h2>
            </div>
            <p className="text-eyebrow text-[10px] text-muted-foreground hidden sm:block">
              Requires Product Lead intervention or scope adjustment
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slippageEscalations.map((event) => {
              const id = event.id || event._id || "";
              const isResolving = resolvingId === id;
              const isStreak = event.trigger_type === "partial_work_streak";
              const userObj: any = event.user_id;
              const projectObj: any = event.project_id;
              const taskObj: any = event.task_id;

              return (
                <div
                  key={id}
                  className="panel p-5 border-l-4 border-l-destructive bg-card/90 space-y-3.5 shadow-md hover:border-destructive/80 transition-all"
                >
                  {/* Header Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                        {isStreak ? "🚨 3-Day Partial Streak" : "❌ QA Rejection Loop"}
                      </span>
                      {projectObj?.title && (
                        <span className="inline-flex items-center rounded-md bg-secondary/70 border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground truncate max-w-[160px]">
                          {projectObj.title}
                        </span>
                      )}
                    </div>
                    <span className="text-eyebrow text-[9px] text-muted-foreground">
                      {event.created_at ? format(new Date(event.created_at), "MMM d, HH:mm") : "Recent"}
                    </span>
                  </div>

                  {/* Title & Target Details */}
                  <div>
                    {isStreak ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground">
                          Contributor:{" "}
                          <span className="text-primary">{userObj?.full_name || event.user_id}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                          <span>Slippage Streak:</span>
                          <span className="px-1.5 py-0.2 rounded bg-destructive/20 text-destructive font-bold">
                            {event.day_count || 3} Consecutive Days
                          </span>
                          <span>·</span>
                          <span>~{event.cumulative_slippage_hours || 12}h logged incomplete</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground">
                          Task: <span className="text-foreground">{taskObj?.title || "Deliverable"}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                          <span>Assignee: {userObj?.full_name || event.user_id}</span>
                          <span>·</span>
                          <span className="px-1.5 py-0.2 rounded bg-destructive/20 text-destructive font-bold">
                            {event.rejection_count || 3}x Rejections
                          </span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed bg-elevated/60 p-2.5 rounded-xl border border-border/60">
                      {event.downstream_impact}
                    </p>
                  </div>

                  {/* Resolution Action Options */}
                  <div className="pt-1">
                    <p className="text-eyebrow text-[9px] text-muted-foreground mb-1.5">
                      Select Remediation Action:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(event.resolution_options_presented || [
                        isStreak ? "Reassign overflow" : "Schedule clarification session",
                        isStreak ? "Schedule 1-on-1" : "Reassign to experienced teammate",
                        isStreak ? "Extend milestone" : "Simplify acceptance criteria",
                      ]).map((opt) => (
                        <button
                          key={opt}
                          disabled={isResolving}
                          onClick={() => handleResolve(id, opt)}
                          className="flex-1 min-w-[120px] rounded-xl border border-border bg-elevated hover:bg-muted/80 hover:border-primary/50 text-[10px] font-bold text-foreground px-2.5 py-1.5 transition-all text-center cursor-pointer disabled:opacity-50"
                        >
                          {isResolving ? (
                            <Loader2 className="size-3 animate-spin mx-auto" />
                          ) : (
                            opt
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product Lead Growth & Trajectory Alerts Panel */}
      {isProductLead && (
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              <h2 className="font-display text-base font-extrabold text-foreground flex items-center gap-2">
                Growth & Trajectory Alerts
                {growthAlerts.length > 0 && (
                  <span className="rounded-full bg-primary/15 text-primary text-xs px-2 py-0.5 font-mono">
                    {growthAlerts.length}
                  </span>
                )}
              </h2>
            </div>
            <p className="text-eyebrow text-[10px] text-muted-foreground hidden sm:block">
              Weekly trajectory shifts requiring coaching or recognition
            </p>
          </div>

          {growthAlerts.length === 0 ? (
            <div className="panel p-5 flex items-center justify-between border border-border/70 bg-card/60">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    All employee trajectories are within expected parameters.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Linear regression slope monitoring will notify you when sustained shifts (&gt;15%) are detected.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground hidden md:inline px-2.5 py-1 rounded-md bg-muted">
                Trailing 12-Week Window
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {growthAlerts.map((alert) => {
                const alertId = alert.id || alert._id || "";
                const isPositive =
                  (alert as any).alert_style === "positive" ||
                  alert.message?.toLowerCase().includes("improved") ||
                  alert.title?.toLowerCase().includes("positive");
                const empId = (alert as any).employee_id;
                const isAcknowledging = acknowledgingAlertId === alertId;

                return (
                  <div
                    key={alertId}
                    className={cn(
                      "panel p-5 border-l-4 bg-card/90 space-y-3.5 shadow-sm transition-all",
                      isPositive
                        ? "border-l-emerald-500 hover:border-l-emerald-400"
                        : "border-l-amber-500 hover:border-l-amber-400"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border",
                          isPositive
                            ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-500 border-amber-500/30"
                        )}
                      >
                        {isPositive ? "🌟 Recognition Opportunity" : "⚠️ Coaching/Review Recommended"}
                      </span>
                      <span className="text-eyebrow text-[9px] text-muted-foreground">
                        {alert.created_at ? format(new Date(alert.created_at), "MMM d, HH:mm") : "Recent"}
                      </span>
                    </div>

                    <p className="text-xs text-foreground font-medium leading-relaxed">
                      {alert.message}
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                      {empId ? (
                        <Link
                          to="/pm/employees/$employeeId"
                          params={{ employeeId: empId }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          Inspect Trajectory
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Automated System Monitor</span>
                      )}

                      <button
                        disabled={isAcknowledging}
                        onClick={() => handleAcknowledgeAlert(alertId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated hover:bg-muted text-[10px] font-bold text-foreground px-3 py-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isAcknowledging ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3 text-muted-foreground" />
                        )}
                        Acknowledge
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Top Gradient KPI Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <MetricCard
          label="Active Initiatives"
          value={activeProjects.length}
          icon={FolderKanban}
          tone="primary"
          subtitle={`${projects.length} Total Projects`}
          bgGradient="from-primary/15 via-primary/5 to-transparent border-l-4 border-l-primary"
        />
        <MetricCard
          label="Priority Focus"
          value={highPriorityProjects.length}
          icon={Flame}
          tone="warning"
          subtitle="High & Critical deadlines"
          bgGradient="from-amber-500/15 via-amber-500/5 to-transparent border-l-4 border-l-amber-500"
        />
        <MetricCard
          label="Workforce Headcount"
          value={employees.length}
          icon={Users}
          tone="success"
          subtitle="Active team contributors"
          bgGradient="from-emerald-500/15 via-emerald-500/5 to-transparent border-l-4 border-l-emerald-500"
        />
        <MetricCard
          label="Completed Initiatives"
          value={projects.filter((p) => p.status === "completed").length}
          icon={CheckCircle2}
          tone="muted"
          subtitle={`${projects.filter((p) => p.status === "in-review").length} In Review`}
          bgGradient="from-purple-500/15 via-purple-500/5 to-transparent border-l-4 border-l-purple-500"
        />
      </div>

      {/* Quick Launchpad & Projects Overview */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-foreground">Active Projects & Priorities</h2>
            <p className="text-eyebrow text-[9px]">Click any initiative to view team matrix or assign tasks</p>
          </div>
          <Link
            to="/pm/projects"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1 group"
          >
            <span>Manage All Projects</span>
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel h-36 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="panel p-12 flex flex-col items-center text-center">
            <FolderKanban className="size-12 text-muted-foreground/30 mb-3" />
            <p className="font-display font-bold text-foreground text-sm">No projects created yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Create your first project container and allocate developers to start tracking daily updates.
            </p>
            <Link
              to="/pm/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 mt-4 transition-all"
            >
              <Plus className="size-4" /> Create Project
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const priority = normalizePriority(p.priority);
              const prioMeta = PRIORITY_STYLES[priority];
              const isHigh = isElevatedPriority(priority);

              return (
                <div
                  key={p.id}
                  className={cn(
                    "panel p-5 flex flex-col justify-between hover:border-primary/50 transition-all group relative",
                    isHigh && "border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-card to-card"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link
                        to="/pm/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1 flex-1"
                      >
                        {p.title}
                      </Link>
                      <span className="rounded-full border border-border bg-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
                        {p.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold", prioMeta.badge)}>
                        {prioMeta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {p.member_ids?.length || 0} members
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                      {p.description || "No description provided."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
                    <Link
                      to="/pm/projects/$projectId/matrix"
                      params={{ projectId: p.id }}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-[11px]"
                    >
                      <Calendar className="size-3" />
                      <span>Calendar Matrix</span>
                    </Link>

                    <Link
                      to="/pm/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-[11px] font-medium"
                    >
                      <span>Details</span>
                      <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
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
  bgGradient,
}: {
  label: string;
  value: number;
  icon: any;
  tone: string;
  subtitle: string;
  bgGradient?: string;
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary",
    success: "text-emerald-400",
    warning: "text-amber-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className={cn("panel p-5 bg-gradient-to-r", bgGradient)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-eyebrow text-[9px]">{label}</p>
        <span className="flex size-7 items-center justify-center rounded-lg bg-elevated border border-border">
          <Icon className={cn("size-3.5", toneMap[tone])} />
        </span>
      </div>
      <p className={cn("font-display text-2xl sm:text-3xl font-extrabold tabular-nums", toneMap[tone])}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Briefcase,
  AlertTriangle,
  Clock,
  HelpCircle,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Search,
  Filter,
  Users,
  ChevronRight,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import {
  getPortfolioDashboard,
  getPortfolioUtilizationHeatmap,
} from "@/lib/db";
import {
  PRIORITY_STYLES,
  HEALTH_STATUS_CONFIG,
  type ProjectPriority,
  type ProjectHealthStatus,
} from "@/lib/constants";
import type {
  PortfolioProject,
  PortfolioSummary,
  UtilizationHeatmapItem,
} from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/pm/portfolio")({
  component: PortfolioDashboardPage,
});

function PortfolioDashboardPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const isProductLead =
    userProfile?.user_type === "product_lead" || userProfile?.user_type === "pm";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [heatmap, setHeatmap] = useState<UtilizationHeatmapItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedHealth, setSelectedHealth] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [dashRes, heatRes] = await Promise.all([
        getPortfolioDashboard(),
        getPortfolioUtilizationHeatmap(),
      ]);

      if (dashRes.success) {
        setSummary(dashRes.summary);
        setProjects(dashRes.projects || []);
      }

      if (heatRes.success) {
        setHeatmap(heatRes.heatmap || []);
      }
    } catch (err: any) {
      console.error("Failed to load portfolio dashboard:", err);
      toast.error(err.message || "Failed to load portfolio dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProjects = projects.filter((proj) => {
    const matchesSearch =
      proj.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proj.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority =
      selectedPriority === "ALL" || proj.priority === selectedPriority;
    const matchesHealth =
      selectedHealth === "ALL" || proj.health.health === selectedHealth;
    const matchesStatus =
      selectedStatus === "ALL" || proj.status === selectedStatus;
    return matchesSearch && matchesPriority && matchesHealth && matchesStatus;
  });

  return (
    <AppShell
      title="Multi-Project Portfolio Dashboard"
      eyebrow="Executive Governance & Capacity Analytics"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-border hover:bg-surface-elevated transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-8 max-w-7xl mx-auto pb-12">
        {/* ─── 1. Aggregated Pending-Actions Executive Summary Row ──────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface to-surface-elevated border border-border p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Pending Actions
              </span>
              <div className="size-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
                <Briefcase className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {summary?.totalPendingActions ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">across portfolio</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Requires executive review or team action
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface to-surface-elevated border border-border p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Unresolved Slippage
              </span>
              <div className="size-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                <Clock className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {summary?.unresolvedSlippage ?? 0}
              </span>
              <span className="text-xs text-amber-400/80 font-medium">3-day streaks</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Partial work & repeated QA blockers
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface to-surface-elevated border border-border p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                Pending DoD Appeals
              </span>
              <div className="size-8 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400">
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {summary?.pendingAppeals ?? 0}
              </span>
              <span className="text-xs text-rose-400/80 font-medium">QA Rejections</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Awaiting Product Lead sign-off
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface to-surface-elevated border border-border p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Pending Clarifications
              </span>
              <div className="size-8 rounded-lg bg-cyan-500/15 flex items-center justify-center text-cyan-400">
                <HelpCircle className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {summary?.pendingClarifications ?? 0}
              </span>
              <span className="text-xs text-cyan-400/80 font-medium">PRD Inquiries</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Slippage paused pending spec answer
            </p>
          </div>
        </div>

        {/* ─── 2. Filter & Controls Bar ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search active projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-surface-elevated border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="size-3.5" />
              <span>Priority:</span>
            </div>
            {["ALL", "P1", "P2", "P3"].map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPriority(p)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  selectedPriority === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-elevated border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}

            <div className="h-4 w-px bg-border mx-1" />

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Health:</span>
            </div>
            {["ALL", "green", "yellow", "red"].map((h) => (
              <button
                key={h}
                onClick={() => setSelectedHealth(h)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium capitalize transition-colors ${
                  selectedHealth === h
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-elevated border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {h === "green" ? "🟢 Green" : h === "yellow" ? "🟡 Yellow" : h === "red" ? "🔴 Red" : "All"}
              </button>
            ))}

            <div className="h-4 w-px bg-border mx-1" />

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Status:</span>
            </div>
            {["ALL", "active", "completed", "frozen", "archived"].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium capitalize transition-colors ${
                  selectedStatus === st
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-elevated border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {st === "completed" ? "✓ Completed" : st}
              </button>
            ))}
          </div>
        </div>

        {/* ─── 3. Projects Grid ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Projects & Health Portfolio ({filteredProjects.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Traffic-light governance status, pending action counters, and budget burn tracking
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
              <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-primary" />
              Loading portfolio data...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
              <FolderKanban className="size-8 mx-auto mb-2 opacity-50" />
              No projects match the selected criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((proj) => {
                const priorityConfig =
                  PRIORITY_STYLES[proj.priority as ProjectPriority] || PRIORITY_STYLES.P2;
                const healthConfig =
                  HEALTH_STATUS_CONFIG[proj.health.health as ProjectHealthStatus] ||
                  HEALTH_STATUS_CONFIG.green;
                const isCompleted = proj.status === "completed";

                return (
                  <div
                    key={proj.id}
                    className={`flex flex-col justify-between rounded-xl bg-gradient-to-b from-surface to-surface-elevated border transition-all duration-200 shadow-xs hover:shadow-md p-5 group ${
                      isCompleted
                        ? "border-emerald-500/40 hover:border-emerald-500/70"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div>
                      {/* Card Header: Priority, Status & Health Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${priorityConfig.badge}`}
                          >
                            <span>{priorityConfig.icon}</span>
                            <span>{priorityConfig.shortLabel}</span>
                          </span>

                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                              <CheckCircle2 className="size-3 text-emerald-400" />
                              <span>COMPLETED</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${healthConfig.badge}`}
                          >
                            <span
                              className={`size-2 rounded-full ${healthConfig.trafficLight}`}
                            />
                            {healthConfig.label}
                          </span>
                        </div>
                      </div>

                      {/* Project Title & Click-through */}
                      <Link
                        to="/pm/projects/$projectId"
                        params={{ projectId: proj.id }}
                        className="block group-hover:text-primary transition-colors"
                      >
                        <h3 className="font-semibold text-base text-foreground flex items-center gap-1.5 line-clamp-1">
                          {proj.title}
                          <ChevronRight className="size-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary" />
                        </h3>
                      </Link>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1 min-h-[2rem]">
                        {proj.description || "No project description provided."}
                      </p>

                      {/* Health Reasoning Alert */}
                      {proj.health.reasons && proj.health.reasons.length > 0 && (
                        <div
                          className={`mt-3 p-2.5 rounded-lg border text-xs space-y-1 ${healthConfig.bg} ${healthConfig.border} ${healthConfig.text}`}
                        >
                          <div className="font-semibold flex items-center gap-1">
                            <Info className="size-3.5 shrink-0" />
                            <span>Governance Insights:</span>
                          </div>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                            {proj.health.reasons.map((r, i) => (
                              <li key={i} className="line-clamp-1">
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Tasks Progress Bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Task Progress</span>
                          <span className="font-medium text-foreground">
                            {proj.completedTasks} / {proj.totalTasks} Tasks
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{
                              width: `${
                                proj.totalTasks > 0
                                  ? Math.round((proj.completedTasks / proj.totalTasks) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Confidential Budget Snapshot (Product Lead Only) */}
                      {isProductLead && proj.budget && (
                        <div className="mt-4 pt-3 border-t border-border/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <DollarSign className="size-3 text-emerald-400" />
                              Budget Burn Snapshot
                            </span>
                            <span
                              className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                proj.budget.status === "green"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : proj.budget.status === "yellow"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-rose-500/15 text-rose-300"
                              }`}
                            >
                              {proj.budget.burnPct}% Burned
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded bg-surface border border-border/50">
                              <div className="text-[10px] text-muted-foreground">Authorized</div>
                              <div className="font-semibold text-foreground">
                                ${proj.budget.budgetedCost.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-surface border border-border/50">
                              <div className="text-[10px] text-muted-foreground">Burned to Date</div>
                              <div className="font-semibold text-foreground">
                                ${proj.budget.actualCostBurned.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-surface border border-border/50">
                              <div className="text-[10px] text-muted-foreground">Remaining</div>
                              <div
                                className={`font-semibold ${
                                  proj.budget.remainingBudget < 0
                                    ? "text-rose-400"
                                    : "text-emerald-400"
                                }`}
                              >
                                ${proj.budget.remainingBudget.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-surface border border-border/50">
                              <div className="text-[10px] text-muted-foreground">Projected Final</div>
                              <div className="font-semibold text-foreground">
                                ${proj.budget.projectedFinalCost.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Pending Action Counters */}
                    <div className="mt-5 pt-3 border-t border-border flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <AlertCircle className="size-3.5" />
                        <span>Pending Actions:</span>
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded-full text-[11px] ${
                            proj.pendingActions.total > 0
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {proj.pendingActions.total}
                        </span>
                      </div>

                      <Link
                        to="/pm/projects/$projectId"
                        params={{ projectId: proj.id }}
                        className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                      >
                        Details
                        <ChevronRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── 4. Global Resource Utilization Heatmap ────────────────────────── */}
        <div className="p-6 rounded-xl bg-surface border border-border shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="size-5 text-primary" />
                Workforce Utilization Heatmap
              </h2>
              <p className="text-xs text-muted-foreground">
                Cross-project daily commitments stacked against authorized capacity caps
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-red-500" /> P1 Projects
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-amber-500" /> P2 Projects
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-sky-500" /> P3 Projects
              </span>
            </div>
          </div>

          {heatmap.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg text-xs">
              No employee capacity records available.
            </div>
          ) : (
            <div className="space-y-4">
              {heatmap.map((emp) => {
                const isOver = emp.isOverAllocated;
                return (
                  <div
                    key={emp.userId}
                    className="p-3 rounded-lg bg-surface-elevated border border-border/60 hover:border-border transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{emp.name}</span>
                        <span className="text-muted-foreground">({emp.role_title})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono">
                          {emp.totalDailyHours}h / {emp.dailyCap}h cap
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isOver
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : emp.utilizationPct > 90
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-emerald-500/15 text-emerald-300"
                          }`}
                        >
                          {emp.utilizationPct}% {isOver ? "OVERALLOCATED" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Stacked Allocation Bar */}
                    <div className="w-full h-3 bg-muted/60 rounded-full overflow-hidden flex relative">
                      {emp.projects.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground">
                          Unallocated
                        </div>
                      ) : (
                        emp.projects.map((projSegment, idx) => {
                          const segWidth =
                            emp.dailyCap > 0
                              ? Math.min(
                                  100,
                                  (projSegment.dailyHours / emp.dailyCap) * 100
                                )
                              : 0;

                          const colorClass =
                            projSegment.priority === "P1"
                              ? "bg-red-500"
                              : projSegment.priority === "P2"
                              ? "bg-amber-500"
                              : "bg-sky-500";

                          return (
                            <div
                              key={`${emp.userId}-${projSegment.projectId}-${idx}`}
                              className={`h-full ${colorClass} transition-all hover:opacity-80 relative group/seg`}
                              style={{ width: `${segWidth}%` }}
                              title={`${projSegment.title} (${projSegment.priority}): ${projSegment.dailyHours}h/day`}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

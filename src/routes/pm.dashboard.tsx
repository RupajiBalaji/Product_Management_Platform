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
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import { getAllProjects, getAllEmployees } from "@/lib/db";
import type { Project, UserProfile } from "@/lib/types";
import { PRIORITY_STYLES, normalizePriority, isElevatedPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/pm/dashboard")({
  component: PMDashboard,
});

function PMDashboard() {
  const { userProfile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [p, e] = await Promise.all([getAllProjects(), getAllEmployees()]);
      setProjects(p);
      setEmployees(e);
      setLoading(false);
    };
    load();
  }, []);

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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, FolderKanban, X, Loader2, ArrowRight, CalendarDays, Flame, AlertCircle, Users, Filter } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getAllProjects, createProject, getAllEmployees } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import type { Project, UserProfile, ProjectPriority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/pm/projects/")({
  component: ProjectsPage,
});

const statusColor: Record<Project["status"], string> = {
  active: "bg-success/15 text-success border-success/30",
  "in-review": "bg-warning/15 text-warning border-warning/30",
  completed: "bg-muted text-muted-foreground border-border",
};

const priorityBadge: Record<ProjectPriority, { label: string; className: string; icon?: any }> = {
  critical: { label: "Critical Priority", className: "bg-red-500/20 text-red-400 border-red-500/40 font-bold", icon: Flame },
  high: { label: "High Priority", className: "bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold", icon: Flame },
  medium: { label: "Medium", className: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: null },
  low: { label: "Low Priority", className: "bg-muted text-muted-foreground border-border", icon: null },
};

function ProjectsPage() {
  const { userProfile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([getAllProjects(), getAllEmployees()]);
      setProjects(p);
      setEmployees(e);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredProjects = projects.filter((p) => {
    if (priorityFilter === "all") return true;
    return (p.priority || "medium") === priorityFilter;
  });

  return (
    <AppShell
      eyebrow="Organization Overview"
      title="All Projects & Team Portfolios"
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="size-4" /> New Project
        </button>
      }
    >
      {/* Priority Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-eyebrow text-[10px] text-muted-foreground mr-1 flex items-center gap-1">
            <Filter className="size-3" /> Priority:
          </span>
          {["all", "high", "critical", "medium", "low"].map((prio) => (
            <button
              key={prio}
              onClick={() => setPriorityFilter(prio)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-all cursor-pointer",
                priorityFilter === prio
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {prio === "all" ? "All Priorities" : prio === "high" ? "🔥 High Priority" : prio === "critical" ? "⚡ Critical" : prio}
            </button>
          ))}
        </div>

        <span className="text-xs font-mono text-muted-foreground">
          Showing {filteredProjects.length} of {projects.length} Projects
        </span>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel h-48 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="panel p-12 flex flex-col items-center text-center">
          <FolderKanban className="size-12 text-muted-foreground/30 mb-4" />
          <h2 className="font-display text-lg font-bold text-foreground">No projects found</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {priorityFilter !== "all" ? "Try clearing the priority filter." : "Create your first project to start organizing teams."}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-glow"
          >
            <Plus className="size-4" /> Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((p) => {
            const prio = priorityBadge[p.priority || "medium"];
            const PrioIcon = prio.icon;
            const isHighPriority = p.priority === "high" || p.priority === "critical";

            return (
              <Link
                key={p.id}
                to="/pm/projects/$projectId"
                params={{ projectId: p.id }}
                className={cn(
                  "panel p-5 flex flex-col justify-between hover:border-primary/50 transition-all group cursor-pointer relative",
                  isHighPriority && "border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {p.title}
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                        statusColor[p.status]
                      )}
                    >
                      {p.status}
                    </span>
                  </div>

                  {/* Priority Tag */}
                  <div className="mb-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tracking-wide",
                        prio.className
                      )}
                    >
                      {PrioIcon && <PrioIcon className="size-3" />}
                      <span>{prio.label}</span>
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                    {p.description || "No description provided."}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/60">
                    <span className="flex items-center gap-1">
                      <Users className="size-3 text-primary" />
                      <strong>{(p.member_ids || []).length}</strong> members
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <CalendarDays className="size-3" />
                      {p.created_at ? format(new Date(p.created_at), "MMM d, yyyy") : "Active"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-semibold text-primary mt-3 group-hover:translate-x-0.5 transition-transform">
                    <span>Open Project Team & Tasks</span>
                    <ArrowRight className="size-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <CreateProjectModal
          employees={employees}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function CreateProjectModal({
  employees,
  onClose,
  onCreated,
}: {
  employees: UserProfile[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ProjectPriority>("high");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;
    setLoading(true);
    try {
      await createProject({
        title,
        description,
        priority,
        member_ids: memberIds,
      });
      toast.success(`Project "${title}" created successfully!`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Create New Project</h2>
            <p className="text-eyebrow text-[10px]">Set priority and allocate team members</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-eyebrow mb-1.5 block">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI Customer Churn Intelligence Hub"
              required
              className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          <div>
            <label className="text-eyebrow mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key project goals, deliverables, and scope..."
              rows={2}
              required
              className="w-full resize-none rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          {/* Priority Selection */}
          <div>
            <label className="text-eyebrow mb-1.5 block">Project Priority Level</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "critical", label: "⚡ Critical", desc: "Immediate focus" },
                { id: "high", label: "🔥 High", desc: "Top priority" },
                { id: "medium", label: "Medium", desc: "Standard track" },
                { id: "low", label: "Low", desc: "Low urgency" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id as ProjectPriority)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-center transition-all cursor-pointer",
                    priority === p.id
                      ? "border-primary bg-primary/15 text-primary font-bold shadow-xs"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <span className="text-xs font-semibold">{p.label}</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Team Allocation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-eyebrow block">Allocate Team Members ({memberIds.length} Selected)</label>
              <span className="text-[11px] text-muted-foreground font-mono">{employees.length} available</span>
            </div>

            {employees.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No employees found in directory.</p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {employees.map((emp) => {
                  const isAssigned = memberIds.includes(emp.id);
                  const isBusy = (emp.projectCount || 0) > 1;
                  return (
                    <label
                      key={emp.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-2.5 cursor-pointer transition-all",
                        isAssigned
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-elevated hover:border-primary/30"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => toggleMember(emp.id)}
                        className="accent-primary cursor-pointer"
                      />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary text-[10px]">
                          {emp.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{emp.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{emp.role_title}</p>
                        </div>
                      </div>

                      {isBusy && (
                        <span className="text-[9px] font-mono rounded bg-warning/15 px-1.5 py-0.5 text-warning shrink-0">
                          {emp.projectCount} Projects
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-semibold text-foreground hover:border-primary/40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 cursor-pointer shadow-glow"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {loading ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

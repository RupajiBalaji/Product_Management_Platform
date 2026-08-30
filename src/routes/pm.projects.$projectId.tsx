import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  CalendarDays,
  Users,
  X,
  Loader2,
  Grid3X3,
  UserPlus,
  UserMinus,
  ArrowRight,
  Sparkles,
  Layers,
  Clock,
  Flame,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { AppShell } from "@/components/app-shell";
import {
  getProjectById,
  getTasksByProject,
  getAllEmployees,
  createTask,
  addProjectMember,
  removeProjectMember,
  updateProjectPriority,
} from "@/lib/db";
import type { Project, Task, UserProfile, ProjectPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/projects/$projectId")({
  component: ProjectDetailPage,
});

const priorityStyles: Record<ProjectPriority, { label: string; bg: string; text: string; border: string }> = {
  critical: { label: "⚡ Critical Priority", bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/40" },
  high: { label: "🔥 High Priority", bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/40" },
  medium: { label: "Medium Priority", bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  low: { label: "Low Priority", bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<(Project & { members?: UserProfile[] }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allEmployees, setAllEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedNewMember, setSelectedNewMember] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [proj, tsks, emps] = await Promise.all([
        getProjectById(projectId),
        getTasksByProject(projectId),
        getAllEmployees(),
      ]);
      setProject(proj);
      setTasks(tsks);
      setAllEmployees(emps);
    } catch (err) {
      console.error("Error loading project details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handlePriorityChange = async (newPriority: ProjectPriority) => {
    setPriorityLoading(true);
    try {
      const updated = await updateProjectPriority(projectId, newPriority);
      setProject((prev) => (prev ? { ...prev, priority: updated.priority } : null));
      toast.success(`Project priority set to: ${newPriority.toUpperCase()} 🔥`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update priority");
    } finally {
      setPriorityLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNewMember) return;
    setMemberLoading(true);
    try {
      const updated = await addProjectMember(projectId, selectedNewMember);
      setProject(updated);
      setSelectedNewMember("");
      toast.success("Team member allocated to project!");
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally {
      setMemberLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this project?`)) return;
    setMemberLoading(true);
    try {
      const updated = await removeProjectMember(projectId, userId);
      setProject(updated);
      const updatedTasks = await getTasksByProject(projectId);
      setTasks(updatedTasks);
      toast.success(`${userName} removed from project team.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    } finally {
      setMemberLoading(false);
    }
  };

  if (!loading && !project) {
    return (
      <AppShell title="Not Found" eyebrow="Project Detail">
        <div className="panel p-10 text-center text-muted-foreground">Project not found.</div>
      </AppShell>
    );
  }

  const assignedMemberIds = project?.member_ids || [];
  const assignedMembers = allEmployees.filter((e) => assignedMemberIds.includes(e.id));
  const availableToAdd = allEmployees.filter((e) => !assignedMemberIds.includes(e.id));

  const currentPriority = project?.priority || "medium";
  const prioMeta = priorityStyles[currentPriority];

  return (
    <AppShell
      eyebrow={`Project Manager Control · Status: ${project?.status || "active"}`}
      title={project?.title || "Loading Project…"}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Priority Dropdown Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1 text-xs">
            <span className="text-muted-foreground font-medium text-[11px]">Priority:</span>
            <select
              value={currentPriority}
              onChange={(e) => handlePriorityChange(e.target.value as ProjectPriority)}
              disabled={priorityLoading}
              className={cn(
                "rounded-lg px-2 py-0.5 text-xs font-bold outline-none cursor-pointer bg-transparent",
                prioMeta.text
              )}
            >
              <option value="critical">⚡ Critical</option>
              <option value="high">🔥 High Priority</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <Link
            to="/pm/projects/$projectId/matrix"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/50 transition-colors cursor-pointer"
          >
            <Grid3X3 className="size-3.5 text-primary" />
            <span>Calendar Matrix</span>
          </Link>

          <button
            onClick={() => setShowMemberModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer shadow-xs"
          >
            <Users className="size-3.5" />
            <span>Manage Team ({assignedMembers.length})</span>
          </button>

          <button
            onClick={() => setShowTaskModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="size-4" /> Add Task
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel h-28 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : (
        <>
          {/* Priority Notice Banner if High/Critical */}
          {(currentPriority === "high" || currentPriority === "critical") && (
            <div className="panel p-4 mb-6 border-l-4 border-l-amber-500 bg-amber-500/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Flame className="size-5 text-amber-400 shrink-0 animate-pulse" />
                <div>
                  <p className="font-display font-bold text-sm text-foreground">
                    🔥 High Priority Project Active
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Assigned developers will see this project elevated at the top of their dashboard to focus on first.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider shrink-0">
                Top Priority Focus
              </span>
            </div>
          )}

          {/* Project Details & Team Summary Card */}
          <div className="panel p-6 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                      prioMeta.bg,
                      prioMeta.text,
                      prioMeta.border
                    )}
                  >
                    {prioMeta.label}
                  </span>
                  <span className="text-eyebrow text-[10px] text-muted-foreground">
                    Created {project?.created_at ? format(new Date(project.created_at), "MMMM d, yyyy") : "Recently"}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {project?.description || "No project description provided."}
                </p>

                {/* Team Avatars with Quick Add */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-eyebrow text-[10px] font-semibold text-foreground">
                      Project Team Members ({assignedMembers.length})
                    </p>
                    <button
                      onClick={() => setShowMemberModal(true)}
                      className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="size-3" /> Add / Remove Members
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {assignedMembers.length === 0 ? (
                      <span className="text-xs text-warning italic">
                        ⚠️ No members assigned yet. Click "Add / Remove Members" to allocate developers.
                      </span>
                    ) : (
                      assignedMembers.map((e) => (
                        <div
                          key={e.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-elevated px-3 py-1.5 text-xs text-foreground group"
                        >
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 font-bold text-primary text-[9px]">
                            {e.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span className="font-medium">{e.full_name}</span>
                          <span className="text-[10px] text-muted-foreground">({e.role_title || "Developer"})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Metrics Tile */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2 shrink-0 lg:w-48">
                <div className="panel p-3 bg-elevated/40 text-center">
                  <p className="text-eyebrow text-[9px]">Project Tasks</p>
                  <p className="font-display text-xl font-bold text-foreground">{tasks.length}</p>
                </div>
                <div className="panel p-3 bg-elevated/40 text-center">
                  <p className="text-eyebrow text-[9px]">Assigned Devs</p>
                  <p className="font-display text-xl font-bold text-primary">{assignedMembers.length}</p>
                </div>
                <div className="panel p-3 bg-elevated/40 text-center">
                  <p className="text-eyebrow text-[9px]">Available in Org</p>
                  <p className="font-display text-xl font-bold text-muted-foreground">{allEmployees.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Project Tasks & Schedules ({tasks.length})</h2>
              <p className="text-eyebrow text-[10px]">Track task deadlines and assigned team members</p>
            </div>
            <button
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              <Plus className="size-3.5" /> Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="panel p-12 text-center">
              <CalendarDays className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No tasks scheduled yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Add tasks and assign your allocated team members to start tracking daily logs in the calendar matrix.
              </p>
              <button
                onClick={() => setShowTaskModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-glow cursor-pointer"
              >
                <Plus className="size-4" /> Create First Task
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => {
                const assignees = allEmployees.filter((e) => (task.assignee_ids || []).includes(e.id));
                const now = new Date();
                const isActive = parseISO(task.start_date) <= now && parseISO(task.end_date) >= now;
                const isOverdue = parseISO(task.end_date) < now;
                const daysLeft = differenceInDays(parseISO(task.end_date), now);

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "panel p-4 border-l-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
                      isActive ? "border-l-success" : isOverdue ? "border-l-destructive" : "border-l-muted"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground text-sm truncate">{task.title}</h3>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                            isActive
                              ? "bg-success/15 text-success border-success/30"
                              : isOverdue
                              ? "bg-destructive/15 text-destructive border-destructive/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {isActive ? "In Progress" : isOverdue ? "Overdue" : "Scheduled"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{task.description || "No description."}</p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
                      <div className="text-right">
                        <p className="font-mono text-xs text-foreground flex items-center gap-1 justify-end">
                          <CalendarDays className="size-3 text-muted-foreground" />
                          <span>
                            {format(parseISO(task.start_date), "MMM d")} → {format(parseISO(task.end_date), "MMM d, yyyy")}
                          </span>
                        </p>
                        <p className={cn("text-eyebrow text-[9px] mt-0.5", daysLeft <= 1 ? "text-destructive" : "text-muted-foreground")}>
                          {daysLeft > 0 ? `${daysLeft} days remaining` : daysLeft === 0 ? "Due today" : `${Math.abs(daysLeft)} days overdue`}
                        </p>
                      </div>

                      {/* Assignees avatars */}
                      <div className="flex -space-x-1.5">
                        {assignees.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                        ) : (
                          assignees.map((e) => (
                            <span
                              key={e.id}
                              className="flex size-7 items-center justify-center rounded-full bg-primary/20 border-2 border-card font-bold text-primary text-[9px]"
                              title={`${e.full_name} (${e.role_title})`}
                            >
                              {e.full_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Manage Team Members Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="panel w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Project Team Allocation</h2>
                <p className="text-eyebrow text-[10px]">Add or remove developers from this project</p>
              </div>
              <button
                onClick={() => setShowMemberModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Add New Member Section */}
            <form onSubmit={handleAddMember} className="mb-6 p-4 rounded-2xl border border-border bg-elevated/40 space-y-3">
              <label className="text-eyebrow text-[10px] block font-semibold text-foreground">
                Allocate New Developer to Team
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                <select
                  value={selectedNewMember}
                  onChange={(e) => setSelectedNewMember(e.target.value)}
                  className="min-w-0 flex-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary truncate"
                >
                  <option value="">Select an available developer...</option>
                  {availableToAdd.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} — {emp.role_title || "Developer"} ({emp.projectCount || 0} other projects)
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!selectedNewMember || memberLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer shadow-glow shrink-0 whitespace-nowrap"
                >
                  {memberLoading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  <span>Add Member</span>
                </button>
              </div>
              {availableToAdd.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  All employees in the company are currently allocated to this project.
                </p>
              )}
            </form>

            {/* Currently Allocated Team Members */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-eyebrow text-[10px] font-semibold text-muted-foreground">
                  Currently Assigned Members ({assignedMembers.length})
                </p>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {allEmployees.length} total in company
                </span>
              </div>

              {assignedMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">No members allocated yet.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {assignedMembers.map((emp) => (
                    <div
                      key={emp.id}
                      className="panel p-3.5 flex items-center justify-between gap-3 bg-card border-border/80"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary text-xs">
                          {emp.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{emp.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{emp.role_title} · {emp.email}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveMember(emp.id, emp.full_name)}
                        disabled={memberLoading}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors cursor-pointer shrink-0"
                        title="Remove from project team"
                      >
                        <UserMinus className="size-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-3 border-t border-border flex justify-end">
              <button
                onClick={() => setShowMemberModal(false)}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showTaskModal && (
        <CreateTaskModal
          projectId={projectId}
          employees={assignedMembers}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => {
            setShowTaskModal(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function CreateTaskModal({
  projectId,
  employees,
  onClose,
  onCreated,
}: {
  projectId: string;
  employees: UserProfile[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !endDate) return;
    setLoading(true);
    try {
      await createTask({
        project_id: projectId,
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        assignee_ids: assigneeIds,
      });
      toast.success(`Task "${title}" created successfully!`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Create New Task</h2>
            <p className="text-eyebrow text-[10px]">Schedule task milestones and assign team members</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-eyebrow mb-1.5 block">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build GraphQL Mutations & Auth Middleware"
              required
              className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div>
            <label className="text-eyebrow mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deliverable specifications, acceptance criteria..."
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-eyebrow mb-1.5 block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div>
              <label className="text-eyebrow mb-1.5 block">End Date (Deadline)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
                className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
          <div>
            <label className="text-eyebrow mb-2 block">Assign Allocated Developers</label>
            {employees.length === 0 ? (
              <p className="text-xs text-warning italic">
                ⚠️ No team members are allocated to this project yet. Please add members first using "Manage Team".
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {employees.map((emp) => (
                  <label
                    key={emp.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-2.5 cursor-pointer transition-all",
                      assigneeIds.includes(emp.id)
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-elevated hover:border-primary/30"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(emp.id)}
                      onChange={() => toggleAssignee(emp.id)}
                      className="accent-primary cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-foreground">{emp.full_name}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{emp.role_title}</span>
                  </label>
                ))}
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
              {loading ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

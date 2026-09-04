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
  GitFork,
  Network,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { AppShell } from "@/components/app-shell";
import {
  getProjectById,
  getTasksByProject,
  getAllEmployees,
  getRoles,
  createTask,
  updateTask,
  updateTaskDependencies,
  deleteTask,
  getProjectTaskGraph,
  addProjectMember,
  removeProjectMember,
  updateProjectPriority,
  getProjectSlippageEvents,
} from "@/lib/db";
import type { Project, Task, UserProfile, DynamicRole } from "@/lib/types";
import type { ProjectPriority } from "@/lib/constants";
import { PRIORITY_STYLES, PRIORITY_ORDER, normalizePriority, isElevatedPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<(Project & { members?: UserProfile[] }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allEmployees, setAllEmployees] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [slippageEvents, setSlippageEvents] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [dailyHoursAllocated, setDailyHoursAllocated] = useState<number>(8);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedNewMember, setSelectedNewMember] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [capacityConflict, setCapacityConflict] = useState<any | null>(null);
  const [pendingAllocation, setPendingAllocation] = useState<{
    userId: string; roleId?: string; dailyHours: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [proj, tsks, emps, dynamicRoles, slpEvents] = await Promise.all([
        getProjectById(projectId),
        getTasksByProject(projectId),
        getAllEmployees(),
        getRoles(),
        getProjectSlippageEvents(projectId),
      ]);
      setProject(proj);
      setTasks(tsks);
      setAllEmployees(emps);
      setRoles(dynamicRoles);
      setSlippageEvents(slpEvents);
    } catch (err) {
      console.error("Error loading project details:", err);
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeStreakEvent = (userId: string) => {
    return slippageEvents.find(
      (ev) =>
        (ev.user_id === userId ||
          ev.user_id?._id === userId ||
          ev.user_id?.id === userId ||
          ev.user_id?.uid === userId) &&
        ev.trigger_type === "partial_work_streak" &&
        !ev.resolved
    );
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handlePriorityChange = async (newPriority: ProjectPriority) => {
    setPriorityLoading(true);
    try {
      const updated = await updateProjectPriority(projectId, newPriority);
      setProject((prev) => (prev ? { ...prev, priority: updated.priority } : null));
      toast.success(`Project priority set to: ${newPriority} — ${PRIORITY_STYLES[newPriority]?.shortLabel || newPriority}`);
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
      const updated = await addProjectMember(
        projectId,
        selectedNewMember,
        selectedRoleId || undefined,
        dailyHoursAllocated
      );
      setProject(updated);
      setSelectedNewMember("");
      setSelectedRoleId("");
      setDailyHoursAllocated(8);
      setCapacityConflict(null);
      setPendingAllocation(null);
      toast.success("Team member allocated with dynamic role!");
    } catch (err: any) {
      if (err.status === 409 && err.data?.error === "Capacity conflict") {
        // Show capacity conflict panel instead of toast
        setCapacityConflict(err.data);
        setPendingAllocation({
          userId: selectedNewMember,
          roleId: selectedRoleId || undefined,
          dailyHours: dailyHoursAllocated,
        });
      } else {
        toast.error(err.message || "Failed to add member");
      }
    } finally {
      setMemberLoading(false);
    }
  };

  const handleForceAllocate = async () => {
    if (!pendingAllocation) return;
    setMemberLoading(true);
    try {
      const updated = await addProjectMember(
        projectId,
        pendingAllocation.userId,
        pendingAllocation.roleId,
        pendingAllocation.dailyHours,
        true // force override
      );
      setProject(updated);
      setSelectedNewMember("");
      setSelectedRoleId("");
      setDailyHoursAllocated(8);
      setCapacityConflict(null);
      setPendingAllocation(null);
      toast.success("Capacity override applied. Member allocated (CAPACITY_OVERRIDDEN logged to AuditLog).");
    } catch (err: any) {
      toast.error(err.message || "Force override failed");
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

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!confirm(`Are you sure you want to delete task "${taskTitle}"?`)) return;
    try {
      await deleteTask(taskId);
      toast.success(`Task "${taskTitle}" deleted.`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete task");
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
  const assignedMembers = (project?.members && project.members.length > 0)
    ? project.members
    : allEmployees.filter((e) => assignedMemberIds.includes(e.id));
  const availableToAdd = allEmployees.filter((e) => !assignedMemberIds.includes(e.id));

  const currentPriority = normalizePriority(project?.priority);
  const prioMeta = PRIORITY_STYLES[currentPriority];

  return (
    <AppShell
      eyebrow={`Project Manager Control · Status: ${project?.status || "active"}`}
      title={project?.title || "Loading Project…"}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Priority Dropdown Selector — P1/P2/P3 */}
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
              <option value="P1">⚡ P1 — Mission-Critical</option>
              <option value="P2">🔥 P2 — High-Value</option>
              <option value="P3">📌 P3 — Strategic</option>
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
          {/* Priority Notice Banner for P1/P2 */}
          {isElevatedPriority(currentPriority) && (
            <div className={cn(
              "panel p-4 mb-6 border-l-4 flex items-center justify-between gap-3",
              currentPriority === "P1"
                ? "border-l-red-500 bg-red-500/10"
                : "border-l-amber-500 bg-amber-500/10"
            )}>
              <div className="flex items-center gap-3">
                <Flame className={cn("size-5 shrink-0 animate-pulse", currentPriority === "P1" ? "text-red-400" : "text-amber-400")} />
                <div>
                  <p className="font-display font-bold text-sm text-foreground">
                    {prioMeta.icon} {prioMeta.shortLabel} Project Active
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentPriority === "P1"
                      ? "Mission-Critical: Assigned developers see this project at the top of their dashboard. Revenue or client deadlines at stake."
                      : "High-Value: Elevated team focus. Developers will see this project prioritized in their task queue."}
                  </p>
                </div>
              </div>
              <span className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0",
                prioMeta.badge
              )}>
                {prioMeta.shortLabel}
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
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-elevated px-3 py-1.5 text-xs text-foreground group shadow-xs"
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
                          <span className="text-[10px] text-primary/90 font-semibold">
                            ({e.dynamicRole?.title || e.role_title || "Contributor"})
                          </span>
                          {e.allocatedDailyHours && (
                            <span className="text-[9px] text-muted-foreground font-mono bg-card px-1.5 py-0.5 rounded-md border border-border/50">
                              {e.allocatedDailyHours}h/d
                            </span>
                          )}
                          {(() => {
                            const streak = getEmployeeStreakEvent(e.id);
                            if (!streak) return null;
                            const count = streak.day_count || 1;
                            return (
                              <div
                                className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background/90 px-1.5 py-0.5 text-[9px]"
                                title={`Unresolved Slippage Streak: ${count} consecutive partial days`}
                              >
                                <span className="font-bold text-muted-foreground text-[8px]">Slippage:</span>
                                <span className={cn("px-1 py-0.2 rounded font-mono font-bold text-[8px]", count >= 1 ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-muted-foreground")}>D1</span>
                                <span className="text-muted-foreground text-[8px]">→</span>
                                <span className={cn("px-1 py-0.2 rounded font-mono font-bold text-[8px]", count >= 2 ? "bg-amber-500/25 text-amber-300 border border-amber-500/50" : "text-muted-foreground")}>D2</span>
                                <span className="text-muted-foreground text-[8px]">→</span>
                                <span className={cn("px-1 py-0.2 rounded font-mono font-bold text-[8px]", count >= 3 ? "bg-destructive/25 text-destructive border border-destructive/50 animate-pulse font-extrabold" : "text-muted-foreground")}>D3</span>
                              </div>
                            );
                          })()}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Project Tasks & Schedules ({tasks.length})</h2>
              <p className="text-eyebrow text-[10px]">Track task deadlines, prerequisite dependencies, and estimates</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGraphModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer shadow-xs"
              >
                <Network className="size-3.5 text-primary" /> Dependency Graph (DAG)
              </button>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-glow"
              >
                <Plus className="size-3.5" /> Add Task
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="panel p-12 text-center">
              <CalendarDays className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No tasks scheduled yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Add tasks and assign your allocated team members to start tracking daily logs in the calendar matrix.
              </p>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskModal(true);
                }}
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
                const isCompleted = task.status === "completed";
                const isActive = !isCompleted && parseISO(task.start_date) <= now && parseISO(task.end_date) >= now;
                const isOverdue = !isCompleted && parseISO(task.end_date) < now;
                const daysLeft = differenceInDays(parseISO(task.end_date), now);

                // Prerequisite analysis
                const deps = (task.depends_on || []).map((d: any) => {
                  if (typeof d === "object" && d !== null) {
                    return { id: String(d._id || d.id), title: d.title, status: d.status };
                  }
                  const match = tasks.find((t) => t.id === d);
                  return { id: String(d), title: match?.title || "Prerequisite Task", status: match?.status || "active" };
                });
                const uncompletedDeps = deps.filter((d) => d.status !== "completed");
                const hasBlockers = uncompletedDeps.length > 0;

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "panel p-4 border-l-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-primary/30",
                      isCompleted
                        ? "border-l-success/60 bg-success/5"
                        : isActive
                        ? "border-l-primary"
                        : isOverdue
                        ? "border-l-destructive"
                        : "border-l-muted"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground text-sm truncate">{task.title}</h3>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                            isCompleted
                              ? "bg-success/15 text-success border-success/30"
                              : isActive
                              ? "bg-primary/15 text-primary border-primary/30"
                              : isOverdue
                              ? "bg-destructive/15 text-destructive border-destructive/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {isCompleted ? "Completed" : isActive ? "In Progress" : isOverdue ? "Overdue" : "Scheduled"}
                        </span>

                        <span className="rounded-full border border-border/70 bg-secondary/40 px-2 py-0.5 text-[9px] font-mono text-muted-foreground">
                          QA Gate: AI-Graded
                        </span>

                        {/* Dependency Status Badge */}
                        {deps.length > 0 ? (
                          hasBlockers ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[9px] font-medium text-warning"
                              title={`Blocked by: ${uncompletedDeps.map((d) => d.title).join(", ")}`}
                            >
                              <Clock className="size-2.5" /> Waiting on {uncompletedDeps.length} task{uncompletedDeps.length > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[9px] font-medium text-success">
                              <CheckCircle2 className="size-2.5" /> Prerequisites Met
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Independent
                          </span>
                        )}

                        {/* Hours estimate pill */}
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-elevated px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                          <Clock className="size-2.5 text-primary/70" />
                          {task.logged_hours || 0}h / {task.estimate_hours || 0}h est
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-1">{task.description || "No description."}</p>

                      {/* Prerequisite titles list if any */}
                      {deps.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-semibold text-foreground/80 flex items-center gap-1">
                            <GitFork className="size-2.5 rotate-180" /> Depends on:
                          </span>
                          {deps.map((d) => (
                            <span
                              key={d.id}
                              className={cn(
                                "rounded-md px-1.5 py-0.5 border text-[9px] font-medium",
                                d.status === "completed"
                                  ? "bg-success/10 text-success border-success/30"
                                  : "bg-elevated text-foreground border-border"
                              )}
                            >
                              {d.title} {d.status === "completed" ? "✓" : "⏳"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-5 shrink-0">
                      <div className="text-right">
                        <p className="font-mono text-xs text-foreground flex items-center gap-1 justify-end">
                          <CalendarDays className="size-3 text-muted-foreground" />
                          <span>
                            {format(parseISO(task.start_date), "MMM d")} → {format(parseISO(task.end_date), "MMM d, yyyy")}
                          </span>
                        </p>
                        <p className={cn("text-eyebrow text-[9px] mt-0.5", !isCompleted && daysLeft <= 1 ? "text-destructive" : "text-muted-foreground")}>
                          {isCompleted ? "Delivered" : daysLeft > 0 ? `${daysLeft} days remaining` : daysLeft === 0 ? "Due today" : `${Math.abs(daysLeft)} days overdue`}
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

                      {/* Actions */}
                      <div className="flex items-center gap-1 border-l border-border pl-3">
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setShowTaskModal(true);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                          title="Edit Task & Dependencies"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id, task.title)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete Task"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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

            {/* Add New Member Section with Dynamic Role */}
            <form onSubmit={handleAddMember} className="mb-6 p-4 rounded-2xl border border-border bg-elevated/40 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-eyebrow text-[10px] font-semibold text-foreground flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Allocate Developer with Dynamic Role
                </label>
                <Link to="/pm/roles" className="text-[10px] text-primary hover:underline font-medium">
                  Roles Admin →
                </Link>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Developer</label>
                <select
                  value={selectedNewMember}
                  onChange={(e) => setSelectedNewMember(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">Select an available developer...</option>
                  {availableToAdd.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} — {emp.role_title || "Contributor"} ({emp.projectCount || 0} active projects)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Dynamic Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => {
                      const rId = e.target.value;
                      setSelectedRoleId(rId);
                      const matched = roles.find((r) => (r.id || r._id) === rId);
                      if (matched?.defaultDailyCapHours) {
                        setDailyHoursAllocated(matched.defaultDailyCapHours);
                      }
                    }}
                    className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">Select specialized role...</option>
                    {roles.map((r) => (
                      <option key={r.id || r._id} value={r.id || r._id}>
                        {r.title} ({r.domain} · {r.defaultDailyCapHours}h cap)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Daily Allocation</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={dailyHoursAllocated}
                      onChange={(e) => setDailyHoursAllocated(Number(e.target.value))}
                      className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary pr-12"
                    />
                    <span className="absolute right-3 top-2 text-xs text-muted-foreground font-mono">hrs</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!selectedNewMember || memberLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer shadow-glow"
                >
                  {memberLoading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  <span>Allocate with Role</span>
                </button>
              </div>

              {availableToAdd.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  All employees in the company are currently allocated to this project.
                </p>
              )}
            </form>

            {/* ── Capacity Conflict Panel (Phase 3) ────────────────────────── */}
            {capacityConflict && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
                  <div>
                    <p className="font-bold text-destructive text-sm">Capacity Conflict Detected</p>
                    <p className="text-[11px] mt-1 opacity-90 leading-relaxed">{capacityConflict.message}</p>
                  </div>
                </div>

                {/* Conflicting projects */}
                {(capacityConflict.conflictingProjects || []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Current Active Allocations:</p>
                    {capacityConflict.conflictingProjects.map((p: any) => (
                      <div key={p.projectId} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5">
                        <span className="font-medium text-foreground truncate">{p.projectTitle}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded border",
                            p.priority === "P1" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                            p.priority === "P2" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                            "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          )}>{p.priority}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{p.dailyHours} hrs/day</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Resolution suggestion */}
                {capacityConflict.resolutionSuggestion?.reductions?.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 space-y-1">
                    <p className="text-[10px] font-semibold text-warning">Suggested Resolution:</p>
                    {capacityConflict.resolutionSuggestion.reductions.map((r: any) => (
                      <p key={r.projectId} className="text-[11px] text-muted-foreground leading-relaxed">
                        Reduce <strong className="text-foreground">{r.projectTitle}</strong> ({r.priority}) from {r.currentHours} → <strong className="text-warning">{r.suggestedHours} hrs/day</strong> (free {r.reduceBy} hrs)
                      </p>
                    ))}
                  </div>
                )}
                {capacityConflict.resolutionSuggestion && !capacityConflict.resolutionSuggestion.resolvable && (
                  <p className="text-[11px] text-muted-foreground italic">{capacityConflict.resolutionSuggestion.reason}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setCapacityConflict(null); setPendingAllocation(null); }}
                    className="flex-1 rounded-xl border border-border bg-card py-2 text-[11px] font-semibold text-foreground hover:bg-muted cursor-pointer"
                  >
                    Cancel
                  </button>
                  {capacityConflict.canForce && (
                    <button
                      onClick={handleForceAllocate}
                      disabled={memberLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/15 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/25 disabled:opacity-50 cursor-pointer"
                    >
                      {memberLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
                      Override Anyway
                    </button>
                  )}
                </div>
              </div>
            )}

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
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-foreground truncate">{emp.full_name}</p>
                            {emp.dynamicRole && (
                              <span className="inline-flex items-center rounded-md bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 text-[9px] font-semibold truncate max-w-[150px]">
                                {emp.dynamicRole.title}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {emp.allocatedDailyHours ? `${emp.allocatedDailyHours} hrs/day · ` : ""}{emp.email}
                          </p>
                          {(() => {
                            const streak = getEmployeeStreakEvent(emp.id);
                            if (!streak) return null;
                            const count = streak.day_count || 1;
                            return (
                              <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-border/50 text-[10px]">
                                <span className="font-bold text-muted-foreground">3-Day Slippage:</span>
                                <span className={cn("px-1.5 py-0.2 rounded font-mono font-bold text-[9px]", count >= 1 ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-muted text-muted-foreground")}>Day 1</span>
                                <span className="text-muted-foreground text-[9px]">→</span>
                                <span className={cn("px-1.5 py-0.2 rounded font-mono font-bold text-[9px]", count >= 2 ? "bg-amber-500/25 text-amber-300 border border-amber-500/50" : "bg-muted text-muted-foreground")}>Day 2</span>
                                <span className="text-muted-foreground text-[9px]">→</span>
                                <span className={cn("px-1.5 py-0.2 rounded font-mono font-bold text-[9px]", count >= 3 ? "bg-destructive/25 text-destructive border border-destructive/50 animate-pulse font-extrabold" : "bg-muted text-muted-foreground")}>Day 3 (Escalation)</span>
                              </div>
                            );
                          })()}
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

      {/* Task Modal (Create & Edit with Dependencies & Estimates) */}
      {showTaskModal && (
        <TaskModal
          projectId={projectId}
          employees={assignedMembers}
          allTasks={tasks}
          initialTask={editingTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onSaved={() => {
            setShowTaskModal(false);
            setEditingTask(null);
            load();
          }}
        />
      )}

      {/* DAG Topology Visualizer Modal */}
      {showGraphModal && (
        <DAGTopologyModal
          projectName={project.title}
          tasks={tasks}
          employees={allEmployees}
          onClose={() => setShowGraphModal(false)}
        />
      )}
    </AppShell>
  );
}

function TaskModal({
  projectId,
  employees,
  allTasks,
  initialTask,
  onClose,
  onSaved,
}: {
  projectId: string;
  employees: UserProfile[];
  allTasks: Task[];
  initialTask?: Task | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(initialTask);
  const [title, setTitle] = useState(initialTask?.title || "");
  const [description, setDescription] = useState(initialTask?.description || "");
  const [startDate, setStartDate] = useState(
    initialTask?.start_date ? format(parseISO(initialTask.start_date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    initialTask?.end_date ? format(parseISO(initialTask.end_date), "yyyy-MM-dd") : ""
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialTask?.assignee_ids || []);
  const [estimateHours, setEstimateHours] = useState<number>(initialTask?.estimate_hours || 0);
  const [status, setStatus] = useState<"active" | "completed">(initialTask?.status || "active");
  const [dependsOn, setDependsOn] = useState<string[]>(() => {
    if (!initialTask?.depends_on) return [];
    return (initialTask.depends_on as any[]).map((d) => (typeof d === "object" ? String(d._id || d.id) : String(d)));
  });
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter out self when editing so self-dependency cannot be chosen
  const candidatePrerequisites = allTasks.filter((t) => t.id !== initialTask?.id);

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleDependency = (id: string) => {
    setCycleError(null);
    setDependsOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !endDate) return;
    setLoading(true);
    setCycleError(null);

    try {
      if (isEditing && initialTask) {
        await updateTask(initialTask.id, {
          title: title.trim(),
          description: description.trim(),
          start_date: startDate,
          end_date: endDate,
          assignee_ids: assigneeIds,
          estimate_hours: Math.max(0, Number(estimateHours) || 0),
          status,
          depends_on: dependsOn,
        });
        toast.success(`Task "${title}" updated successfully!`);
      } else {
        await createTask({
          project_id: projectId,
          title: title.trim(),
          description: description.trim(),
          start_date: startDate,
          end_date: endDate,
          assignee_ids: assigneeIds,
          estimate_hours: Math.max(0, Number(estimateHours) || 0),
          depends_on: dependsOn,
        });
        toast.success(`Task "${title}" created successfully!`);
      }
      onSaved();
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.data?.error === "Circular dependency detected" ||
        (err.message && (err.message.includes("circular dependency") || err.message.includes("Circular dependency")))
      ) {
        setCycleError(err.message);
      } else {
        toast.error(err.message ?? (isEditing ? "Failed to update task" : "Failed to create task"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              {isEditing ? "Edit Task & Dependencies" : "Create New Task"}
            </h2>
            <p className="text-eyebrow text-[10px]">
              {isEditing ? "Configure task milestones, hours estimate, and prerequisites" : "Schedule milestones and build dependency DAG"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        {/* Inline Cycle Conflict Banner */}
        {cycleError && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Circular Dependency Blocked (DAG Rule)</p>
              <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">{cycleError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-eyebrow mb-1.5 block">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (cycleError) setCycleError(null);
              }}
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
              placeholder="Deliverable specifications, acceptance criteria, prerequisites..."
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div>
              <label className="text-eyebrow mb-1.5 block">Estimate Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={estimateHours}
                onChange={(e) => setEstimateHours(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          {isEditing && (
            <div>
              <label className="text-eyebrow mb-1.5 block">Task Status</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("active")}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                    status === "active"
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-elevated text-muted-foreground hover:bg-muted"
                  )}
                >
                  ⚡ Active / In Progress
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("completed")}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                    status === "completed"
                      ? "border-success bg-success/15 text-success"
                      : "border-border bg-elevated text-muted-foreground hover:bg-muted"
                  )}
                >
                  ✓ Completed / Delivered
                </button>
              </div>
            </div>
          )}

          {/* DAG Prerequisites Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-eyebrow block">Prerequisites (Tasks that must complete before this one)</label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {dependsOn.length} selected
              </span>
            </div>
            {candidatePrerequisites.length === 0 ? (
              <p className="text-xs text-muted-foreground italic panel p-3 bg-elevated/40 text-center">
                No other tasks available in this project to set as prerequisites.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 border border-border/80 rounded-xl p-2 bg-elevated/30">
                {candidatePrerequisites.map((cand) => {
                  const isChecked = dependsOn.includes(cand.id);
                  return (
                    <label
                      key={cand.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-2 text-xs cursor-pointer transition-all",
                        isChecked
                          ? "border-primary/70 bg-primary/10 text-foreground"
                          : "border-border/60 bg-elevated/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDependency(cand.id)}
                        className="accent-primary cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold block truncate">{cand.title}</span>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border",
                          cand.status === "completed"
                            ? "bg-success/15 text-success border-success/30"
                            : "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {cand.status === "completed" ? "Done" : "Active"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assign Developers */}
          <div>
            <label className="text-eyebrow mb-2 block">Assign Allocated Developers</label>
            {employees.length === 0 ? (
              <p className="text-xs text-warning italic panel p-3 bg-warning/5 border border-warning/20 rounded-xl">
                ⚠️ No team members are allocated to this project yet. Please allocate members using "Manage Team".
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {employees.map((emp) => (
                  <label
                    key={emp.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-2 cursor-pointer transition-all text-xs",
                      assigneeIds.includes(emp.id)
                        ? "border-primary/60 bg-primary/10 font-semibold text-foreground"
                        : "border-border bg-elevated text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(emp.id)}
                      onChange={() => toggleAssignee(emp.id)}
                      className="accent-primary cursor-pointer"
                    />
                    <span className="truncate">{emp.full_name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {emp.dynamicRole?.title || emp.role_title}
                    </span>
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
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isEditing ? (
                <Edit2 className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {loading ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DAGTopologyModal({
  projectName,
  tasks,
  employees,
  onClose,
}: {
  projectName: string;
  tasks: Task[];
  employees: UserProfile[];
  onClose: () => void;
}) {
  const rootTasks = tasks.filter((t) => (t.depends_on || []).length === 0);
  const dependentTasks = tasks.filter((t) => (t.depends_on || []).length > 0);
  const completedTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Network className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Dependency Graph (DAG) Topology</h2>
              <p className="text-eyebrow text-[10px]">Acyclic Execution Pipeline · {projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
          <div className="panel p-3 bg-elevated/40 text-center">
            <p className="text-eyebrow text-[9px]">Total Nodes</p>
            <p className="font-display text-xl font-bold text-foreground">{tasks.length}</p>
          </div>
          <div className="panel p-3 bg-elevated/40 text-center">
            <p className="text-eyebrow text-[9px]">Root (Independent)</p>
            <p className="font-display text-xl font-bold text-primary">{rootTasks.length}</p>
          </div>
          <div className="panel p-3 bg-elevated/40 text-center">
            <p className="text-eyebrow text-[9px]">Chained (Dependent)</p>
            <p className="font-display text-xl font-bold text-amber-400">{dependentTasks.length}</p>
          </div>
          <div className="panel p-3 bg-elevated/40 text-center">
            <p className="text-eyebrow text-[9px]">Delivered</p>
            <p className="font-display text-xl font-bold text-success">{completedTasks.length}</p>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="panel p-8 text-center text-muted-foreground text-xs">
            No tasks scheduled in this project yet. Add tasks to visualize the dependency graph.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Roots Section */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="size-2 rounded-full bg-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Root Tasks (Ready to Execute / No Blockers)
                </h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {rootTasks.map((task) => {
                  const unlocks = tasks.filter((t) => {
                    const deps = (t.depends_on || []).map((d: any) =>
                      typeof d === "object" ? String(d._id || d.id) : String(d)
                    );
                    return deps.includes(task.id);
                  });

                  return (
                    <div
                      key={task.id}
                      className="panel p-3 bg-card border-border/80 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-xs text-foreground truncate">{task.title}</span>
                        <span
                          className={cn(
                            "text-[8px] font-mono uppercase px-1.5 py-0.2 rounded border shrink-0",
                            task.status === "completed"
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-primary/15 text-primary border-primary/30"
                          )}
                        >
                          {task.status === "completed" ? "Done" : "Ready"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mb-2">
                        {task.description || "No description"}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                        <span>⏱️ {task.estimate_hours || 0}h est</span>
                        {unlocks.length > 0 ? (
                          <span className="text-primary font-medium flex items-center gap-1">
                            <ArrowRight className="size-2.5" /> Unlocks {unlocks.length} task{unlocks.length > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Terminal</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dependent Tasks Section */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="size-2 rounded-full bg-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Chained Tasks (Requires Prerequisite Completion)
                </h3>
              </div>
              {dependentTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic panel p-3 text-center">
                  All current tasks are independent roots.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {dependentTasks.map((task) => {
                    const deps = (task.depends_on || []).map((d: any) => {
                      if (typeof d === "object" && d !== null) {
                        return { id: String(d._id || d.id), title: d.title, status: d.status };
                      }
                      const match = tasks.find((t) => t.id === d);
                      return { id: String(d), title: match?.title || "Prerequisite", status: match?.status || "active" };
                    });
                    const uncompleted = deps.filter((d) => d.status !== "completed");
                    const unlocks = tasks.filter((t) => {
                      const dList = (t.depends_on || []).map((d: any) =>
                        typeof d === "object" ? String(d._id || d.id) : String(d)
                      );
                      return dList.includes(task.id);
                    });

                    return (
                      <div
                        key={task.id}
                        className="panel p-3 bg-card border-border/80 hover:border-amber-400/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-xs text-foreground truncate">{task.title}</span>
                          <span
                            className={cn(
                              "text-[8px] font-mono uppercase px-1.5 py-0.2 rounded border shrink-0",
                              task.status === "completed"
                                ? "bg-success/15 text-success border-success/30"
                                : uncompleted.length === 0
                                ? "bg-primary/15 text-primary border-primary/30"
                                : "bg-warning/15 text-warning border-warning/30"
                            )}
                          >
                            {task.status === "completed"
                              ? "Done"
                              : uncompleted.length === 0
                              ? "Ready"
                              : `Blocked (${uncompleted.length})`}
                          </span>
                        </div>

                        {/* Inbound dependencies */}
                        <div className="space-y-1 my-2">
                          <p className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1">
                            <GitFork className="size-2.5 rotate-180 text-amber-400" /> Prerequisite Chain:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {deps.map((d) => (
                              <span
                                key={d.id}
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[9px] border font-medium",
                                  d.status === "completed"
                                    ? "bg-success/10 text-success border-success/30"
                                    : "bg-warning/10 text-warning border-warning/30"
                                )}
                              >
                                {d.title} {d.status === "completed" ? "✓" : "⏳"}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                          <span>⏱️ {task.estimate_hours || 0}h est</span>
                          {unlocks.length > 0 ? (
                            <span className="text-primary font-medium flex items-center gap-1">
                              <ArrowRight className="size-2.5" /> Unlocks {unlocks.length}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">Terminal</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 pt-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
          >
            Close Graph
          </button>
        </div>
      </div>
    </div>
  );
}

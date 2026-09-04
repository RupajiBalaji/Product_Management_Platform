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
  DollarSign,
  TrendingUp,
  MessageSquare,
  Send,
  Lock,
  UserCheck,
  MessageCircle,
  Hash,
  AtSign,
  Eye,
  AlertOctagon,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
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
  getProjectBudget,
  getCreationThread,
  postCreationThreadMessage,
  inviteSMEExpert,
  revokeSMEExpert,
  finalizeCreationThread,
  getProjectTeamChannel,
  createChannelThread,
  postChannelMessage,
  getProjectDirectMessage,
  postProjectDirectMessage,
} from "@/lib/db";
import type {
  Project,
  Task,
  UserProfile,
  DynamicRole,
  ProjectBudgetDetail,
  CreationThread,
  CreationThreadMessage,
  InvitedExpert,
  TeamChannel,
  ChannelThread,
  ChannelMessage,
  DirectMessage,
  DirectMessageItem,
} from "@/lib/types";
import type { ProjectPriority, ProjectHealthStatus } from "@/lib/constants";
import {
  PRIORITY_STYLES,
  PRIORITY_ORDER,
  normalizePriority,
  isElevatedPriority,
  HEALTH_STATUS_CONFIG,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { userProfile } = useAuth();
  const isProductLead =
    userProfile?.user_type === "product_lead" || userProfile?.user_type === "pm";

  const [project, setProject] = useState<(Project & { members?: UserProfile[] }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allEmployees, setAllEmployees] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [slippageEvents, setSlippageEvents] = useState<any[]>([]);
  const [budgetDetail, setBudgetDetail] = useState<ProjectBudgetDetail | null>(null);
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

  // Phase 9: Creation Deliberation & SME Consultation
  const [creationThread, setCreationThread] = useState<CreationThread | null>(null);
  const [threadMsgInput, setThreadMsgInput] = useState("");
  const [postingThreadMsg, setPostingThreadMsg] = useState(false);
  const [showSmeModal, setShowSmeModal] = useState(false);
  const [selectedSmeUserId, setSelectedSmeUserId] = useState("");
  const [smeInviteLoading, setSmeInviteLoading] = useState(false);
  const [revokingSmeId, setRevokingSmeId] = useState<string | null>(null);
  const [finalizingThread, setFinalizingThread] = useState(false);

  // Phase 10: Team Channel & Direct Messaging State
  const [teamChannel, setTeamChannel] = useState<TeamChannel | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [newThreadTopic, setNewThreadTopic] = useState("");
  const [newThreadLinkedTaskId, setNewThreadLinkedTaskId] = useState("");
  const [newThreadInitialMsg, setNewThreadInitialMsg] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [threadReplyInput, setThreadReplyInput] = useState("");
  const [sendingThreadReply, setSendingThreadReply] = useState(false);

  // 1-on-1 Direct Messaging Modal State
  const [activeDmUser, setActiveDmUser] = useState<UserProfile | null>(null);
  const [activeDm, setActiveDm] = useState<DirectMessage | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [sendingDm, setSendingDm] = useState(false);
  const [loadingDm, setLoadingDm] = useState(false);

  const loadThread = async () => {
    try {
      const tRes = await getCreationThread(projectId);
      if (tRes && tRes.success) {
        setCreationThread(tRes.thread);
      }
    } catch {
      setCreationThread(null);
    }
  };

  const loadChannel = async () => {
    try {
      const cRes = await getProjectTeamChannel(projectId);
      if (cRes && cRes.success) {
        setTeamChannel(cRes.channel);
        if (!activeThreadId && cRes.channel.threads?.length > 0) {
          setActiveThreadId(cRes.channel.threads[0].id || cRes.channel.threads[0]._id || null);
        }
      }
    } catch (err) {
      console.warn("Team channel not accessible:", err);
    }
  };

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

      if (isProductLead) {
        try {
          const b = await getProjectBudget(projectId);
          if (b && b.success) {
            setBudgetDetail(b);
          }
        } catch (bErr) {
          console.warn("Could not load project budget detail:", bErr);
        }
      }

      await Promise.all([loadThread(), loadChannel()]);
    } catch (err) {
      console.error("Error loading project details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateThread = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newThreadTopic.trim() || creatingThread) return;
    setCreatingThread(true);
    try {
      const res = await createChannelThread(
        projectId,
        newThreadTopic.trim(),
        newThreadLinkedTaskId || undefined,
        newThreadInitialMsg.trim() || undefined
      );
      if (res && res.success) {
        toast.success(`Thread "${newThreadTopic}" created`);
        setNewThreadTopic("");
        setNewThreadLinkedTaskId("");
        setNewThreadInitialMsg("");
        setShowNewThreadModal(false);
        await loadChannel();
        if (res.thread?.id || res.thread?._id) {
          setActiveThreadId(res.thread.id || res.thread._id || null);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create thread");
    } finally {
      setCreatingThread(false);
    }
  };

  const handlePostChannelReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!threadReplyInput.trim() || !activeThreadId || sendingThreadReply) return;
    setSendingThreadReply(true);
    try {
      const res = await postChannelMessage(projectId, activeThreadId, threadReplyInput.trim());
      if (res && res.success) {
        setThreadReplyInput("");
        await loadChannel();
        if (res.dependencyDetection?.referencesTask && res.dependencyDetection.matchedTaskTitles?.length > 0) {
          toast.info(`Task reference detected: ${res.dependencyDetection.matchedTaskTitles.join(", ")}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post reply");
    } finally {
      setSendingThreadReply(false);
    }
  };

  const handleOpenDm = async (member: UserProfile) => {
    setActiveDmUser(member);
    setLoadingDm(true);
    try {
      const res = await getProjectDirectMessage(projectId, member.id);
      if (res && res.success) {
        setActiveDm(res.dm);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load direct messages");
    } finally {
      setLoadingDm(false);
    }
  };

  const handleSendDm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dmInput.trim() || !activeDmUser || sendingDm) return;
    setSendingDm(true);
    try {
      const res = await postProjectDirectMessage(projectId, activeDmUser.id, dmInput.trim());
      if (res && res.success) {
        setDmInput("");
        const dmRes = await getProjectDirectMessage(projectId, activeDmUser.id);
        if (dmRes && dmRes.success) {
          setActiveDm(dmRes.dm);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send direct message");
    } finally {
      setSendingDm(false);
    }
  };

  const handlePostThreadMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!threadMsgInput.trim() || postingThreadMsg) return;
    setPostingThreadMsg(true);
    try {
      const res = await postCreationThreadMessage(projectId, threadMsgInput.trim());
      if (res && res.success) {
        setThreadMsgInput("");
        await loadThread();
        toast.success("Deliberation message posted");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post message");
    } finally {
      setPostingThreadMsg(false);
    }
  };

  const handleInviteSme = async () => {
    if (!selectedSmeUserId || smeInviteLoading) return;
    setSmeInviteLoading(true);
    try {
      const res = await inviteSMEExpert(projectId, selectedSmeUserId);
      if (res && res.success) {
        toast.success("Subject Matter Expert invited to deliberation");
        setShowSmeModal(false);
        setSelectedSmeUserId("");
        await loadThread();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to invite expert");
    } finally {
      setSmeInviteLoading(false);
    }
  };

  const handleRevokeSme = async (userId: string) => {
    setRevokingSmeId(userId);
    try {
      const res = await revokeSMEExpert(projectId, userId);
      if (res && res.success) {
        toast.success("Subject Matter Expert access revoked");
        await loadThread();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke expert");
    } finally {
      setRevokingSmeId(null);
    }
  };

  const handleFinalizeThread = async () => {
    if (
      !window.confirm(
        "Finalize creation deliberation thread? This will lock discussions and revoke all active SME consultations for execution."
      )
    ) {
      return;
    }
    setFinalizingThread(true);
    try {
      const res = await finalizeCreationThread(projectId);
      if (res && res.success) {
        toast.success("Creation deliberation thread finalized and locked");
        await loadThread();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize thread");
    } finally {
      setFinalizingThread(false);
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

  const activeThread =
    teamChannel?.threads.find((t) => (t.id || t._id) === activeThreadId) ||
    (teamChannel?.threads && teamChannel.threads.length > 0 ? teamChannel.threads[0] : null);

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
                          {e.id !== userProfile?.id && (
                            <button
                              onClick={() => handleOpenDm(e)}
                              className="size-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors ml-0.5 cursor-pointer"
                              title={`Direct message ${e.full_name}`}
                            >
                              <MessageCircle className="size-3" />
                            </button>
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

          {/* ─── Confidential Budget Burn Panel (Product Lead Only) ──────────────── */}
          {isProductLead && budgetDetail && (
            <div className="panel p-6 mb-6 border border-border bg-gradient-to-br from-surface to-surface-elevated shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                    <DollarSign className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                      Project Financial & Budget Burn Projection
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Confidential · Product Lead Only
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Resource expenditure tracked against authorized project allocations
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border",
                      HEALTH_STATUS_CONFIG[budgetDetail.status as ProjectHealthStatus]?.badge ||
                        HEALTH_STATUS_CONFIG.green.badge
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        HEALTH_STATUS_CONFIG[budgetDetail.status as ProjectHealthStatus]?.trafficLight ||
                          HEALTH_STATUS_CONFIG.green.trafficLight
                      )}
                    />
                    {HEALTH_STATUS_CONFIG[budgetDetail.status as ProjectHealthStatus]?.label || "On Track"} ({budgetDetail.burnPct}% Burned)
                  </span>
                </div>
              </div>

              {/* 4 Key Financial Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Authorized Budget</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    ${budgetDetail.budgetedCost.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Based on approved allocations
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Actual Cost Burned</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    ${budgetDetail.actualCostBurned.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Hours logged to date
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Remaining Budget</div>
                  <div
                    className={cn(
                      "text-lg font-bold mt-0.5",
                      budgetDetail.remainingBudget < 0 ? "text-rose-400" : "text-emerald-400"
                    )}
                  >
                    ${budgetDetail.remainingBudget.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {budgetDetail.remainingBudget < 0 ? "Over budget limit" : "Available balance"}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-elevated/70 border border-border/60">
                  <div className="text-[11px] text-muted-foreground font-medium">Projected Final Cost</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    ${budgetDetail.projectedFinalCost.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Extrapolated completion cost
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Budget Utilization Rate</span>
                  <span className="font-semibold text-foreground">{budgetDetail.burnPct}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      budgetDetail.status === "green"
                        ? "bg-emerald-500"
                        : budgetDetail.status === "yellow"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    )}
                    style={{ width: `${Math.min(100, budgetDetail.burnPct)}%` }}
                  />
                </div>
              </div>

              {/* Contributor Cost Breakdown Table */}
              {budgetDetail.memberBreakdown && budgetDetail.memberBreakdown.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp className="size-3.5 text-primary" />
                    <span>Team Member Expenditure Breakdown</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-elevated/80 border-b border-border/60 text-muted-foreground font-semibold text-[11px]">
                        <tr>
                          <th className="p-2.5">Member</th>
                          <th className="p-2.5">Hourly Rate</th>
                          <th className="p-2.5">Daily Allocation</th>
                          <th className="p-2.5">Hours Logged</th>
                          <th className="p-2.5 text-right">Cost Burned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-foreground">
                        {budgetDetail.memberBreakdown.map((m) => (
                          <tr key={m.userId} className="hover:bg-surface-elevated/40 transition-colors">
                            <td className="p-2.5 font-medium">
                              {m.name}
                              <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                                ({m.role_title})
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-muted-foreground">${m.rate}/hr</td>
                            <td className="p-2.5 font-mono text-muted-foreground">{m.dailyHoursAllocated}h/d</td>
                            <td className="p-2.5 font-mono">{m.hoursLogged} hrs</td>
                            <td className="p-2.5 font-mono font-semibold text-right text-emerald-400">
                              ${m.costBurned.toLocaleString()}
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

          {/* ─── Phase 9: Creation Deliberation & SME Advisory Section ───────────────── */}
          {(creationThread || isProductLead) && (
            <div className="panel p-6 mb-6 border border-border bg-gradient-to-br from-surface to-surface-elevated shadow-xs space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
                    <MessageSquare className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                      Creation Deliberation & SME Consultation
                      {creationThread?.status === "active" ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active Deliberation
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border flex items-center gap-1">
                          <Lock className="size-2.5" />
                          Finalized (Execution Locked)
                        </span>
                      )}
                      {creationThread?.is_sme_view && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          SME Advisory View
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Pre-execution intake deliberation. Subject Matter Experts clarify technical scope, architecture, and feasibility.
                    </p>
                  </div>
                </div>

                {/* Header Actions for Product Lead */}
                {isProductLead && creationThread?.status === "active" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSmeModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer shadow-xs"
                    >
                      <UserPlus className="size-3.5" />
                      <span>Invite SME Expert</span>
                    </button>
                    <button
                      onClick={handleFinalizeThread}
                      disabled={finalizingThread}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors cursor-pointer"
                      title="Finalize thread and lock SME consultations as project transitions to execution"
                    >
                      {finalizingThread ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                      <span>Finalize Deliberation</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Active Subject Matter Experts Chips */}
              {creationThread?.invited_experts && creationThread.invited_experts.length > 0 && (
                <div className="pt-1">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    Consulting Subject Matter Experts ({creationThread.invited_experts.filter((e) => !e.revoked_at).length} active)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {creationThread.invited_experts.map((inv) => {
                      const isRevoked = !!inv.revoked_at;
                      return (
                        <div
                          key={inv.user_id}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs border transition-colors",
                            isRevoked
                              ? "border-border/50 bg-muted/20 text-muted-foreground opacity-60"
                              : "border-indigo-500/30 bg-indigo-500/10 text-foreground"
                          )}
                        >
                          <span className="size-2 rounded-full bg-indigo-400" />
                          <span className="font-medium text-[11px]">
                            {inv.user_name || "Expert"}
                          </span>
                          {inv.user_role_title && (
                            <span className="text-[10px] text-muted-foreground">({inv.user_role_title})</span>
                          )}
                          {isRevoked ? (
                            <span className="text-[9px] uppercase font-bold text-muted-foreground ml-1">Revoked</span>
                          ) : (
                            isProductLead &&
                            creationThread.status === "active" && (
                              <button
                                onClick={() => handleRevokeSme(inv.user_id)}
                                disabled={revokingSmeId === inv.user_id}
                                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold ml-1 hover:underline cursor-pointer"
                                title="Revoke SME access"
                              >
                                {revokingSmeId === inv.user_id ? "Revoking…" : "Revoke"}
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Messages History Feed */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 max-h-80 overflow-y-auto">
                {(!creationThread?.messages || creationThread.messages.length === 0) ? (
                  <div className="text-center py-6 text-xs text-muted-foreground italic">
                    No deliberation messages posted yet. Use this channel to align on technical feasibility, risk boundaries, or architectural decisions before finalizing for execution.
                  </div>
                ) : (
                  creationThread.messages.map((m) => {
                    const roleBadge =
                      m.author_role_at_time === "product_lead"
                        ? { label: "Product Lead", style: "bg-purple-500/15 text-purple-300 border-purple-500/30" }
                        : m.author_role_at_time === "invited_expert"
                        ? { label: "Subject Matter Expert", style: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" }
                        : { label: "Lead Architect", style: "bg-blue-500/15 text-blue-300 border-blue-500/30" };

                    return (
                      <div key={m.id || m._id} className="flex items-start gap-3 text-xs">
                        <div className="size-7 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {m.author_name
                            ? m.author_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()
                            : "U"}
                        </div>
                        <div className="flex-1 min-w-0 bg-surface-elevated/70 rounded-xl p-3 border border-border/50">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{m.author_name}</span>
                              <span className={cn("text-[9px] uppercase font-mono font-bold px-1.5 py-0.2 rounded border", roleBadge.style)}>
                                {roleBadge.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : ""}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                            {m.content}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer (Active thread only) */}
              {creationThread?.status === "active" ? (
                <form onSubmit={handlePostThreadMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={threadMsgInput}
                    onChange={(e) => setThreadMsgInput(e.target.value)}
                    placeholder="Contribute architectural clarification, feasibility insight, or guidance…"
                    disabled={postingThreadMsg}
                    className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={postingThreadMsg || !threadMsgInput.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {postingThreadMsg ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    <span>Send</span>
                  </button>
                </form>
              ) : (
                <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Lock className="size-3.5 text-muted-foreground shrink-0" />
                  <span>Deliberation thread is finalized. Discussions are locked for project execution.</span>
                </div>
              )}
            </div>
          )}

          {/* Team Collaboration Channel (Phase 10) */}
          <div className="panel p-6 mb-8 border-border bg-card/80">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                    <MessageSquare className="size-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-foreground">
                      Team Collaboration Channel
                    </h2>
                    <p className="text-eyebrow text-[10px]">
                      Project-scoped discussions & task-linked threads with passive PM monitoring
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewThreadModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-glow"
                >
                  <Plus className="size-3.5" /> Start Thread
                </button>
              </div>
            </div>

            {!teamChannel || teamChannel.threads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/10">
                <MessageSquare className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="font-semibold text-xs text-foreground">No collaboration threads yet</p>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
                  Start a team discussion or link a thread to a specific task to coordinate with assigned developers and track blockers.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewThreadModal(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
                >
                  <Plus className="size-3.5 text-primary" /> Create First Thread
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Threads Sidebar */}
                <div className="lg:col-span-4 space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  <div className="text-[11px] font-semibold text-muted-foreground px-1 pb-1">
                    Threads ({teamChannel.threads.length})
                  </div>
                  {teamChannel.threads.map((th) => {
                    const tid = th.id || th._id;
                    const isSelected = tid === (activeThread?.id || activeThread?._id);
                    const thLinkedTask = th.linked_task_id
                      ? tasks.find((t) => (t.id || t._id) === th.linked_task_id)
                      : null;
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => setActiveThreadId(tid || null)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                            : "border-border/60 bg-card/60 hover:bg-card hover:border-border"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-foreground truncate">{th.topic}</span>
                          {th.flagged_for_review && (
                            <span
                              className="shrink-0 size-2.5 rounded-full bg-amber-400 animate-pulse"
                              title="PM Agent: Unresolved Disagreement Flagged"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{th.messages?.length || 0} msgs</span>
                          <span>·</span>
                          <span>
                            {th.created_at
                              ? format(parseISO(th.created_at), "MMM d, h:mm a")
                              : "Recently"}
                          </span>
                        </div>
                        {thLinkedTask && (
                          <div className="flex items-center gap-1 text-[10px] text-primary truncate max-w-[220px]">
                            <Network className="size-2.5 shrink-0" />
                            <span className="truncate">{thLinkedTask.title}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Thread Detail & Messages */}
                <div className="lg:col-span-8 flex flex-col min-h-[460px] panel p-4 bg-card/40 border-border/70 space-y-3.5">
                  {activeThread ? (
                    <>
                      {/* Active Thread Header */}
                      <div className="border-b border-border pb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-bold text-sm text-foreground truncate">
                            {activeThread.topic}
                          </h3>
                          <p className="text-[10px] text-muted-foreground">
                            Started by{" "}
                            <span className="font-semibold text-foreground">
                              {allEmployees.find((e) => e.id === activeThread.created_by)?.full_name ||
                                activeThread.created_by}
                            </span>
                          </p>
                        </div>

                        {activeThread.linked_task_id && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Network className="size-3" />
                            <span>
                              {tasks.find((t) => (t.id || t._id) === activeThread.linked_task_id)?.title ||
                                "Linked Task"}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* PM Passive Monitoring Disagreement Banner */}
                      {activeThread.flagged_for_review && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5">
                          <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                            <span>PM Agent Flagged: Unresolved Disagreement (&gt;24h)</span>
                          </div>
                          {activeThread.flagged_reason && (
                            <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                              <strong>Reason:</strong> {activeThread.flagged_reason}
                            </p>
                          )}
                          {activeThread.suggested_resolution && (
                            <div className="text-xs text-amber-100/90 bg-amber-500/15 rounded-lg p-2.5 mt-1 border border-amber-500/20">
                              <strong className="text-amber-300">Suggested Resolution:</strong>{" "}
                              {activeThread.suggested_resolution}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Messages Stream */}
                      <div className="flex-1 space-y-3 max-h-[320px] overflow-y-auto p-3 rounded-xl bg-background/50 border border-border/50">
                        {!activeThread.messages || activeThread.messages.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-8 text-center">
                            No messages in this thread yet. Post the first message below.
                          </p>
                        ) : (
                          activeThread.messages.map((m, idx) => {
                            const authorEmp = allEmployees.find((e) => e.id === m.author_id);
                            const isMe = userProfile?.id === m.author_id;
                            return (
                              <div key={idx} className="flex items-start gap-2.5">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-[10px] font-bold text-primary uppercase">
                                  {(authorEmp?.full_name || m.author_id).slice(0, 2)}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-semibold text-foreground truncate">
                                      {authorEmp?.full_name || m.author_id}
                                      {isMe && <span className="ml-1 text-[9px] text-primary font-normal">(You)</span>}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {m.created_at ? format(parseISO(m.created_at), "h:mm a · MMM d") : ""}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap leading-relaxed">
                                    {m.content}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Thread Reply Composer */}
                      <form onSubmit={handlePostChannelReply} className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={threadReplyInput}
                          onChange={(e) => setThreadReplyInput(e.target.value)}
                          placeholder="Reply to thread (dependency phrases like 'blocked on...' are monitored by PM)..."
                          disabled={sendingThreadReply}
                          className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={sendingThreadReply || !threadReplyInput.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          {sendingThreadReply ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                          <span>Reply</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <MessageSquare className="size-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs font-semibold">Select a thread to view discussion</p>
                    </div>
                  )}
                </div>
              </div>
            )}
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

      {/* Invite Subject Matter Expert Modal */}
      {showSmeModal && project && (
        <InviteSMEModal
          projectName={project.title}
          allEmployees={allEmployees}
          invitedExperts={creationThread?.invited_experts || []}
          selectedUserId={selectedSmeUserId}
          onSelectUser={setSelectedSmeUserId}
          loading={smeInviteLoading}
          onClose={() => {
            setShowSmeModal(false);
            setSelectedSmeUserId("");
          }}
          onSubmit={handleInviteSme}
        />
      )}

      {/* New Thread Modal (Phase 10) */}
      {showNewThreadModal && (
        <NewThreadModal
          tasks={tasks}
          topic={newThreadTopic}
          linkedTaskId={newThreadLinkedTaskId}
          initialMsg={newThreadInitialMsg}
          loading={creatingThread}
          onChangeTopic={setNewThreadTopic}
          onChangeLinkedTask={setNewThreadLinkedTaskId}
          onChangeInitialMsg={setNewThreadInitialMsg}
          onClose={() => {
            setShowNewThreadModal(false);
            setNewThreadTopic("");
            setNewThreadLinkedTaskId("");
            setNewThreadInitialMsg("");
          }}
          onSubmit={handleCreateThread}
        />
      )}

      {/* Direct Message Modal (Phase 10) */}
      {activeDmUser && (
        <DirectMessageModal
          targetUser={activeDmUser}
          currentUserId={userProfile?.id}
          directMessage={activeDm}
          input={dmInput}
          loading={loadingDm}
          sending={sendingDm}
          onChangeInput={setDmInput}
          onClose={() => {
            setActiveDmUser(null);
            setActiveDm(null);
            setDmInput("");
          }}
          onSubmit={handleSendDm}
        />
      )}
    </AppShell>
  );
}

function InviteSMEModal({
  projectName,
  allEmployees,
  invitedExperts,
  selectedUserId,
  onSelectUser,
  loading,
  onClose,
  onSubmit,
}: {
  projectName: string;
  allEmployees: UserProfile[];
  invitedExperts: InvitedExpert[];
  selectedUserId: string;
  onSelectUser: (id: string) => void;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const activeExpertIds = (invitedExperts || [])
    .filter((e) => !e.revoked_at)
    .map((e) => e.user_id);
  const availableExperts = allEmployees.filter((e) => !activeExpertIds.includes(e.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
              <UserPlus className="size-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-foreground">Invite Subject Matter Expert</h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-xs">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Invited SMEs gain scoped access exclusively to this project's Creation Deliberation thread. Sensitive financial metrics, rates, and resource capacity are strictly redacted.
        </p>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-foreground">Select Team Member / Expert</label>
          {availableExperts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              All active team members are already participating in this deliberation thread.
            </p>
          ) : (
            <select
              value={selectedUserId}
              onChange={(e) => onSelectUser(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">-- Choose an expert from your organization --</option>
              {availableExperts.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.dynamicRole?.title || emp.role_title || "Contributor"})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!selectedUserId || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
            <span>Send Invitation</span>
          </button>
        </div>
      </div>
    </div>
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

function NewThreadModal({
  tasks,
  topic,
  linkedTaskId,
  initialMsg,
  loading,
  onChangeTopic,
  onChangeLinkedTask,
  onChangeInitialMsg,
  onClose,
  onSubmit,
}: {
  tasks: Task[];
  topic: string;
  linkedTaskId: string;
  initialMsg: string;
  loading: boolean;
  onChangeTopic: (v: string) => void;
  onChangeLinkedTask: (v: string) => void;
  onChangeInitialMsg: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-foreground">Start Collaboration Thread</h3>
              <p className="text-[11px] text-muted-foreground">General project discussion or task-linked thread</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-foreground">Topic / Discussion Subject *</label>
            <input
              type="text"
              required
              value={topic}
              onChange={(e) => onChangeTopic(e.target.value)}
              placeholder="e.g. Database schema migration strategy"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-foreground">Linked Task (Optional)</label>
            <select
              value={linkedTaskId}
              onChange={(e) => onChangeLinkedTask(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">-- General Team Thread (No Task) --</option>
              {tasks.map((t) => (
                <option key={t.id || t._id} value={t.id || t._id}>
                  {t.title} ({t.status})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              If linked to a task, thread visibility is scoped based on employee role tiers and task dependencies.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-foreground">Initial Message (Optional)</label>
            <textarea
              rows={3}
              value={initialMsg}
              onChange={(e) => onChangeInitialMsg(e.target.value)}
              placeholder="Provide context, question, or architectural proposal..."
              className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim() || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>Create Thread</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DirectMessageModal({
  targetUser,
  currentUserId,
  directMessage,
  input,
  loading,
  sending,
  onChangeInput,
  onClose,
  onSubmit,
}: {
  targetUser: UserProfile;
  currentUserId?: string;
  directMessage: DirectMessage | null;
  input: string;
  loading: boolean;
  sending: boolean;
  onChangeInput: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-lg p-5 shadow-2xl space-y-3 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-xl bg-primary/15 flex items-center justify-center font-bold text-primary text-xs shrink-0">
              {targetUser.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-sm text-foreground truncate">{targetUser.full_name}</h3>
                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.2 text-[9px] font-semibold text-muted-foreground">
                  {targetUser.dynamicRole?.title || targetUser.role_title || "Team Member"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{targetUser.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        {/* Security / Scope Banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Lock className="size-3 text-primary shrink-0" />
          <span>Project-scoped direct message. Encrypted and accessible only by you and {targetUser.full_name}.</span>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 rounded-xl bg-background/60 border border-border/50 min-h-[220px] max-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-xs">Loading conversation history…</p>
            </div>
          ) : !directMessage?.messages || directMessage.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-1.5">
              <MessageCircle className="size-7 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No direct messages yet</p>
              <p className="text-[11px]">Send a message to start a 1-on-1 discussion within this project context.</p>
            </div>
          ) : (
            directMessage.messages.map((m, idx) => {
              const isMe = m.author_id === currentUserId;
              return (
                <div
                  key={idx}
                  className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-xs"
                        : "bg-card border border-border/80 text-foreground rounded-bl-xs shadow-xs"
                    )}
                  >
                    {m.content}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5 px-1 font-mono">
                    <span>{m.created_at ? format(parseISO(m.created_at), "h:mm a") : ""}</span>
                    {isMe && m.read_at && (
                      <span className="text-primary font-sans font-medium flex items-center gap-0.5">
                        <CheckCircle2 className="size-2.5" /> Read
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <form onSubmit={onSubmit} className="flex gap-2 pt-1">
          <input
            type="text"
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder={`Message ${targetUser.full_name}…`}
            disabled={sending}
            className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}


import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  UserPlus,
  X,
  Loader2,
  ArrowRight,
  Shield,
  Briefcase,
  Layers,
  Trash2,
  Users,
  CheckCircle2,
  AlertCircle,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getAllEmployees, createEmployee, deleteEmployee, getWorkforceStats } from "@/lib/db";
import type { UserProfile } from "@/lib/types";
import { isElevatedPriority, normalizePriority } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<{
    totalEmployees: number;
    unallocatedCount: number;
    multiProjectCount: number;
    activeCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, st] = await Promise.all([getAllEmployees(), getWorkforceStats()]);
      setEmployees(data);
      setStats(st);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the company directory? This will also unassign them from all projects.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteEmployee(id);
      toast.success(`${name} removed from workforce directory.`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove employee");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell
      eyebrow={`Human Resources Management · ${employees.length} Total Employees`}
      title="Company Workforce & Team Allocations"
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <UserPlus className="size-4" /> Add Employee
        </button>
      }
    >
      {/* Workforce High-Level Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="panel p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-eyebrow text-[9px]">Total Headcount</p>
            <p className="font-display text-2xl font-bold text-foreground">{employees.length}</p>
            <p className="text-[10px] text-muted-foreground">Actual company employees</p>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <p className="text-eyebrow text-[9px]">Active on Projects</p>
            <p className="font-display text-2xl font-bold text-success">
              {stats?.activeCount ?? employees.filter((e) => (e.projectCount || 0) > 0).length}
            </p>
            <p className="text-[10px] text-muted-foreground">Allocated to ≥1 project</p>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-eyebrow text-[9px]">Multi-Project Staff</p>
            <p className="font-display text-2xl font-bold text-amber-400">
              {stats?.multiProjectCount ?? employees.filter((e) => (e.projectCount || 0) > 1).length}
            </p>
            <p className="text-[10px] text-muted-foreground">Working on &gt;1 project</p>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <AlertCircle className="size-5" />
          </span>
          <div>
            <p className="text-eyebrow text-[9px]">Available / Bench</p>
            <p className="font-display text-2xl font-bold text-muted-foreground">
              {stats?.unallocatedCount ?? employees.filter((e) => (e.projectCount || 0) === 0).length}
            </p>
            <p className="text-[10px] text-muted-foreground">0 assigned projects</p>
          </div>
        </div>
      </div>

      {/* Directory Grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="panel h-36 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="panel p-12 flex flex-col items-center text-center">
          <Shield className="size-12 text-muted-foreground/30 mb-4" />
          <h2 className="font-display text-lg font-bold text-foreground">No employees yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first team member to start staffing projects.</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-glow"
          >
            <UserPlus className="size-4" /> Add First Employee
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((emp) => {
            const assignedProjects = emp.assignedProjects || [];
            const hasMultiple = assignedProjects.length > 1;
            const hasHighPriority = assignedProjects.some((p) => isElevatedPriority(normalizePriority(p.priority)));

            return (
              <div
                key={emp.id}
                className="panel p-5 flex flex-col justify-between hover:border-primary/40 transition-all group relative bg-card"
              >
                <div>
                  {/* Top Bar with Avatar, Name, and Delete */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <Link
                      to="/pm/employees/$employeeId"
                      params={{ employeeId: emp.id }}
                      className="flex items-center gap-3 min-w-0 flex-1 group/name"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-display text-sm font-bold text-primary">
                        {emp.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground group-hover/name:text-primary transition-colors truncate text-sm">
                          {emp.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{emp.role_title || "Contributor"}</p>
                        <p className="text-eyebrow text-[9px] mt-0.5 truncate text-muted-foreground">{emp.email}</p>
                      </div>
                    </Link>

                    <button
                      onClick={() => handleDelete(emp.id, emp.full_name)}
                      disabled={deletingId === emp.id}
                      className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                      title="Remove employee from directory"
                    >
                      {deletingId === emp.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                        emp.status === "active"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {emp.status}
                    </span>

                    {hasMultiple && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] text-amber-400 font-semibold">
                        {assignedProjects.length} Projects
                      </span>
                    )}

                    {hasHighPriority && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] text-red-400 font-bold">
                        <Flame className="size-2.5" /> High Priority Active
                      </span>
                    )}
                  </div>

                  {/* Allocated Projects List */}
                  <div className="pt-2.5 border-t border-border/60">
                    <p className="text-eyebrow text-[9px] text-muted-foreground mb-1.5">
                      Assigned Projects ({assignedProjects.length})
                    </p>
                    {assignedProjects.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No projects allocated yet.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                        {assignedProjects.map((p) => {
                          const priority = normalizePriority(p.priority);
                          const isHigh = isElevatedPriority(priority);
                          return (
                            <span
                              key={p._id}
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[10px] font-medium truncate max-w-[200px]",
                                isHigh
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold"
                                  : "border-border bg-elevated text-foreground"
                              )}
                            >
                              {isHigh && "🔥 "}
                              {p.title}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {emp.activeTasksCount || 0} Active Task{emp.activeTasksCount !== 1 ? "s" : ""}
                  </span>
                  <Link
                    to="/pm/employees/$employeeId"
                    params={{ employeeId: emp.id }}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <span>360° Analysis</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AddEmployeeModal
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

function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setLoading(true);
    try {
      await createEmployee({
        email,
        full_name: name,
        role_title: role || "Team Member",
      });
      toast.success(`${name} added to the company directory`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Add New Employee</h2>
            <p className="text-eyebrow text-[10px]">Add team member to company directory</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-eyebrow mb-1.5 block">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya Lin"
              required
              className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div>
            <label className="text-eyebrow mb-1.5 block">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maya@company.com"
              required
              className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div>
            <label className="text-eyebrow mb-1.5 block">Role / Job Title</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Full Stack Developer, DevOps Lead"
              className="w-full rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
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
              {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {loading ? "Adding…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

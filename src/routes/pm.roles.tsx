import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  X,
  Loader2,
  ShieldCheck,
  Tag,
  Clock,
  Briefcase,
  Edit2,
  Trash2,
  AlertCircle,
  Sparkles,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import { getRoles, createDynamicRole, updateDynamicRole, deleteDynamicRole } from "@/lib/db";
import type { DynamicRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/roles")({
  component: DynamicRolesPage,
});

const DOMAIN_OPTIONS = [
  "Architecture",
  "Engineering",
  "Design",
  "QA",
  "Product",
  "Marketing",
  "Operations",
  "Security",
];

const DOMAIN_COLORS: Record<string, string> = {
  Architecture: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  Engineering: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Design: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  QA: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Product: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Marketing: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Operations: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  Security: "bg-red-500/10 text-red-400 border-red-500/30",
};

function DynamicRolesPage() {
  const { userProfile } = useAuth();
  const isProductLead = userProfile?.user_type === "product_lead" || userProfile?.user_type === "pm";

  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("Engineering");
  const [description, setDescription] = useState("");
  const [defaultCap, setDefaultCap] = useState(8);
  const [skillTags, setSkillTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles();
      setRoles(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load dynamic roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openCreateModal = () => {
    setEditingRole(null);
    setTitle("");
    setDomain("Engineering");
    setDescription("");
    setDefaultCap(8);
    setSkillTags(["Node.js", "API Design"]);
    setTagInput("");
    setModalOpen(true);
  };

  const openEditModal = (role: DynamicRole) => {
    setEditingRole(role);
    setTitle(role.title);
    setDomain(role.domain);
    setDescription(role.description || "");
    setDefaultCap(role.defaultDailyCapHours || 8);
    setSkillTags(role.skillTags || []);
    setTagInput("");
    setModalOpen(true);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (skillTags.includes(trimmed)) {
      toast.error("Skill tag already added");
      return;
    }
    setSkillTags([...skillTags, trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setSkillTags(skillTags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Role title is required");
      return;
    }
    if (!domain.trim()) {
      toast.error("Domain is required");
      return;
    }

    setSaving(true);
    try {
      if (editingRole) {
        await updateDynamicRole(editingRole.id || editingRole._id!, {
          title: title.trim(),
          domain: domain.trim(),
          description: description.trim(),
          defaultDailyCapHours: defaultCap,
          skillTags,
        });
        toast.success(`Role '${title}' updated successfully`);
      } else {
        await createDynamicRole({
          title: title.trim(),
          domain: domain.trim(),
          description: description.trim(),
          defaultDailyCapHours: defaultCap,
          skillTags,
        });
        toast.success(`New dynamic role '${title}' created`);
      }
      setModalOpen(false);
      loadRoles();
    } catch (err: any) {
      toast.error(err.message || "Failed to save dynamic role");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: DynamicRole) => {
    const id = role.id || role._id!;
    if (!confirm(`Are you sure you want to delete role '${role.title}'? This action is logged to the Audit Registry.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteDynamicRole(id);
      toast.success(`Role '${role.title}' deleted`);
      setRoles(roles.filter((r) => (r.id || r._id) !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete role");
    } finally {
      setDeletingId(null);
    }
  };

  // Summary Metrics
  const domainCount = new Set(roles.map((r) => r.domain)).size;
  const avgCap = roles.length
    ? (roles.reduce((acc, r) => acc + (r.defaultDailyCapHours || 8), 0) / roles.length).toFixed(1)
    : "8.0";

  return (
    <AppShell
      title="Dynamic Role Engine"
      eyebrow="Governance & Workforce Architecture"
      actions={
        isProductLead && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
          >
            <Plus className="size-4" />
            Define Dynamic Role
          </button>
        )
      }
    >
      <div className="space-y-6">
        {/* Permission Guard Notice if not Product Lead */}
        {!isProductLead && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 flex items-start gap-3">
            <AlertCircle className="size-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Product Lead Sovereign Authority Required</p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Dynamic roles define the global capability taxonomy and capacity caps for the organization.
                You are currently viewing roles in read-only mode.
              </p>
            </div>
          </div>
        )}

        {/* Executive Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dynamic Roles</span>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground tracking-tight">{roles.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Configured organizational capabilities</p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Domains</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Layers className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground tracking-tight">{domainCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Functional specialization areas</p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Average Daily Cap</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Clock className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-foreground tracking-tight">{avgCap} <span className="text-base font-medium text-muted-foreground">hrs/day</span></p>
            <p className="text-[11px] text-muted-foreground mt-1">Default workload limit per role</p>
          </div>
        </div>

        {/* Roles Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Loading Dynamic Role Engine...</p>
          </div>
        ) : roles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <ShieldCheck className="size-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-bold text-foreground">No Dynamic Roles Defined</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Define specialized roles with domain skill tags and daily capacity caps to assign team members to projects.
            </p>
            {isProductLead && (
              <button
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-3.5" />
                Define First Role
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {roles.map((role) => {
              const id = role.id || role._id!;
              const domainClass = DOMAIN_COLORS[role.domain] || "bg-secondary text-secondary-foreground border-border";

              return (
                <div
                  key={id}
                  className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card/80 p-5 shadow-xs hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div>
                    {/* Domain & Cap Header */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={cn("inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", domainClass)}>
                        {role.domain}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-secondary/80 px-2 py-0.5 text-[11px] font-mono font-semibold text-foreground">
                        <Clock className="size-3 text-primary" />
                        {role.defaultDailyCapHours || 8}h/day cap
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                      {role.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                      {role.description || "No description provided."}
                    </p>

                    {/* Skill Tags */}
                    <div className="mt-4 pt-3 border-t border-border/40">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Tag className="size-3" />
                        Skills Taxonomy ({role.skillTags?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {role.skillTags && role.skillTags.length > 0 ? (
                          role.skillTags.map((skill, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-md bg-secondary/90 px-2 py-0.5 text-[10px] font-medium text-foreground/90 border border-border/50"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">No skill tags listed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions (Product Lead only) */}
                  {isProductLead && (
                    <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(role)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                        title="Edit Dynamic Role"
                      >
                        <Edit2 className="size-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        disabled={deletingId === id}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        title="Delete Dynamic Role"
                      >
                        {deletingId === id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
            <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      {editingRole ? "Edit Dynamic Role" : "Define New Dynamic Role"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Governs allocation capacity and technical skills verification
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Role Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Lead Solutions Architect"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Domain & Daily Cap */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Domain <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {DOMAIN_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Daily Cap (Hours) <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="1"
                        max="24"
                        value={defaultCap}
                        onChange={(e) => setDefaultCap(Number(e.target.value))}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-12"
                      />
                      <span className="absolute right-3 top-2 text-xs text-muted-foreground font-mono">hrs</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Description & Scope
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Key responsibilities, technical expectations, and delivery standards..."
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Skill Tags */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Skill Tags Taxonomy
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add a skill (e.g. Distributed Systems)..."
                      className="flex-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Rendered Chips */}
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-xl bg-secondary/30 border border-border/50">
                    {skillTags.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">No tags added yet. Type and click Add.</span>
                    ) : (
                      skillTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 text-xs font-medium"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-destructive transition-colors ml-0.5"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {saving && <Loader2 className="size-3.5 animate-spin" />}
                    {editingRole ? "Save Changes" : "Create Dynamic Role"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

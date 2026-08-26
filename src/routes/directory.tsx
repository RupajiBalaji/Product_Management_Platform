import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, UserMinus, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Panel, Pill, SectionHeading, UtilizationBar } from "@/components/primitives";
import { employees, getRole, globalLedger, roles } from "@/lib/platform-data";

export const Route = createFileRoute("/directory")({
  head: () => ({
    meta: [
      { title: "Directory & Dynamic Roles — Autonomous PM" },
      {
        name: "description",
        content:
          "Global employee directory with timezone configuration, semantic skill-tagged dynamic roles, emergency offboarding and mid-sprint onboarding.",
      },
      { property: "og:title", content: "Directory & Dynamic Roles — Autonomous PM" },
      { property: "og:description", content: "Role blueprinting, offboarding and onboarding engines." },
    ],
  }),
  component: DirectoryPage,
});

function DirectoryPage() {
  return (
    <AppShell
      eyebrow="Dynamic Role & Competency Engine"
      title="Directory & Roles"
      actions={
        <button
          onClick={() => toast.success("New dynamic role drafted — awaiting your competency description")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> New Role
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow="Global directory"
            title="Employees"
            description="Timezone-aware profiles feeding the capacity ledger and handoff-window calculations."
          />
          <div className="space-y-3">
            {employees.map((e) => {
              const ledger = globalLedger.find((l) => l.employee.id === e.id)!;
              return (
                <Panel key={e.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-elevated font-mono text-xs font-bold text-primary">
                        {e.initials}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getRole(e.roleId).title} · {e.timezone}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.status === "On Leave" && <Pill tone="warning">On leave</Pill>}
                      <Pill tone={e.reliability >= 90 ? "success" : e.reliability >= 80 ? "accent" : "warning"}>
                        {e.reliability}% on-time
                      </Pill>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <UtilizationBar pct={ledger.pct} />
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          toast.success(
                            `Offboarding protocol armed for ${e.name}: orphan audit running, successor search ranked`,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/20"
                      >
                        <UserMinus className="size-3" /> Remove from project
                      </button>
                      <button
                        onClick={() =>
                          toast.success(
                            `Onboarding brief generated for ${e.name}: PRD highlights, sprint status, ramp-up queue seeded`,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-foreground hover:border-primary/40"
                      >
                        <UserPlus className="size-3" /> Onboard mid-sprint
                      </button>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>

        <div>
          <SectionHeading
            eyebrow="CEO-managed blueprints"
            title="Dynamic role definitions"
            description="The Agent reads each role's description and skill tags to perform semantic task routing."
          />
          <div className="space-y-3">
            {roles.map((r) => (
              <Panel key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.domain} · default cap {r.dailyCap.toFixed(1)} hrs/day
                    </p>
                  </div>
                  <button
                    onClick={() => toast.success(`${r.title} — competency description opened for editing`)}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.description}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.skills.map((sk) => (
                    <Pill key={sk} tone="accent">
                      {sk}
                    </Pill>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="border-destructive/40">
          <p className="text-eyebrow">Edge Case #3 · Critical</p>
          <h3 className="mt-1 font-display text-base font-semibold text-foreground">
            Emergency offboarding & succession
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Simulated: Sarah Chen departs with 140 remaining hours on the Notification Engine.
          </p>
          <div className="mt-4 space-y-2">
            {[
              ["A", "Reassign all 140 hrs to Alex Rivera — 92% skill match, 1.5 hrs/day free"],
              ["B", "Split: API work → Alex, DB work → David (both skill-matched)"],
              ["C", "Hire external contractor — role spec auto-generated"],
            ].map(([k, v]) => (
              <button
                key={k}
                onClick={() => toast.success(`Successor option ${k} applied — knowledge transfer brief dispatched`)}
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40"
              >
                <span className="font-mono text-xs text-primary">Option {k}:</span> {v}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Transfer brief auto-includes: completed work inventory, incomplete scope, relevant PRD
            sections, and direct links to every related submission.
          </p>
        </Panel>

        <Panel>
          <p className="text-eyebrow">Edge Case #4 · Critical</p>
          <h3 className="mt-1 font-display text-base font-semibold text-foreground">
            Mid-sprint onboarding engine
          </h3>
          <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <span className="font-mono text-xs text-primary">01</span> Select from directory,
              assign dynamic role + Gantt visibility tier.
            </li>
            <li>
              <span className="font-mono text-xs text-primary">02</span> Personalized context brief:
              executive summary, role-relevant PRD highlights, sprint status, live task queue.
            </li>
            <li>
              <span className="font-mono text-xs text-primary">03</span> Resource model recalculated;
              any accelerated deliverables reported with a new projected date.
            </li>
            <li>
              <span className="font-mono text-xs text-primary">04</span> First tasks seeded with
              minimal upstream dependencies for a smooth ramp-up.
            </li>
          </ol>
        </Panel>
      </div>
    </AppShell>
  );
}

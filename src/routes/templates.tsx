import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Panel, Pill, SectionHeading } from "@/components/primitives";
import { templates } from "@/lib/platform-data";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Template Library — Autonomous PM" },
      {
        name: "description",
        content:
          "Reusable project blueprints: capture on completion, one-click clone with full PRD, task graph and role requirements, independent template versioning.",
      },
      { property: "og:title", content: "Template Library — Autonomous PM" },
      { property: "og:description", content: "Clone proven project structures in one click." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const navigate = useNavigate();
  return (
    <AppShell
      eyebrow="Edge Case #13 · Operational Polish"
      title="Template Library"
      actions={
        <button
          onClick={() => toast.success("Blank template drafted — structure, roles and phases are editable")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-sm text-foreground hover:border-primary/40"
        >
          <Plus className="size-4" /> Author from scratch
        </button>
      }
    >
      <SectionHeading
        title="One-click project cloning"
        description="Cloning pre-populates the full PRD structure, task dependency graph and role requirements. Adjust assignments, deadlines and scope before launch."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((t) => (
          <Panel key={t.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-foreground">{t.name}</h3>
              <Pill tone="muted">{t.version}</Pill>
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{t.note}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              {[
                [String(t.roles), "roles"],
                [String(t.phases), "phases"],
                [String(t.weeks), "weeks"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="font-display text-base font-semibold text-foreground">{v}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {l}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Cloned {t.uses} times
            </p>
            <button
              onClick={() => {
                toast.success(`${t.name} cloned — sandbox pre-populated, awaiting your adjustments`);
                navigate({ to: "/new" });
              }}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Copy className="size-3.5" /> Clone & customize
            </button>
          </Panel>
        ))}
      </div>

      <Panel className="mt-6">
        <p className="text-eyebrow">Capture & evolution</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {[
            ["Save as Template", "On completion, capture PRD structure, task breakdown, roles, dependencies and timeline proportions."],
            ["Version independently", "Templates evolve on their own track — update the master as workflows improve across iterations."],
            ["Governed reuse", "Cloned sandboxes still run the full deliberation, capacity validation and activation gate."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-md border border-border bg-elevated p-4">
              <p className="text-sm font-medium text-foreground">{h}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}

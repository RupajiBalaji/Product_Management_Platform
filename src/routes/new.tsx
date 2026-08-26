import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderKanban,
  LockKeyhole,
  Rocket,
  Upload,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AgentBubble, OptionChoice, Panel, Pill, SectionHeading } from "@/components/primitives";
import { employees, roles } from "@/lib/platform-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "New Project — Autonomous PM" },
      {
        name: "description",
        content:
          "Instantiate an isolated project sandbox: intent narrative, document drawer, deliberation matrix, dynamic roles and the final activation gate.",
      },
      { property: "og:title", content: "New Project — Autonomous PM" },
      { property: "og:description", content: "Socratic PRD synthesis and one-click authorization." },
    ],
  }),
  component: NewProject,
});

const steps = [
  { n: 1, label: "Intent & Documents", icon: FileText },
  { n: 2, label: "Deliberation Matrix", icon: FolderKanban },
  { n: 3, label: "Team & Visibility", icon: Users },
  { n: 4, label: "Activation Gate", icon: Rocket },
];

const decisionGroups = [
  {
    key: "arch",
    label: "Architecture Pattern",
    options: [
      { label: "Event-Driven Microservices", detail: "Async workers, broker-backed, horizontal scale" },
      { label: "Modular Monolith", detail: "Single deployable, strict module boundaries" },
    ],
  },
  {
    key: "db",
    label: "Database Engine",
    options: [
      { label: "PostgreSQL", detail: "Relational integrity, JSONB flexibility, row-level security" },
      { label: "MongoDB", detail: "Document model, flexible schema evolution" },
    ],
  },
  {
    key: "auth",
    label: "Authentication Scheme",
    options: [
      { label: "SSO + SAML/OIDC", detail: "Enterprise IdP federation" },
      { label: "Magic link + passkeys", detail: "Passwordless, consumer-friendly" },
    ],
  },
  {
    key: "cache",
    label: "Caching Layer",
    options: [
      { label: "Redis (recommended)", detail: "Edge rate-limiting and queue co-location" },
      { label: "No cache layer", detail: "Gap flagged — flagged as risk, kept minimal" },
    ],
  },
];

type TeamPick = { employeeId: string; roleId: string; hours: number; visibility: string };

function NewProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [team, setTeam] = useState<TeamPick[]>(
    employees.slice(0, 4).map((e) => ({
      employeeId: e.id,
      roleId: e.roleId,
      hours: Math.min(4, e.dailyCap),
      visibility: "Own + Dependencies",
    })),
  );

  const allChosen = decisionGroups.every((g) => choices[g.key] !== undefined);
  const stepOk = useMemo(() => {
    if (step === 1) return title.trim().length > 3 && intent.trim().length > 20;
    if (step === 2) return allChosen;
    if (step === 3) return team.length > 0;
    return true;
  }, [step, title, intent, allChosen, team]);

  return (
    <AppShell eyebrow="Sandbox Instantiation" title="New Project">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {steps.map((s) => (
            <button
              key={s.n}
              onClick={() => s.n < step && setStep(s.n)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-colors",
                step === s.n
                  ? "border-primary/60 bg-primary/10"
                  : s.n < step
                    ? "border-success/40 bg-card"
                    : "border-border bg-card opacity-60",
              )}
            >
              <s.icon
                className={cn(
                  "size-4 shrink-0",
                  step === s.n ? "text-primary" : s.n < step ? "text-success" : "text-muted-foreground",
                )}
              />
              <span className="text-xs font-medium text-foreground">
                {s.n}. {s.label}
              </span>
            </button>
          ))}
        </div>

        {step === 1 && (
          <Panel>
            <SectionHeading
              eyebrow="Step 1"
              title="Project initiation"
              description="Three foundational inputs. Everything downstream — PRD, capacity model, task queues — derives from these."
            />
            <div className="space-y-5">
              <div>
                <label className="text-eyebrow">1 · Project title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Enterprise Real-Time Notification Engine"
                  className="mt-2 w-full rounded-md border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                />
              </div>
              <div>
                <label className="text-eyebrow">2 · Executive user intent</label>
                <textarea
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  rows={5}
                  placeholder="What must be built, target users, business objectives and desired outcomes…"
                  className="mt-2 w-full resize-none rounded-md border border-input bg-elevated px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                />
              </div>
              <div>
                <label className="text-eyebrow">3 · Document upload drawer</label>
                <button
                  onClick={() => {
                    const next = `architecture-brief-${docs.length + 1}.pdf`;
                    setDocs((d) => [...d, next]);
                    toast.success(`${next} parsed — 0 conflicts detected`);
                  }}
                  className="mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-elevated/60 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Upload className="size-5" />
                  Drag PDFs, architectural briefs, chat logs, voice transcripts
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    role-bound validation · 100 MB per file cap
                  </span>
                </button>
                {docs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {docs.map((d) => (
                      <Pill key={d} tone="accent">
                        <FileText className="size-3" /> {d}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <AgentBubble label="AI PM Agent — cognitive deliberation">
              <p>
                Deliberation complete over your intent{docs.length ? ` and ${docs.length} uploaded
                document${docs.length > 1 ? "s" : ""}` : ""}. I ran edge-case analysis
                (concurrency, latency, failure fallback, unstated assumptions) and gap detection
                across the stack. <span className="text-warning">1 gap flagged:</span> no caching
                layer was implied — required for per-tenant rate limiting.
              </p>
              <p>
                Select one option per decision below. No typing needed — click to resolve the
                architecture matrix.
              </p>
            </AgentBubble>
            {decisionGroups.map((g) => (
              <Panel key={g.key}>
                <p className="text-eyebrow">{g.label}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {g.options.map((o, i) => (
                    <OptionChoice
                      key={o.label}
                      label={o.label}
                      detail={o.detail}
                      selected={choices[g.key] === i}
                      onClick={() => setChoices((c) => ({ ...c, [g.key]: i }))}
                    />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}

        {step === 3 && (
          <Panel>
            <SectionHeading
              eyebrow="Step 3"
              title="Dynamic roles, capacity & Gantt visibility"
              description="The Agent routes tasks semantically using role descriptions and skill tags. Allocations are validated against the Global Capacity Ledger."
            />
            <div className="space-y-3">
              {team.map((t, i) => {
                const e = employees.find((x) => x.id === t.employeeId)!;
                const r = roles.find((x) => x.id === t.roleId)!;
                const pct = Math.round(((t.hours + e.crossProjectHours) / e.dailyCap) * 100);
                return (
                  <div
                    key={t.employeeId}
                    className="grid gap-3 rounded-lg border border-border bg-elevated p-4 md:grid-cols-4 md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{r.title}</p>
                    </div>
                    <div>
                      <p className="text-eyebrow mb-1">Daily hours</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.5}
                          max={e.dailyCap}
                          step={0.5}
                          value={t.hours}
                          onChange={(ev) =>
                            setTeam((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, hours: +ev.target.value } : x)),
                            )
                          }
                          className="accent-primary"
                        />
                        <span className="w-14 font-mono text-xs text-foreground">
                          {t.hours.toFixed(1)} h
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-1 font-mono text-[10px]",
                          pct > 100 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        Ledger check: {pct}% of cap {pct > 100 ? "— BLOCKED, reduce or override" : "— clear"}
                      </p>
                    </div>
                    <div>
                      <p className="text-eyebrow mb-1">Gantt visibility tier</p>
                      <select
                        value={t.visibility}
                        onChange={(ev) =>
                          setTeam((arr) =>
                            arr.map((x, j) => (j === i ? { ...x, visibility: ev.target.value } : x)),
                          )
                        }
                        className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
                      >
                        <option>Full Data</option>
                        <option>Own Data Only</option>
                        <option>Own + Dependencies</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.skills.map((sk) => (
                        <Pill key={sk} tone="accent">
                          {sk}
                        </Pill>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {step === 4 && (
          <Panel className="border-primary/30">
            <SectionHeading
              eyebrow="Step 4 · Final verification"
              title="Review & activation gate"
              description="Nothing is distributed until you authorize. Task queues stay unpopulated."
            />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-border bg-elevated p-4">
                <p className="text-eyebrow">Initiative</p>
                <p className="mt-1.5 font-display text-sm font-semibold text-foreground">
                  {title || "Untitled initiative"}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{intent}</p>
              </div>
              <div className="rounded-md border border-border bg-elevated p-4">
                <p className="text-eyebrow">Architecture matrix</p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {decisionGroups.map((g) => (
                    <li key={g.key}>
                      <span className="text-foreground">
                        {g.options[choices[g.key] ?? 0].label}
                      </span>{" "}
                      · {g.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border bg-elevated p-4">
                <p className="text-eyebrow">Team & visibility</p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {team.map((t) => (
                    <li key={t.employeeId}>
                      {employees.find((e) => e.id === t.employeeId)!.name} ·{" "}
                      {t.hours.toFixed(1)} h/d · {t.visibility}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <AgentBubble label="AI PM Agent — pre-flight prompt">
              <p>
                The plan above is complete: PRD draft synthesized, resource model computed, Gantt
                tiers configured, ledger checks clear.{" "}
                <span className="text-foreground">
                  Is there anything you would like to adjust or add before we officially launch?
                </span>
              </p>
            </AgentBubble>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  toast.success(
                    "Sandbox locked into active execution — task queues populated, workspaces initialized",
                  );
                  navigate({ to: "/projects/$projectId", params: { projectId: "notification-engine" } });
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-colors hover:bg-primary/90"
              >
                <LockKeyhole className="size-4" /> Authorize & launch workspace
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground hover:border-primary/40"
              >
                Adjust team & milestones
              </button>
            </div>
          </Panel>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/40 disabled:opacity-40"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          {step < 4 && (
            <button
              disabled={!stepOk}
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Continue <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

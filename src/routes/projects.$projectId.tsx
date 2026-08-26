import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Send, CheckCircle2, AlertTriangle, History, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  AgentBubble,
  Metric,
  OptionChoice,
  Panel,
  Pill,
  SectionHeading,
  UserBubble,
  UtilizationBar,
} from "@/components/primitives";
import { GanttChart } from "@/components/gantt";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  changelog,
  directives,
  getEmployee,
  getProject,
  getRole,
  prd,
  projects,
} from "@/lib/platform-data";

export const Route = createFileRoute("/projects/$projectId")({
  loader: ({ params }) => {
    const project = getProject(params.projectId);
    if (!project) throw notFound();
    return { project };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.project.title ?? "Project";
    return {
      meta: [
        { title: `${title} — Command Center` },
        {
          name: "description",
          content: `Isolated sandbox for ${title}: PRD, multi-horizon resource model, Gantt visibility tiers and consequence-gated change control.`,
        },
        { property: "og:title", content: `${title} — Command Center` },
        {
          property: "og:description",
          content: "PRD synthesis, capacity modeling and consequence-gated change requests.",
        },
      ],
    };
  },
  component: CommandCenter,
});

function CommandCenter() {
  const { project } = Route.useLoaderData();
  const sections = prd[project.id] ?? prd["notification-engine"];

  const weekly = (d: number) => d * 5;
  const monthly = (d: number) => d * 20;

  return (
    <AppShell
      eyebrow={`Isolated Sandbox · PRD ${project.prdVersion}`}
      title={project.title}
      actions={
        <div className="hidden items-center gap-2 sm:flex">
          <Pill tone={project.health === "On Track" ? "success" : project.health === "Blocked" ? "danger" : "warning"}>
            {project.health}
          </Pill>
          <Pill tone="muted">{project.state}</Pill>
        </div>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Project Total"
          value={`${project.allocations.reduce((s, a) => s + a.projectTotal, 0)} hrs`}
          sub="Baseline committed labour"
          tone="primary"
        />
        <Metric
          label="Daily Burn"
          value={`${project.allocations.reduce((s, a) => s + a.dailyAllocated, 0).toFixed(1)} hrs`}
          sub="Across assigned contributors"
        />
        <Metric label="Target Date" value={project.targetDate} sub={`${project.weeks}-week horizon`} />
        <Metric
          label="Phase Progress"
          value={`${Math.round(project.phases.reduce((s, p) => s + p.progress, 0) / project.phases.length)}%`}
          sub={`${project.phases.length} workstreams`}
          tone="success"
        />
      </div>

      <Tabs defaultValue="prd">
        <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-card p-1">
          <TabsTrigger value="prd">Master PRD</TabsTrigger>
          <TabsTrigger value="resources">Resource Model</TabsTrigger>
          <TabsTrigger value="gantt">Gantt & Visibility</TabsTrigger>
          <TabsTrigger value="chat">Command Chat</TabsTrigger>
          <TabsTrigger value="history">Time Machine</TabsTrigger>
        </TabsList>

        <TabsContent value="prd">
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              {sections.map((s) => (
                <Panel key={s.heading}>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {s.heading}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  {s.bullets && (
                    <ul className="mt-3 space-y-2">
                      {s.bullets.map((b) => (
                        <li key={b} className="flex gap-2.5 text-sm text-foreground">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="leading-relaxed">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.heading === "Team Composition Matrix" && (
                    <div className="mt-4 space-y-2">
                      {project.allocations.map((a) => {
                        const e = getEmployee(a.employeeId);
                        const r = getRole(a.roleId);
                        return (
                          <div
                            key={a.employeeId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-elevated px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{e.name}</p>
                              <p className="text-xs text-muted-foreground">{r.title}</p>
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
                  )}
                </Panel>
              ))}
            </div>
            <div className="space-y-6">
              <Panel>
                <p className="text-eyebrow">Definition of Done gate</p>
                <h3 className="mt-1 font-display text-base font-semibold text-foreground">
                  Automated QA verification
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Artifact
                    verification — PR URL, Figma link or test log required.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Given-When-Then
                    acceptance criteria audit per submission.
                  </li>
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> Automated
                    rejection lists exact missing items — appealable by the contributor.
                  </li>
                </ul>
              </Panel>
              <Panel>
                <p className="text-eyebrow">Deliberation record</p>
                <h3 className="mt-1 font-display text-base font-semibold text-foreground">
                  Selected option matrix
                </h3>
                <div className="mt-3 space-y-2 text-sm">
                  {[
                    ["Architecture pattern", "Event-driven microservices"],
                    ["Database engine", "PostgreSQL 16"],
                    ["Message broker", "Redis Streams"],
                    ["Delivery guarantee", "At-least-once + idempotency"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right font-medium text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="resources">
          <Panel className="overflow-x-auto">
            <SectionHeading
              eyebrow="Multi-horizon model"
              title="Capacity plan — daily, weekly, monthly, total"
              description="Generated from dynamic role caps and validated against the Global Capacity Ledger."
            />
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-eyebrow">
                  <th className="pb-3 font-normal">Team member</th>
                  <th className="pb-3 font-normal">Assigned dynamic role</th>
                  <th className="pb-3 font-normal">Daily cap</th>
                  <th className="pb-3 font-normal">Daily</th>
                  <th className="pb-3 font-normal">Weekly</th>
                  <th className="pb-3 font-normal">Monthly</th>
                  <th className="pb-3 font-normal">Project total</th>
                  <th className="pb-3 font-normal">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {project.allocations.map((a) => {
                  const e = getEmployee(a.employeeId);
                  const r = getRole(a.roleId);
                  const pct = Math.round((a.dailyAllocated / r.dailyCap) * 1000) / 10;
                  return (
                    <tr key={a.employeeId} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3.5 font-medium text-foreground">{e.name}</td>
                      <td className="py-3.5 text-muted-foreground">{r.title}</td>
                      <td className="py-3.5 font-mono text-xs">{r.dailyCap.toFixed(1)}</td>
                      <td className="py-3.5 font-mono text-xs">{a.dailyAllocated.toFixed(1)} h/d</td>
                      <td className="py-3.5 font-mono text-xs">{weekly(a.dailyAllocated).toFixed(1)} h/wk</td>
                      <td className="py-3.5 font-mono text-xs">{monthly(a.dailyAllocated).toFixed(1)} h/mo</td>
                      <td className="py-3.5 font-mono text-xs text-foreground">{a.projectTotal} h</td>
                      <td className="py-3.5">
                        <UtilizationBar pct={pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </TabsContent>

        <TabsContent value="gantt">
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <SectionHeading
                eyebrow="Milestone schedule"
                title="Graphical project timeline"
                description="Phase bars show scheduled window and completion against milestone targets."
              />
              <GanttChart project={project} />
            </Panel>
            <Panel>
              <p className="text-eyebrow">Granular visibility permissions</p>
              <h3 className="mt-1 font-display text-base font-semibold text-foreground">
                Per-employee Gantt tiers
              </h3>
              <div className="mt-4 space-y-2.5">
                {project.allocations.map((a) => (
                  <div
                    key={a.employeeId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-elevated px-3 py-2.5"
                  >
                    <span className="text-sm text-foreground">{getEmployee(a.employeeId).name}</span>
                    <Pill
                      tone={
                        a.visibility === "Full Data"
                          ? "primary"
                          : a.visibility === "Own + Dependencies"
                            ? "accent"
                            : "muted"
                      }
                    >
                      <Eye className="size-3" /> {a.visibility}
                    </Pill>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>
                  <span className="text-foreground">Option A — Full data:</span> complete Gantt, all
                  phases, all schedules, burndown and dependencies.
                </p>
                <p>
                  <span className="text-foreground">Option B — Own data only:</span> strictly
                  isolated personal tasks, milestones and deadlines.
                </p>
                <p>
                  <span className="text-foreground">Option C — Own + dependencies:</span> personal
                  tasks plus upstream blockers and downstream waiters.
                </p>
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="chat">
          <ChangeRequestConsole />
        </TabsContent>

        <TabsContent value="history">
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <SectionHeading
                eyebrow="PRD Time Machine"
                title="Version history & change log"
                description="Every authorized change generates a new semantic version with a permanent consequence record."
              />
              <div className="space-y-4">
                {changelog.map((c) => (
                  <div key={c.version} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 font-mono text-[10px] font-bold text-primary">
                        {c.version}
                      </span>
                      <span className="mt-1 w-px flex-1 bg-border" />
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-foreground">{c.summary}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {c.date} · {c.author} · {c.consequence}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="border-warning/40">
              <Pill tone="warning">Directive conflict</Pill>
              <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                Resolution required
              </h3>
              {directives.map((d) => (
                <div key={d.id} className="mt-3 space-y-3">
                  {[d.a, d.b].map((x) => (
                    <div key={x.when} className="rounded-md border border-border bg-elevated p-3">
                      <p className="text-eyebrow">{x.when}</p>
                      <p className="mt-1 text-sm text-foreground">"{x.text}"</p>
                      <p className="mt-1.5 font-mono text-[10px] text-accent">{x.tag}</p>
                    </div>
                  ))}
                  <p className="text-sm text-muted-foreground">
                    Which directive takes precedence? The other is marked superseded and logged.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toast.success("Directive resolved — 'speed' marked superseded")}
                      className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground hover:border-primary/40"
                    >
                      Keep Monday
                    </button>
                    <button
                      onClick={() => toast.success("Directive resolved — quality precedence logged in PRD v2.2")}
                      className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Keep Wednesday
                    </button>
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex flex-wrap gap-2">
        {projects
          .filter((p) => p.id !== project.id)
          .map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Switch sandbox → {p.title}
            </Link>
          ))}
      </div>
    </AppShell>
  );
}

type Msg = { role: "pm" | "agent"; text: string; options?: string[]; consequence?: boolean };

const seed: Msg[] = [
  { role: "pm", text: "What is our sprint velocity?" },
  {
    role: "agent",
    text: "412 of 815 baseline hours completed (50.6%). Trailing 2-week velocity is 138 hrs/wk against a 152 hrs/wk plan — a 9.2% shortfall. At the current rate the launch milestone lands 4 days late; the QA hardening gate absorbs 2 of those days.",
  },
  { role: "pm", text: "Add Stripe billing to this release." },
  {
    role: "agent",
    text: "Before I model consequences: should billing cover metered usage only, or seats + metered? And is dunning in scope for this release?",
    options: ["Metered only, no dunning", "Seats + metered, no dunning", "Full billing incl. dunning"],
  },
];

function ChangeRequestConsole() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [input, setInput] = useState("");

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [
      ...m,
      { role: "pm", text },
      {
        role: "agent",
        text: "Consequence analysis complete. Adding Stripe billing requires +45 engineering hours. This pushes the release date back by 8 days, increases Backend Lead utilization to 96% (Max Cap), and delays UI integration by 3 days. Downstream: QA hardening compresses to 6 days.",
        consequence: true,
      },
    ]);
    setInput("");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel className="flex min-h-[540px] flex-col xl:col-span-2">
        <SectionHeading
          eyebrow="Action mode"
          title="Project intelligence & change control"
          description="Query state, submit change directives, and authorize re-baselined schedules."
        />
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((m, i) =>
            m.role === "pm" ? (
              <UserBubble key={i} who="Product Manager">
                {m.text}
              </UserBubble>
            ) : (
              <AgentBubble key={i}>
                <p>{m.text}</p>
                {m.options && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {m.options.map((o) => (
                      <OptionChoice
                        key={o}
                        label={o}
                        onClick={() => send(`Selected: ${o}`)}
                      />
                    ))}
                  </div>
                )}
                {m.consequence && (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                    <p className="text-eyebrow">Mandatory consequence disclosure</p>
                    <p className="mt-1.5 text-sm text-foreground">
                      Do you accept these consequences and authorize the re-baselined schedule?
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          toast.success("Change authorized — PRD re-baselined to v2.2, queues repopulated")
                        }
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Accept & authorize
                      </button>
                      <button
                        onClick={() => toast("Change discarded — no schedule impact applied")}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:border-primary/40"
                      >
                        Reject change
                      </button>
                    </div>
                  </div>
                )}
              </AgentBubble>
            ),
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for velocity, blockers, hours — or submit a change directive…"
            className="flex-1 rounded-md border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Send className="size-4" /> Send
          </button>
        </form>
      </Panel>

      <div className="space-y-6">
        <Panel>
          <p className="text-eyebrow">Quick intelligence</p>
          <div className="mt-3 space-y-2">
            {["What is our sprint velocity?", "Any team blockers?", "Show employee hours this week."].map(
              (q) => (
                <OptionChoice key={q} label={q} onClick={() => send(q)} />
              ),
            )}
          </div>
        </Panel>
        <Panel>
          <p className="text-eyebrow">Blocker telemetry</p>
          <h3 className="mt-1 font-display text-base font-semibold text-foreground">
            Dependency graph
          </h3>
          <div className="mt-3 space-y-2.5 text-sm">
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-foreground">
              Alex Rivera blocked — awaiting replay contract sign-off from David Miller.
            </p>
            <p className="rounded-md border border-border bg-elevated p-2.5 text-muted-foreground">
              Parallel task injected: template render-time validation hardening (4 hrs, no upstream
              dependency).
            </p>
            <p className="rounded-md border border-success/30 bg-success/10 p-2.5 text-foreground">
              Topological check passed — 0 cycles across 34 dependency edges.
            </p>
          </div>
        </Panel>
        <Panel>
          <p className="text-eyebrow flex items-center gap-1.5">
            <History className="size-3" /> Directive registry
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            18 directives logged · 1 unresolved conflict · every resolution written to the PRD change
            log for audit.
          </p>
        </Panel>
      </div>
    </div>
  );
}

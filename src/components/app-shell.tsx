import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  GaugeCircle,
  Users,
  ShieldCheck,
  Copy,
  MessagesSquare,
  Bell,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { alerts } from "@/lib/platform-data";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Portfolio", icon: LayoutDashboard },
  { to: "/projects/notification-engine", label: "Command Center", icon: FolderKanban, match: "/projects" },
  { to: "/new", label: "New Project", icon: Sparkles },
  { to: "/capacity", label: "Capacity Ledger", icon: GaugeCircle },
  { to: "/directory", label: "Directory & Roles", icon: Users },
  { to: "/governance", label: "Resilience & Governance", icon: ShieldCheck },
  { to: "/templates", label: "Template Library", icon: Copy },
  { to: "/workspace", label: "Employee Workspace", icon: MessagesSquare },
];

export function AppShell({
  children,
  title,
  eyebrow,
  actions,
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
  actions?: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
          <Link to="/" className="mb-7 flex items-center gap-2.5 px-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              PM
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-semibold text-sidebar-foreground">
                Autonomous PM
              </span>
              <span className="text-eyebrow">Command Platform</span>
            </span>
          </Link>

          <nav className="flex flex-col gap-0.5">
            {nav.map((item) => {
              const active = item.match ? path.startsWith(item.match) : path === item.to;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className={cn("size-4", active && "text-primary")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
            <p className="text-eyebrow">Containment</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              100% internal platform containment. Zero external mail dependencies — all governance
              stays in-platform.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
              <div className="min-w-0">
                <p className="text-eyebrow">{eyebrow}</p>
                <h1 className="truncate font-display text-xl font-semibold text-foreground">
                  {title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {actions}
                <Link
                  to="/governance"
                  className="relative flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Escalations"
                >
                  <Bell className="size-4" />
                  {criticalCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                      {criticalCount}
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 font-mono text-[10px] font-bold text-primary">
                    PM
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Product Manager
                  </span>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { utilizationBand } from "@/lib/platform-data";

export function Panel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "danger" | "success";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    danger: "text-destructive",
    success: "text-success",
  }[tone];
  return (
    <Panel className="p-4">
      <p className="text-eyebrow">{label}</p>
      <p className={cn("mt-2 font-display text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Panel>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "accent" | "success" | "danger" | "warning";
  className?: string;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/15 text-primary border-primary/30",
    accent: "bg-accent/15 text-accent border-accent/30",
    success: "bg-success/15 text-success border-success/30",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    warning: "bg-warning/15 text-warning border-warning/30",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function UtilizationBar({ pct }: { pct: number }) {
  const band = utilizationBand(pct);
  const tone =
    band === "Over Cap"
      ? "bg-destructive"
      : band === "Max Cap"
        ? "bg-chart-4"
        : band === "High Focus"
          ? "bg-primary"
          : band === "Available"
            ? "bg-muted-foreground"
            : "bg-success";
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-28 shrink-0 font-mono text-[11px] text-muted-foreground">
        {pct.toFixed(1)}% · {band}
      </span>
    </div>
  );
}

export function AgentBubble({ children, label = "AI PM Agent" }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-[10px] font-bold text-primary">
        AI
      </span>
      <div className="min-w-0 flex-1 rounded-lg rounded-tl-none border border-border bg-elevated p-3.5">
        <p className="text-eyebrow mb-1.5">{label}</p>
        <div className="space-y-2 text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function UserBubble({ children, who }: { children: ReactNode; who: string }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[80%] rounded-lg rounded-tr-none border border-primary/25 bg-primary/10 p-3.5">
        <p className="text-eyebrow mb-1.5">{who}</p>
        <div className="text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function OptionChoice({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-elevated",
      )}
    >
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
    </button>
  );
}

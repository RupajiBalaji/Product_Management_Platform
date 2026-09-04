import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Sparkles,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Layers,
  Repeat,
  Zap,
  Bot,
  ShieldCheck,
  Cpu,
  Gauge,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { toggleUserRole } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AICopilotSidebar } from "./AICopilotSidebar";

const productLeadNav = [
  { to: "/pm/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pm/projects", label: "Projects & Tasks", icon: FolderKanban },
  { to: "/pm/capacity", label: "Capacity Registry", icon: Gauge },
  { to: "/pm/roles", label: "Dynamic Roles", icon: ShieldCheck },
  { to: "/pm/employees", label: "Workforce Directory", icon: Users },
  { to: "/pm/ai-hub", label: "AI Summary Hub", icon: Sparkles },
];

const leadArchitectNav = [
  { to: "/pm/dashboard", label: "Architecture & Projects", icon: LayoutDashboard },
  { to: "/pm/projects", label: "Projects & Tasks", icon: FolderKanban },
  { to: "/pm/capacity", label: "Capacity Registry", icon: Gauge },
  { to: "/pm/employees", label: "Workforce Directory", icon: Users },
  { to: "/pm/ai-hub", label: "AI Summary Hub", icon: Sparkles },
];

const employeeNav = [
  { to: "/employee/dashboard", label: "Developer Workspace", icon: LayoutDashboard },
  { to: "/pm/projects", label: "All Projects & Teams", icon: Layers },
];

interface AppShellProps {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function AppShell({ children, title, eyebrow, actions }: AppShellProps) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { userProfile, setUserProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const navigate = useNavigate();

  const isProductLead = userProfile?.user_type === "product_lead" || userProfile?.user_type === "pm";
  const isLeadArchitect = userProfile?.user_type === "lead_architect";
  const isEmployee = !isProductLead && !isLeadArchitect;
  const nav = isProductLead ? productLeadNav : (isLeadArchitect ? leadArchitectNav : employeeNav);

  const getRoleLabel = (type?: string) => {
    if (type === "product_lead" || type === "pm") return "Product Lead";
    if (type === "lead_architect") return "Lead Architect";
    return "Contributor";
  };

  const getNextRoleLabel = (type?: string) => {
    if (type === "product_lead" || type === "pm") return "Lead Architect";
    if (type === "lead_architect") return "Developer View";
    return "Product Lead View";
  };

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
    toast.success("Signed out successfully");
  };

  const handleToggleRole = async () => {
    setSwitchingRole(true);
    try {
      const updated = await toggleUserRole();
      setUserProfile(updated);
      toast.success(`Switched role to: ${getRoleLabel(updated.user_type)}`);
      if (updated.user_type === "employee") {
        navigate({ to: "/employee/dashboard" });
      } else {
        navigate({ to: "/pm/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to switch role");
    } finally {
      setSwitchingRole(false);
    }
  };

  const SidebarContent = () => (
    <>
      {/* Brand Logo Header */}
      <Link
        to={isEmployee ? "/employee/dashboard" : "/pm/dashboard"}
        className="mb-6 flex items-center gap-3 px-1.5 py-1 group"
      >
        <div className="flex size-10 items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
          <img src="/logo.png" alt="Acube Logo" className="size-10 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.35)]" />
        </div>
        <div className="leading-tight min-w-0">
          <span className="block font-display text-sm font-extrabold tracking-tight text-sidebar-foreground truncate group-hover:text-primary transition-colors">
            Autonomous PM
          </span>
          <span className="text-eyebrow text-[9px] text-primary/90 font-bold uppercase tracking-wider">
            {getRoleLabel(userProfile?.user_type)}
          </span>
        </div>
      </Link>

      {/* Main Navigation Links */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {nav.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all duration-150",
                active
                  ? "bg-primary/15 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground hover:border hover:border-border/60"
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className="truncate">{item.label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Fast Dual-Role Switcher */}
      <div className="mt-auto space-y-2.5 pt-4 border-t border-sidebar-border/80">
        <div className="rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/30 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="relative">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-indigo-500/20 border border-primary/40 font-display font-bold text-primary text-xs">
                {(userProfile?.full_name || "User")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-foreground truncate">{userProfile?.full_name || "User"}</p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{userProfile?.role_title || "Team Member"}</p>
            </div>
          </div>

          <button
            onClick={handleToggleRole}
            disabled={switchingRole}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card/80 py-2 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all cursor-pointer shadow-xs"
            title="Switch between 3-tier governance roles"
          >
            <Repeat className={cn("size-3.5 text-primary", switchingRole && "animate-spin")} />
            <span>Switch to {getNextRoleLabel(userProfile?.user_type)}</span>
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/90 backdrop-blur-xl px-4 py-5 lg:flex z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-md" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex w-72 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-xl p-2 text-muted-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              <X className="size-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 glass-header">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground lg:hidden cursor-pointer hover:text-foreground"
              >
                <Menu className="size-4.5" />
              </button>
              <div className="min-w-0">
                {eyebrow && <p className="text-eyebrow text-[9px] mb-0.5">{eyebrow}</p>}
                <h1 className="truncate font-display text-base sm:text-lg font-extrabold tracking-tight text-foreground">
                  {title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Omnipresent AI Copilot Trigger Button */}
              <button
                onClick={() => setAiCopilotOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-gradient-to-r from-primary/20 via-primary/10 to-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/25 shadow-glow transition-all cursor-pointer"
              >
                <Sparkles className="size-3.5 text-primary animate-pulse" />
                <span className="hidden sm:inline">Ask AI Copilot</span>
              </button>

              {actions}

              {/* Theme Switcher */}
              <button
                onClick={toggleTheme}
                className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer shadow-xs"
                title="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="size-4 text-amber-400" />
                ) : (
                  <Moon className="size-4 text-indigo-500" />
                )}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Omnipresent AI Copilot Slideout Sidebar */}
      <AICopilotSidebar isOpen={aiCopilotOpen} onClose={() => setAiCopilotOpen(false)} />
    </div>
  );
}

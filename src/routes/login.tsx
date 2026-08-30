import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Sparkles, User, Briefcase, Mail, UserCheck, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getAllEmployees } from "@/lib/db";
import type { UserProfile } from "@/lib/types";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

export function LoginPage() {
  const {
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    switchUser,
    userProfile,
    firebaseUser,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [employees, setEmployees] = useState<UserProfile[]>([]);

  useEffect(() => {
    getAllEmployees().then(setEmployees);
  }, []);

  useEffect(() => {
    if (userProfile) {
      const dest = userProfile.user_type === "pm" ? "/pm/dashboard" : "/employee/dashboard";
      navigate({ to: dest });
    }
  }, [userProfile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      if (mode === "signin") {
        await loginWithEmail(email, password);
        toast.success("Welcome back!");
      } else {
        if (!fullName) {
          toast.error("Please enter your full name");
          setLoading(false);
          return;
        }
        await registerWithEmail(email, password, fullName, roleTitle || "Project Manager");
        toast.success("Account created successfully!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message?.replace("Firebase: ", "") || "Authentication failed. Make sure Email/Password is enabled in Firebase.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      toast.success("Signed in with Google!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message?.replace("Firebase: ", "") || "Google Sign-In failed. Make sure Google Auth is enabled in Firebase Console.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleQuickSwitch = async (userId: string, name: string) => {
    setLoading(true);
    try {
      await switchUser(userId);
      toast.success(`Signed in as ${name}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to switch user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-4 py-8">
      {/* Background canvas */}
      <div className="absolute inset-0 grid-canvas opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex items-center gap-3 mb-2">
            <img src="/favicon.svg" alt="Logo" className="size-11 rounded-2xl shadow-glow" />
            <div className="text-left">
              <h1 className="font-display text-2xl font-extrabold text-foreground tracking-tight">Autonomous PM</h1>
              <p className="text-eyebrow text-[10px]">Production AI & Workforce Management</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="panel p-6 sm:p-8 backdrop-blur-md shadow-2xl border-border/80">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-elevated p-1 mb-5 border border-border">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-card py-2.5 px-4 text-sm font-semibold text-foreground hover:bg-elevated hover:border-primary/40 transition-all shadow-xs disabled:opacity-60 mb-4 cursor-pointer"
          >
            {googleLoading ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <svg className="size-4.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-3 text-eyebrow text-[9px] text-muted-foreground">OR WITH EMAIL</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-eyebrow mb-1 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Arjun Sharma"
                      required
                      className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-eyebrow mb-1 block">Role Title</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="e.g. Senior Project Manager"
                      className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-eyebrow mb-1 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  required
                  className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-eyebrow mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading || authLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-60 transition-all mt-2 cursor-pointer"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          {/* Quick Multi-User Test Switcher (Fast Persona Login) */}
          <div className="mt-5 pt-4 border-t border-border/80">
            <div className="flex items-center gap-1.5 mb-2.5">
              <UserCheck className="size-3.5 text-primary" />
              <p className="text-eyebrow text-[9px] text-muted-foreground font-semibold">
                Quick Multi-User Session Login (MongoDB)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickSwitch("pm_default_admin", "Project Manager")}
                disabled={loading}
                className="flex items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/10 py-1.5 px-2 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <Shield className="size-3" />
                <span>Log in as PM</span>
              </button>
              {employees.slice(0, 3).map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleQuickSwitch(emp.id, emp.full_name)}
                  disabled={loading}
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card py-1.5 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors cursor-pointer truncate"
                  title={`Sign in as ${emp.full_name} (${emp.role_title})`}
                >
                  <span className="truncate">Dev: {emp.full_name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Autonomous PM · Production Session Cookies & MongoDB Multi-User Active
        </p>
      </div>
    </div>
  );
}

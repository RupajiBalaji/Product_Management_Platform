import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  Sparkles,
  User,
  Briefcase,
  Mail,
  Shield,
  Code2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { UserType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

export function LoginPage() {
  const {
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    userProfile,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [selectedUserType, setSelectedUserType] = useState<UserType>("pm");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
        const defaultRole = selectedUserType === "pm" ? "Project Manager" : "Software Developer";
        await registerWithEmail(
          email,
          password,
          fullName,
          roleTitle || defaultRole,
          selectedUserType
        );
        toast.success(`Account created as ${selectedUserType === "pm" ? "Project Manager" : "Developer"}!`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message?.replace("Firebase: ", "") ||
          "Authentication failed. Please verify credentials."
      );
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
      toast.error(
        err.message?.replace("Firebase: ", "") ||
          "Google Sign-In failed. Make sure Google Auth is authorized in Firebase."
      );
    } finally {
      setGoogleLoading(false);
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
            <img src="/logo.png" alt="Logo" className="size-11 rounded-2xl shadow-glow" />
            <div className="text-left">
              <h1 className="font-display text-2xl font-extrabold text-foreground tracking-tight">Autonomous PM</h1>
              <p className="text-eyebrow text-[10px]">Dual-Role Workforce & AI Management Platform</p>
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

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "signup" && (
              <>
                {/* Role Selection (Manager vs Developer) */}
                <div>
                  <label className="text-eyebrow mb-1.5 block font-bold text-foreground">
                    Select Your Account Role
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedUserType("pm")}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                        selectedUserType === "pm"
                          ? "border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary"
                          : "border-border bg-elevated/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Shield className="size-3.5" />
                        <span>Project Manager</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        Create projects, assign tasks, view matrix & AI insights.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedUserType("employee")}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                        selectedUserType === "employee"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-xs ring-1 ring-emerald-500"
                          : "border-border bg-elevated/60 text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Code2 className="size-3.5" />
                        <span>Developer</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        Assigned deliverables, focus on priority, log daily work.
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-eyebrow mb-1 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={selectedUserType === "pm" ? "e.g. Arjun Sharma" : "e.g. Rahul Patel"}
                      required
                      className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-eyebrow mb-1 block">Custom Role Title (Optional)</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder={selectedUserType === "pm" ? "e.g. Senior Project Manager" : "e.g. Full-Stack Developer"}
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-60 transition-all mt-3 cursor-pointer"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                ? "Sign In"
                : `Create Account (${selectedUserType === "pm" ? "Project Manager" : "Developer"})`}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Autonomous PM · Dual-Role Workforce Management
        </p>
      </div>
    </div>
  );
}

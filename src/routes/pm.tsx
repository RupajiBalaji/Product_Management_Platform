import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/pm")({
  component: PMGuard,
});

function PMGuard() {
  const { userProfile, firebaseUser, loading } = useAuth();
  const navigate = useNavigate();
  const isAuthenticated = Boolean(userProfile || firebaseUser);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <Outlet />;
}

import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/employee")({
  component: EmployeeGuard,
});

function EmployeeGuard() {
  const { firebaseUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      navigate({ to: "/login" });
    }
  }, [firebaseUser, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  return <Outlet />;
}

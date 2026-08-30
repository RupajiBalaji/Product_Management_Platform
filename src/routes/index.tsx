import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      navigate({ to: "/login" });
    } else if (userProfile?.user_type === "employee") {
      navigate({ to: "/employee/dashboard" });
    } else {
      navigate({ to: "/pm/dashboard" });
    }
  }, [firebaseUser, userProfile, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  );
}

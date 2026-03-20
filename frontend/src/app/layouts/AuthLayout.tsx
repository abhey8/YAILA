import { Navigate, Outlet } from "react-router";
import { useAuth } from "../context/AuthContext";

export function AuthLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-[var(--background-solid)] text-[var(--accent-primary)]">Loading...</div>;
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(ellipse at top right, color-mix(in srgb, var(--accent-primary) 10%, transparent) 0%, transparent 45%), radial-gradient(ellipse at bottom left, color-mix(in srgb, var(--accent-tertiary) 8%, transparent) 0%, transparent 42%), var(--background)",
      }}
    >
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-[var(--shadow-soft)] bg-[var(--surface-1)] border border-[var(--border)] overflow-hidden p-1">
            <img src="/logo.png" alt="YAILA Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">YAILA</h1>
          <p className="text-[var(--muted-foreground)] mt-2">Transform PDFs into interactive learning</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

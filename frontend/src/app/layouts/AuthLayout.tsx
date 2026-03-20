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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--accent-primary)_0%,_transparent_45%)] opacity-10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--accent-secondary)_0%,_transparent_45%)] opacity-10" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg bg-white overflow-hidden p-1">
            <img src="/logo.png" alt="YAILA Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white">YAILA</h1>
          <p className="text-[var(--muted-foreground)] mt-2">Transform PDFs into interactive learning</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

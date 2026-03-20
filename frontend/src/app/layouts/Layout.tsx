import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { TopBar } from "../components/TopBar";
import { UploadButton } from "../components/UploadButton";
import { UploadModal } from "../components/UploadModal";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { token, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-[var(--background-solid)] text-[var(--accent-primary)]">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query && location.pathname !== "/documents") {
      navigate("/documents");
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--accent-primary)_0%,_transparent_50%)] opacity-10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--accent-secondary)_0%,_transparent_50%)] opacity-10" />

      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <TopBar
          onSearch={handleSearch}
          onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet context={{ searchQuery, refreshKey }} />
        </main>
      </div>

      <UploadButton onClick={() => setIsUploadModalOpen(true)} />
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => setRefreshKey((previous) => previous + 1)}
      />
    </div>
  );
}

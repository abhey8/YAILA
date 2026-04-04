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
    <div className="flex h-screen bg-[var(--background-solid)] relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse at top right, color-mix(in srgb, var(--accent-primary) 10%, transparent) 0%, transparent 48%), radial-gradient(ellipse at bottom left, color-mix(in srgb, var(--accent-tertiary) 8%, transparent) 0%, transparent 42%), var(--background)",
        }}
      />

      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <TopBar
          onSearch={handleSearch}
          onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet context={{ searchQuery, refreshKey, openUploadModal: () => setIsUploadModalOpen(true) }} />
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

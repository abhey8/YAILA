import { Outlet, useNavigate, useLocation, Navigate } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { TopBar } from "../components/TopBar";
import { UploadButton } from "../components/UploadButton";
import { useState } from "react";
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
    return <div className="flex h-screen items-center justify-center dark:bg-gray-900 bg-gray-50 text-indigo-600">Loading...</div>;
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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
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
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
    </div>
  );
}
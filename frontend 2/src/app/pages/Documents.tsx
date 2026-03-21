import { CheckCircle, Clock, Grid, List, Upload, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { documentApi } from "../../services/api";

interface OutletContext {
  searchQuery: string;
  refreshKey: number;
  openUploadModal: () => void;
}

export default function Documents() {
  const { searchQuery, refreshKey, openUploadModal } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        const data = await documentApi.getDocuments();
        setDocuments(data || []);
      } catch (error) {
        toast.error("Failed to load documents");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      await documentApi.deleteDocument(id);
      setDocuments((current) => current.filter((doc) => doc._id !== id));
      toast.success("Document deleted successfully");
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.originalName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 MB";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown Date";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const getStatusBadge = (document: any) => {
    if (document.ingestionStatus === "completed" && document.conceptCount > 0) {
      return { icon: CheckCircle, label: "Graph Ready", classes: "bg-blue-500/20 text-blue-300" };
    }
    if (document.ingestionStatus === "completed") {
      return { icon: Zap, label: "Ready", classes: "bg-green-500/20 text-green-300" };
    }
    if (document.ingestionStatus === "failed") {
      return { icon: Clock, label: "Failed", classes: "bg-red-500/20 text-red-300" };
    }
    return { icon: Clock, label: "Processing", classes: "bg-yellow-500/20 text-yellow-300" };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">My Documents</h1>
          <p className="text-[var(--muted-foreground)] text-lg">
            {filteredDocuments.length} document{filteredDocuments.length !== 1 ? "s" : ""} found
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-3 rounded-xl transition-all ${
              viewMode === "grid"
                ? "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white shadow-lg shadow-[var(--accent-primary)]/20"
                : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/80"
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-3 rounded-xl transition-all ${
              viewMode === "list"
                ? "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white shadow-lg shadow-[var(--accent-primary)]/20"
                : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/80"
            }`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <GlassCard className="p-12 text-center text-[var(--muted-foreground)]">Loading documents...</GlassCard>
      ) : filteredDocuments.length > 0 ? (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {filteredDocuments.map((doc, index) => {
            const status = getStatusBadge(doc);
            const StatusIcon = status.icon;

            return (
              <motion.div
                key={doc._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard hover className="p-6 relative overflow-hidden text-left w-full">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] opacity-10 blur-3xl" />
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${status.classes}`}>
                      <StatusIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">{status.label}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/documents/${doc._id}`)}
                    className="w-full text-left relative z-10"
                  >
                    <h3 className="text-lg font-bold text-[var(--foreground)] mb-2 line-clamp-2">
                      {doc.title || doc.originalName}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                      <span>{doc.metadata?.pageCount || doc.totalPages || 0} pages</span>
                      <span>•</span>
                      <span>{formatSize(doc.size)}</span>
                    </div>
                    <div className="text-sm text-[var(--muted-foreground)] mt-4">
                      Uploaded {formatDate(doc.createdAt)}
                    </div>
                  </button>
                  <div className="mt-4 flex gap-2 relative z-10">
                    <button
                      onClick={() => navigate(`/documents/${doc._id}`)}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--accent-primary)]/20 transition-all font-medium"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleDelete(doc._id)}
                      className="px-4 py-2 bg-red-500/20 text-red-300 rounded-xl hover:bg-red-500/30 transition-all font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Upload}
          title="No documents found"
          description={searchQuery ? `No documents match "${searchQuery}"` : "Upload your first PDF to get started with AI-powered learning"}
          action={{
            label: "Upload Document",
            onClick: openUploadModal
          }}
        />
      )}
    </div>
  );
}

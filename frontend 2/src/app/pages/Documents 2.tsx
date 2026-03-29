import { useState, useEffect } from "react";
import { Grid, List, Upload } from "lucide-react";
import { DocumentCard } from "../components/DocumentCard";
import { EmptyState } from "../components/EmptyState";
import { toast } from "sonner";
import { useOutletContext } from "react-router";
import { documentApi } from "../../services/api";

interface OutletContext {
  searchQuery: string;
  refreshKey: number;
}

export default function Documents() {
  const { searchQuery, refreshKey } = useOutletContext<OutletContext>();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        const data = await documentApi.getDocuments();
        setDocuments(data);
      } catch (error) {
        console.error("Failed to fetch documents", error);
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
      setDocuments(documents.filter(doc => doc._id !== id));
      toast.success("Document deleted successfully");
    } catch (error) {
       console.error("Failed to delete", error);
       toast.error("Failed to delete document");
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.originalName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 MB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown Date";
    return new Date(dateString).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Documents</h1>
          <p className="text-gray-600 mt-1">
            {filteredDocuments.length} document{filteredDocuments.length !== 1 ? "s" : ""} found
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "grid"
                ? "bg-indigo-100 text-indigo-600"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "list"
                ? "bg-indigo-100 text-indigo-600"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {filteredDocuments.length > 0 ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-4"
          }
        >
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc._id}
              id={doc._id}
              title={doc.title || doc.originalName}
              uploadDate={formatDate(doc.createdAt)}
              pages={doc.metadata?.pageCount || doc.totalPages || 0}
              size={formatSize(doc.size)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Upload}
          title="No documents found"
          description={
            searchQuery
              ? `No documents match "${searchQuery}"`
              : "Upload your first PDF to get started with AI-powered learning"
          }
          action={{
            label: "Upload Document",
            onClick: () => {},
          }}
        />
      )}
    </div>
  );
}

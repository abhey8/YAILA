import { Map, CheckCircle, ChevronDown, ChevronUp, BookOpen, Layers, MessageSquare } from "lucide-react";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { activityApi, documentApi, roadmapApi } from "../../services/api";

export default function LearningRoadmap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preferredDocumentId = searchParams.get("documentId") || "";
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [roadmap, setRoadmap] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [expandedItemOrder, setExpandedItemOrder] = useState<number | null>(null);
  const completedCount = roadmap?.items?.filter((item: any) => item.status === "completed").length || 0;
  const totalCount = roadmap?.items?.length || 0;
  const isChapterCompleted = totalCount > 0 && completedCount === totalCount;

  const handleToggleStatus = async (order: number, status: string) => {
    if (!selectedDocumentId) return;
    try {
      await roadmapApi.updateItemStatus(selectedDocumentId, order, status);
      // Update local state smoothly
      setRoadmap((prev: any) => ({
        ...prev,
        items: prev.items.map((item: any) => 
          item.order === order ? { ...item, status } : item
        )
      }));
      toast.success(status === 'completed' ? "Marked as covered" : "Marked as pending");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleChapterToggle = async (nextCompleted: boolean) => {
    if (!selectedDocumentId || !roadmap?.items?.length) return;
    const nextStatus = nextCompleted ? "completed" : "pending";
    try {
      await Promise.all(
        roadmap.items.map((item: any) => roadmapApi.updateItemStatus(selectedDocumentId, item.order, nextStatus))
      );
      setRoadmap((prev: any) => ({
        ...prev,
        items: prev.items.map((item: any) => ({ ...item, status: nextStatus }))
      }));
      toast.success(nextCompleted ? "Chapter marked complete" : "Chapter reset to pending");
    } catch (error) {
      toast.error("Failed to update chapter status");
    }
  };

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const docs = await documentApi.getDocuments();
        setDocuments(docs || []);
        if (docs?.length) {
          const matchedDocument = preferredDocumentId
            ? docs.find((doc: any) => doc._id === preferredDocumentId)
            : null;
          setSelectedDocumentId((matchedDocument || docs[0])._id);
        }
      } catch (error) {
        toast.error("Failed to load documents");
      } finally {
        setIsLoading(false);
      }
    };

    loadDocuments();
  }, [preferredDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set("documentId", selectedDocumentId);
    setSearchParams(params, { replace: true });
  }, [selectedDocumentId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setRoadmap(null);
      return;
    }

    const loadRoadmap = async () => {
      try {
        const data = await roadmapApi.getRoadmap(selectedDocumentId);
        setRoadmap(data);
        if (data?.status === "generating") {
          toast.info("Roadmap is being generated for this document");
        }
        await activityApi.track({
          type: "roadmap-progress",
          title: "Roadmap opened",
          description: "A learning roadmap was viewed.",
          documentId: selectedDocumentId,
          metadata: {
            roadmapId: data?._id || null,
            itemCount: data?.items?.length || 0,
          },
        });
      } catch (error) {
        setRoadmap(null);
        const message = (error as any)?.response?.data?.error
          || (error as any)?.response?.data?.message
          || "Failed to load roadmap";
        toast.error(message);
      }
    };

    loadRoadmap();
  }, [selectedDocumentId]);

  const handleRegenerate = async () => {
    if (!selectedDocumentId) {
      return;
    }

    try {
      setIsRegenerating(true);
      const data = await roadmapApi.regenerateRoadmap(selectedDocumentId, "frontend-refresh");
      setRoadmap(data);
      toast.success("Roadmap regenerated");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to regenerate roadmap");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!isLoading && documents.length === 0) {
    return (
      <EmptyState
        icon={Map}
        title="No documents available"
        description="Upload a document first to generate a learning roadmap."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">Learning Roadmap</h1>
          <p className="text-[var(--foreground-soft)] text-lg">A document-specific ordered plan generated from your study material.</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={!selectedDocumentId || isRegenerating}
          className="px-4 py-3 rounded-2xl study-button-primary disabled:opacity-60"
        >
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      <GlassCard className="p-6 study-panel">
        <label className="block text-sm text-[var(--foreground-soft)] mb-2">Document</label>
        <select
          value={selectedDocumentId}
          onChange={(event) => setSelectedDocumentId(event.target.value)}
          className="w-full max-w-xl px-4 py-3 rounded-2xl study-input"
        >
          {documents.map((document) => (
            <option key={document._id} value={document._id}>
              {document.title}
            </option>
          ))}
        </select>
      </GlassCard>

      {roadmap?.items?.length ? (
        <div className="space-y-4">
          <GlassCard className="p-5 study-panel">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Chapter Completion</h3>
                <p className="text-sm text-[var(--foreground-soft)] mt-1">
                  {completedCount}/{totalCount} topics completed
                </p>
              </div>
              <button
                onClick={() => handleChapterToggle(!isChapterCompleted)}
                className={`px-4 py-2 rounded-xl border transition-colors ${isChapterCompleted ? 'bg-[var(--success)] border-[var(--success)] text-white' : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]'}`}
              >
                {isChapterCompleted ? "Chapter Checked" : "Mark Chapter Complete"}
              </button>
            </div>
          </GlassCard>

          {roadmap.items.map((item: any) => {
            const isExpanded = expandedItemOrder === item.order;
            const isCompleted = item.status === 'completed';
            
            return (
            <GlassCard key={`${item.order}-${item.concept?._id || item.order}`} className="p-0 overflow-hidden transition-all study-panel">
              <div 
                className="p-6 cursor-pointer flex items-center justify-between study-card-hover"
                onClick={() => setExpandedItemOrder(isExpanded ? null : item.order)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${isCompleted ? 'bg-[var(--success)] shadow-[0_0_15px_rgba(20,184,100,0.5)]' : 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]'}`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : item.order}
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-[var(--foreground)] flex items-center gap-3">
                      {item.concept?.name || "Concept"}
                      <span className={`text-xs px-2 py-1 rounded-full ${isCompleted ? 'bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30' : 'bg-[var(--weak)]/20 text-[var(--weak)] border border-[var(--weak)]/30'}`}>
                        {isCompleted ? "Covered" : "Pending"}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--foreground-soft)] mt-1">Estimated time: {item.estimatedMinutes} minutes</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(item.order, isCompleted ? 'pending' : 'completed');
                    }}
                    className={`p-2 rounded-xl border transition-colors ${isCompleted ? 'bg-[var(--success)] border-[var(--success)] text-white' : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]'}`}
                    title={isCompleted ? "Mark as incomplete" : "Mark as covered"}
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />}
                </div>
              </div>
              
              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--glass-background)_82%,var(--surface-2))]">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[var(--foreground)] mb-1">Why learn this?</h4>
                    <p className="text-sm text-[var(--foreground-soft)] leading-6">{item.reason}</p>
                  </div>
                  
                  {item.concept?.description && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[var(--foreground)] mb-1">Overview</h4>
                      <p className="text-sm text-[var(--foreground-soft)] leading-6">{item.concept.description}</p>
                    </div>
                  )}

                  {item.concept?.keywords?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">Key Topics</h4>
                      <div className="flex flex-wrap gap-2">
                        {item.concept.keywords.map((kw: string, i: number) => (
                          <span key={i} className="px-2 py-1 text-xs rounded-md bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--border)]">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium text-[var(--foreground)] mb-3">Recommended Actions</h4>
                    <div className="flex flex-wrap gap-3">
                      {(item.recommendedResources || []).map((resource: any, index: number) => {
                        const topic = encodeURIComponent(item.concept?.name || "");
                        const count = 10;
                        const difficulty = "medium";
                        let linkPath = "";
                        if (resource.type === "summary") linkPath = `/documents/${selectedDocumentId}?tab=summary&topic=${topic}&count=${count}&difficulty=${difficulty}`;
                        if (resource.type === "quiz") linkPath = `/documents/${selectedDocumentId}?tab=quiz&topic=${topic}&count=${count}&difficulty=${difficulty}`;
                        if (resource.type === "flashcard") linkPath = `/documents/${selectedDocumentId}?tab=flashcards&topic=${topic}&count=${count}&difficulty=${difficulty}&autoFlashcards=1`;
                        if (resource.type === "chat") linkPath = `/documents/${selectedDocumentId}?tab=chat&topic=${topic}&count=${count}&difficulty=${difficulty}`;

                        return (
                          <Link
                            key={`${resource.label}-${index}`}
                            to={linkPath}
                            className="px-4 py-2 rounded-xl text-[var(--foreground)] text-sm border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_86%,var(--surface-2))] hover:border-[var(--accent-primary)] hover:bg-[color-mix(in_srgb,var(--surface-1)_72%,var(--hover-tint))] hover:shadow-sm transition-all flex items-center gap-2"
                          >
                            {resource.type === "summary" && <BookOpen className="w-4 h-4 text-[var(--info)]" />}
                            {resource.type === "quiz" && <CheckCircle className="w-4 h-4 text-[var(--success)]" />}
                            {resource.type === "flashcard" && <Layers className="w-4 h-4 text-[var(--accent-secondary)]" />}
                            {resource.type === "chat" && <MessageSquare className="w-4 h-4 text-[var(--warning)]" />}
                            {resource.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </GlassCard>
            );
          })}
        </div>
      ) : (
        <GlassCard className="p-12 text-center text-[var(--foreground-soft)] study-panel">
          No roadmap is available for this document yet.
        </GlassCard>
      )}
    </div>
  );
}

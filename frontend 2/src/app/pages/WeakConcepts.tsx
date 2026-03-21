import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { conceptApi, documentApi } from "../../services/api";

export default function WeakConcepts() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [weakConcepts, setWeakConcepts] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const docs = await documentApi.getDocuments();
        setDocuments(docs || []);
        if (docs?.length) {
          setSelectedDocumentId(docs[0]._id);
        }
      } catch (error) {
        toast.error("Failed to load documents");
      } finally {
        setIsLoading(false);
      }
    };

    loadDocuments();
  }, []);

  useEffect(() => {
    if (!selectedDocumentId) {
      setWeakConcepts([]);
      setRecommendations([]);
      return;
    }

    const loadWeakConcepts = async () => {
      try {
        const [weak, recs] = await Promise.all([
          conceptApi.getWeakConcepts(selectedDocumentId),
          conceptApi.getRecommendations(selectedDocumentId),
        ]);
        setWeakConcepts(weak || []);
        setRecommendations(recs || []);
      } catch (error) {
        setWeakConcepts([]);
        setRecommendations([]);
        toast.error("Weak concept data is not ready for this document");
      }
    };

    loadWeakConcepts();
  }, [selectedDocumentId]);

  if (!isLoading && documents.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No documents available"
        description="Upload a document first to track weak concepts."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">Weak Concepts</h1>
        <p className="text-[var(--muted-foreground)] text-lg">Review low-mastery concepts and recommended revision resources.</p>
      </div>

      <GlassCard className="p-6">
        <label className="block text-sm text-[var(--muted-foreground)] mb-2">Document</label>
        <select
          value={selectedDocumentId}
          onChange={(event) => setSelectedDocumentId(event.target.value)}
          className="w-full max-w-xl px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-2xl text-[var(--foreground)]"
        >
          {documents.map((document) => (
            <option key={document._id} value={document._id}>
              {document.title}
            </option>
          ))}
        </select>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Detected Weak Concepts</h2>
          <div className="space-y-4">
            {weakConcepts.length ? weakConcepts.map((concept) => (
              <div key={concept.conceptId} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                <div className="font-semibold text-[var(--foreground)]">{concept.conceptName}</div>
                <div className="text-sm text-[var(--muted-foreground)] mt-2">Mastery: {Math.round((concept.masteryScore ?? 0) * 100)}%</div>
                <div className="text-sm text-[var(--muted-foreground)]">Confusion: {Math.round((concept.confusionScore ?? 0) * 100)}%</div>
              </div>
            )) : (
              <div className="text-[var(--muted-foreground)]">No weak concepts available for this document yet.</div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Revision Resources</h2>
          <div className="space-y-4">
            {recommendations.length ? recommendations.map((recommendation) => (
              <div key={recommendation.conceptId} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                <div className="font-semibold text-[var(--foreground)]">{recommendation.conceptName}</div>
                <div className="text-sm text-[var(--muted-foreground)] mt-2">Mastery: {Math.round((recommendation.masteryScore ?? 0) * 100)}%</div>
                <div className="space-y-2 mt-3">
                  {(recommendation.resources || []).map((resource: any) => (
                    <div key={resource.chunkId} className="rounded-xl bg-black/10 p-3">
                      <div className="text-sm text-[var(--foreground)]">{resource.summary}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-2">{resource.excerpt}</div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-[var(--muted-foreground)]">No recommendations available yet.</div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

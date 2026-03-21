import { Network } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { documentApi, graphApi } from "../../services/api";

export default function KnowledgeGraph() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [graph, setGraph] = useState<any | null>(null);
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
      setGraph(null);
      return;
    }

    const loadGraph = async () => {
      try {
        const data = await graphApi.getKnowledgeGraph(selectedDocumentId);
        setGraph(data);
      } catch (error) {
        setGraph(null);
        toast.error("Knowledge graph is not ready for this document");
      }
    };

    loadGraph();
  }, [selectedDocumentId]);

  if (!isLoading && documents.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No documents available"
        description="Upload a document first to generate and visualize its knowledge graph."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">Knowledge Graph</h1>
        <p className="text-[var(--muted-foreground)] text-lg">Visualize detected concepts and their dependencies.</p>
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

      {graph?.nodes?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6 lg:col-span-2">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Concept Nodes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {graph.nodes.map((node: any) => (
                <div key={node.id} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                  <div className="font-semibold text-[var(--foreground)]">{node.label}</div>
                  <div className="text-sm text-[var(--muted-foreground)] mt-2">
                    Difficulty: {Math.round((node.difficulty ?? 0) * 100)}%
                  </div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    Importance: {Math.round((node.importance ?? 0) * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Relationships</h2>
            <div className="space-y-3">
              {graph.edges?.length ? graph.edges.map((edge: any, index: number) => (
                <div key={`${edge.source}-${edge.target}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                  <div className="text-sm text-[var(--muted-foreground)] uppercase tracking-wide">{edge.type}</div>
                  <div className="text-[var(--foreground)] mt-2 break-all">{`${edge.source} -> ${edge.target}`}</div>
                </div>
              )) : (
                <div className="text-[var(--muted-foreground)]">No dependency edges available yet.</div>
              )}
            </div>
          </GlassCard>
        </div>
      ) : (
        <GlassCard className="p-12 text-center text-[var(--muted-foreground)]">
          Knowledge graph data is not available for this document yet.
        </GlassCard>
      )}
    </div>
  );
}

import { Network, Info, GitBranch, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { documentApi, graphApi } from "../../services/api";

const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 600;

const normalizeGraph = (graph: any) => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const incomingCount = new Map<string, number>();

  edges.forEach((edge: any) => {
    const target = `${edge.target}`;
    incomingCount.set(target, (incomingCount.get(target) || 0) + 1);
  });

  const sortedNodes = [...nodes].sort((left: any, right: any) => {
    const leftIncoming = incomingCount.get(`${left.id}`) || 0;
    const rightIncoming = incomingCount.get(`${right.id}`) || 0;
    if (leftIncoming !== rightIncoming) {
      return leftIncoming - rightIncoming;
    }
    return (right.importance || 0) - (left.importance || 0);
  });

  if (!sortedNodes.length) {
    return { nodes: [], edges: [] };
  }

  const [rootNode, ...restNodes] = sortedNodes;
  const rings = [restNodes.slice(0, 6), restNodes.slice(6, 16), restNodes.slice(16)];
  const positionedNodes = [
    {
      ...rootNode,
      x: GRAPH_WIDTH / 2,
      y: GRAPH_HEIGHT / 2,
      radius: 34,
      ring: 0,
    },
  ];

  const ringRadii = [160, 245, 320];
  rings.forEach((ringNodes, ringIndex) => {
    const radius = ringRadii[ringIndex];
    ringNodes.forEach((node: any, index: number) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2) / Math.max(ringNodes.length, 1)) * index;
      positionedNodes.push({
        ...node,
        x: GRAPH_WIDTH / 2 + Math.cos(angle) * radius,
        y: GRAPH_HEIGHT / 2 + Math.sin(angle) * radius,
        radius: Math.max(20, 28 - ringIndex * 3),
        ring: ringIndex + 1,
      });
    });
  });

  return { nodes: positionedNodes, edges };
};

const getNodeFill = (node: any) => {
  const importance = Number(node?.importance || 0);
  const difficulty = Number(node?.difficulty || 0);
  if (importance >= 0.7) return "var(--accent-primary)";
  if (difficulty >= 0.65) return "var(--warning)";
  return "var(--accent-secondary)";
};

const getRelationStroke = (relation: string) => {
  if (relation === "prerequisite") return "var(--warning)";
  if (relation === "parent") return "var(--info)";
  return "var(--muted-foreground)";
};

export default function KnowledgeGraph() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [graph, setGraph] = useState<any | null>(null);
  const [graphStatus, setGraphStatus] = useState<"idle" | "generating" | "ready">("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState("");

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
      setSelectedNodeId("");
      return;
    }

    const loadGraph = async () => {
      try {
        const data = await graphApi.getKnowledgeGraph(selectedDocumentId);
        setGraph(data);
        setGraphStatus(data?.status === "generating" ? "generating" : "ready");
        if (data?.nodes?.length) {
          setSelectedNodeId((current) => current || `${data.nodes[0].id}`);
        }
      } catch (error) {
        setGraph(null);
        setGraphStatus("idle");
        toast.error("Failed to load knowledge graph");
      }
    };

    loadGraph();
  }, [selectedDocumentId]);

  useEffect(() => {
    if (graphStatus !== "generating" || !selectedDocumentId) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const data = await graphApi.getKnowledgeGraph(selectedDocumentId);
        setGraph(data);
        const nextStatus = data?.status === "generating" ? "generating" : "ready";
        setGraphStatus(nextStatus);
        if (nextStatus === "ready" && data?.nodes?.length) {
          setSelectedNodeId(`${data.nodes[0].id}`);
        }
      } catch (_) {
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [graphStatus, selectedDocumentId]);

  const visualGraph = normalizeGraph(graph);
  const selectedNode = visualGraph.nodes.find((node: any) => `${node.id}` === selectedNodeId) || visualGraph.nodes[0] || null;
  const nodeById = new Map(visualGraph.nodes.map((node: any) => [`${node.id}`, node]));

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
        <p className="text-[var(--foreground-soft)] text-lg">Visualize the concepts in your document and how they depend on one another.</p>
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

      {graph?.nodes?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6 lg:col-span-2 study-panel">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-[var(--foreground)]">Concept Map</h2>
                <p className="text-sm text-[var(--foreground-soft)] mt-1">
                  A visual concept map to help you form a mental picture of how the document topics connect.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--foreground-soft)]">
                <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
                Click a node to inspect it
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_84%,var(--hover-tint))] p-4 overflow-hidden">
              <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="w-full h-auto">
                <defs>
                  <radialGradient id="graphGlow" cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor="color-mix(in srgb, var(--accent-primary) 12%, transparent)" />
                    <stop offset="100%" stopColor="transparent" />
                  </radialGradient>
                </defs>
                <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#graphGlow)" />

                {visualGraph.edges.map((edge: any, index: number) => {
                  const source = nodeById.get(`${edge.source}`);
                  const target = nodeById.get(`${edge.target}`);
                  if (!source || !target) {
                    return null;
                  }

                  return (
                    <g key={`${edge.source}-${edge.target}-${index}`}>
                      <line
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={getRelationStroke(edge.relation)}
                        strokeWidth={edge.relation === "prerequisite" ? 2.6 : 1.7}
                        strokeOpacity={0.52}
                      />
                    </g>
                  );
                })}

                {visualGraph.nodes.map((node: any) => {
                  const isSelected = `${node.id}` === `${selectedNode?.id}`;
                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(`${node.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius + (isSelected ? 8 : 0)}
                        fill="transparent"
                        stroke={isSelected ? "var(--accent-primary)" : "transparent"}
                        strokeWidth="2"
                        strokeOpacity={0.45}
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius}
                        fill={getNodeFill(node)}
                        fillOpacity={isSelected ? 0.92 : 0.78}
                        stroke="color-mix(in srgb, white 18%, transparent)"
                        strokeWidth="1.5"
                      />
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        fontSize={node.ring === 0 ? 15 : 12}
                        fontWeight={isSelected ? 700 : 600}
                        fill="color-mix(in srgb, white 92%, var(--page) 8%)"
                      >
                        {`${node.label}`.length > 18 ? `${node.label.slice(0, 18)}…` : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </GlassCard>

          <div className="space-y-6">
            <GlassCard className="p-6 study-panel">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-[var(--accent-primary)]" />
                <h2 className="text-2xl font-bold text-[var(--foreground)]">Selected Concept</h2>
              </div>
              {selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-semibold text-[var(--foreground)]">{selectedNode.label}</div>
                    <div className="text-sm text-[var(--foreground-soft)] mt-1 capitalize">
                      {selectedNode.type || "topic"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_82%,var(--surface-2))] p-3">
                      <div className="text-xs uppercase tracking-wide text-[var(--foreground-soft)]">Importance</div>
                      <div className="text-[var(--foreground)] font-semibold mt-1">
                        {Math.round((selectedNode.importance ?? 0) * 100)}%
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_82%,var(--surface-2))] p-3">
                      <div className="text-xs uppercase tracking-wide text-[var(--foreground-soft)]">Difficulty</div>
                      <div className="text-[var(--foreground)] font-semibold mt-1">
                        {Math.round((selectedNode.difficulty ?? 0) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[var(--muted-foreground)]">Select a node to inspect it.</div>
              )}
            </GlassCard>

            <GlassCard className="p-6 study-panel">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className="w-5 h-5 text-[var(--accent-primary)]" />
                <h2 className="text-2xl font-bold text-[var(--foreground)]">Relationships</h2>
              </div>
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {graph.edges?.length ? graph.edges.map((edge: any, index: number) => {
                  const source = nodeById.get(`${edge.source}`);
                  const target = nodeById.get(`${edge.target}`);
                  return (
                    <div key={`${edge.source}-${edge.target}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-1)_84%,var(--surface-2))] p-4">
                      <div className="text-sm uppercase tracking-wide font-semibold" style={{ color: getRelationStroke(edge.relation) }}>
                        {edge.relation}
                      </div>
                      <div className="text-[var(--foreground-soft)] mt-2 leading-6">
                        {source?.label || edge.source} → {target?.label || edge.target}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-[var(--muted-foreground)]">No dependency edges available yet.</div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : (
        <GlassCard className="p-12 text-center text-[var(--foreground-soft)] study-panel">
          {graphStatus === "generating"
            ? "Knowledge graph is being generated for this document. Please check again in a moment."
            : "Knowledge graph data is not available for this document yet."}
        </GlassCard>
      )}
    </div>
  );
}

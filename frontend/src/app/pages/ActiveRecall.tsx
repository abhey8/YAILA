import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { documentApi, recallApi } from "../../services/api";

export default function ActiveRecall() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [session, setSession] = useState<any | null>(null);
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const currentExchange = session?.exchanges?.[session.exchanges.length - 1];

  const handleStart = async () => {
    if (!selectedDocumentId) {
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await recallApi.startSession(selectedDocumentId);
      setSession(data);
      setAnswer("");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Active recall is not available for this document");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!session?._id || !answer.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await recallApi.submitAnswer(session._id, answer);
      setSession(data);
      setAnswer("");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoading && documents.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="No documents available"
        description="Upload a document first to start active recall sessions."
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">Active Recall</h1>
        <p className="text-[var(--muted-foreground)] text-lg">Start a free-response tutor session grounded in one uploaded document.</p>
      </div>

      <GlassCard className="p-6 space-y-4">
        <div>
          <label className="block text-sm text-[var(--muted-foreground)] mb-2">Document</label>
          <select
            value={selectedDocumentId}
            onChange={(event) => {
              setSelectedDocumentId(event.target.value);
              setSession(null);
              setAnswer("");
            }}
            className="w-full max-w-xl px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-2xl text-[var(--foreground)]"
          >
            {documents.map((document) => (
              <option key={document._id} value={document._id}>
                {document.title}
              </option>
            ))}
          </select>
        </div>

        {!session ? (
          <button
            onClick={handleStart}
            disabled={!selectedDocumentId || isSubmitting}
            className="px-4 py-3 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white rounded-2xl disabled:opacity-60"
          >
            {isSubmitting ? "Starting..." : "Start Session"}
          </button>
        ) : (
          <div className="text-sm text-[var(--muted-foreground)]">
            Session status: <span className="text-[var(--foreground)]">{session.status}</span>
          </div>
        )}
      </GlassCard>

      {session ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Current Question</h2>
            <div className="text-[var(--foreground)] leading-relaxed">{currentExchange?.question || "No question available."}</div>
            {currentExchange?.hint ? (
              <div className="mt-4 text-sm text-[var(--muted-foreground)]">Hint: {currentExchange.hint}</div>
            ) : null}
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={8}
              placeholder="Write your answer here..."
              className="w-full mt-6 px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-2xl text-[var(--foreground)]"
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !answer.trim() || session.status === "completed"}
              className="mt-4 px-4 py-3 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white rounded-2xl disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : session.status === "completed" ? "Session Complete" : "Submit Answer"}
            </button>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Session History</h2>
            <div className="space-y-4">
              {session.exchanges.map((exchange: any, index: number) => (
                <div key={index} className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                  <div className="font-medium text-[var(--foreground)]">{exchange.question}</div>
                  {exchange.answer ? <div className="text-sm text-[var(--foreground)] mt-3">Your answer: {exchange.answer}</div> : null}
                  {exchange.feedback ? <div className="text-sm text-[var(--muted-foreground)] mt-2">Feedback: {exchange.feedback}</div> : null}
                  {typeof exchange.score === "number" && exchange.answer ? (
                    <div className="text-sm text-[var(--muted-foreground)] mt-2">Score: {Math.round(exchange.score * 100)}%</div>
                  ) : null}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}

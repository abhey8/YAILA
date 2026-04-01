import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, FileText, MessageSquare, BookOpen, Brain, Sparkles } from "lucide-react";
import { ChatMessage } from "../components/ChatMessage";
import { FlashcardComponent } from "../components/FlashcardComponent";
import { toast } from "sonner";
import { aiApi, documentApi, flashcardApi, quizApi } from "../../services/api";

function cleanSummaryLine(line: string) {
  return line
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

function renderReadableSummary(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    <div className="space-y-4">
      {lines.map((line, index) => {
        const normalizedLine = cleanSummaryLine(line);
        const heading = normalizedLine.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <h4 key={index} className="text-[var(--foreground)] font-semibold text-lg mt-5 first:mt-0">
              {heading[1].trim()}
            </h4>
          );
        }

        const bullet = normalizedLine.match(/^[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={index} className="flex items-start gap-3 text-[var(--foreground-soft)] leading-7">
              <span className="mt-1 text-[var(--accent-primary)]">•</span>
              <span>{bullet[1].trim()}</span>
            </div>
          );
        }

        const numbered = normalizedLine.match(/^(\d+)\.\s+(.*)$/);
        if (numbered) {
          return (
            <div key={index} className="flex items-start gap-3 leading-7">
              <span className="min-w-6 font-semibold text-[var(--foreground)]">{numbered[1]}.</span>
              <span className="text-[var(--foreground-soft)]">{numbered[2].trim()}</span>
            </div>
          );
        }

        return (
          <p key={index} className="text-[var(--foreground-soft)] leading-8">
            {normalizedLine}
          </p>
        );
      })}
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "flashcards" | "quiz">("chat");
  const [chatInput, setChatInput] = useState("");
  const [document, setDocument] = useState<any | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [isRefreshingDocument, setIsRefreshingDocument] = useState(false);
  const [messages, setMessages] = useState<{ role: "assistant" | "user", content: string, citations?: any[] }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [summary, setSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [quizCount, setQuizCount] = useState("5");
  const [quizDifficulty, setQuizDifficulty] = useState("medium");
  const [flashcardCount, setFlashcardCount] = useState("10");
  const [topicFocus, setTopicFocus] = useState("");
  const [topicExplanation, setTopicExplanation] = useState("");
  const [isGeneratingTopicExplanation, setIsGeneratingTopicExplanation] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const topic = searchParams.get("topic") || "";
    const count = searchParams.get("count");
    const difficulty = searchParams.get("difficulty");
    if (tab && ["chat", "summary", "flashcards", "quiz"].includes(tab)) {
      setActiveTab(tab as "chat" | "summary" | "flashcards" | "quiz");
    }
    if (topic) {
      setTopicFocus(topic);
    }
    if (count && ["5", "10", "15", "20"].includes(count)) {
      setQuizCount(count);
    }
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      setQuizDifficulty(difficulty);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!id) return;
    const raw = localStorage.getItem(`quiz-settings-${id}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.count && ["5", "10", "15", "20"].includes(String(parsed.count))) {
        setQuizCount(String(parsed.count));
      }
      if (parsed?.difficulty && ["easy", "medium", "hard"].includes(parsed.difficulty)) {
        setQuizDifficulty(parsed.difficulty);
      }
    } catch (_) {
    }
  }, [id]);

  const tabs = [
    { id: "chat", label: "AI Chat", icon: MessageSquare },
    { id: "summary", label: "Summary & Explain", icon: Sparkles },
    { id: "flashcards", label: "Flashcards", icon: BookOpen },
    { id: "quiz", label: "Quiz", icon: Brain },
  ];

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadDocumentWorkspace = async () => {
      try {
        setIsLoadingDocument(true);
        setIsLoadingHistory(true);
        setIsLoadingFlashcards(true);

        const documentData = await documentApi.getDocument(id);

        setDocument(documentData);

        const history = documentData.ingestionStatus === "completed"
          ? await aiApi.getHistory(id)
          : [];

        const formattedHistory = (history || []).map((item: any) => ({
          role: item.role === "ai" ? "assistant" : "user",
          content: item.content,
          citations: item.citations || [],
        }));

        setMessages(formattedHistory);
        const flashcardData = await flashcardApi.getByDocument(id);
        setFlashcards(flashcardData || []);
      } catch (error) {
        toast.error("Failed to load this document");
      } finally {
        setIsLoadingDocument(false);
        setIsLoadingHistory(false);
        setIsLoadingFlashcards(false);
      }
    };

    loadDocumentWorkspace();
  }, [id]);

  useEffect(() => {
    if (!id || !document || document.ingestionStatus === "completed" || document.ingestionStatus === "failed") {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        setIsRefreshingDocument(true);
        const latest = await documentApi.getDocument(id);
        setDocument(latest);

        if (latest.ingestionStatus === "completed") {
          const history = await aiApi.getHistory(id);
          const formattedHistory = (history || []).map((item: any) => ({
            role: item.role === "ai" ? "assistant" : "user",
            content: item.content,
            citations: item.citations || [],
          }));
          setMessages(formattedHistory);
          const flashcardData = await flashcardApi.getByDocument(id);
          setFlashcards(flashcardData || []);
          window.clearInterval(intervalId);
        }

        if (latest.ingestionStatus === "failed") {
          window.clearInterval(intervalId);
          toast.error(latest.ingestionError || "Document processing failed");
        }
      } catch (error) {
      } finally {
        setIsRefreshingDocument(false);
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [id, document]);

  useEffect(() => {
    if (!id || document?.ingestionStatus !== "completed" || activeTab !== "summary" || !topicFocus.trim()) {
      return;
    }

    let cancelled = false;
    const loadTopicExplanation = async () => {
      try {
        setIsGeneratingTopicExplanation(true);
        const response = await aiApi.explain({
          text: topicFocus,
          mode: "deep",
          documentId: id,
        });
        if (!cancelled) {
          setTopicExplanation(response?.explanation || "");
        }
      } catch (error) {
        if (!cancelled) {
          setTopicExplanation("");
          toast.error("Failed to generate topic explanation");
        }
      } finally {
        if (!cancelled) {
          setIsGeneratingTopicExplanation(false);
        }
      }
    };

    loadTopicExplanation();
    return () => {
      cancelled = true;
    };
  }, [id, document?.ingestionStatus, activeTab, topicFocus]);

  const isDocumentReady = document?.ingestionStatus === "completed";
  const isTopicFlow = Boolean(topicFocus.trim());

  const updateTabQuery = (
    tab: "chat" | "summary" | "flashcards" | "quiz",
    extraParams: Record<string, string | null> = {}
  ) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    if (topicFocus.trim()) {
      params.set("topic", topicFocus.trim());
    }
    params.set("count", quizCount);
    params.set("difficulty", quizDifficulty);
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    setSearchParams(params, { replace: true });
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !id || !isDocumentReady) return;

    const userMessage: { role: "user" | "assistant", content: string, citations?: any[] } = { role: "user", content: chatInput };
    const historyForApi = messages.map((message) => ({
      role: message.role === "assistant" ? "ai" : "user",
      content: message.content,
    }));

    setMessages(prev => [...prev, userMessage]);
    setChatInput("");

    try {
      const response = await aiApi.chat(id, userMessage.content, historyForApi);
      const aiResponse: { role: "user" | "assistant", content: string, citations?: any[] } = {
        role: "assistant",
        content: response.reply || response.content || 'Something went wrong',
        citations: response.citations || [],
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (err) {
      toast.error("Failed to fetch response");
    }
  };

  const handleGenerateSummary = async (regenerate = false) => {
    if (!id || !isDocumentReady) return;

    setIsGenerating(true);
    try {
      const response = await aiApi.getSummary(id, regenerate);
      setSummary(response.summary || "");
    } catch (error) {
      toast.error("Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateTopicSummary = async () => {
    if (!id || !isDocumentReady || !topicFocus.trim()) return;
    setIsGeneratingTopicExplanation(true);
    try {
      const response = await aiApi.explain({
        text: topicFocus,
        mode: "deep",
        documentId: id,
      });
      setTopicExplanation(response?.explanation || "");
    } catch (error) {
      toast.error("Failed to generate topic summary");
    } finally {
      setIsGeneratingTopicExplanation(false);
    }
  };

  const handleGenerateFlashcards = (append = false) => {
    if (!id || !isDocumentReady) return;

    setIsGeneratingFlashcards(true);
    const shouldRegenerate = !append && flashcards.length > 0;
    flashcardApi.generate(id, {
      regenerate: shouldRegenerate,
      append,
      count: Number(flashcardCount) || 10,
    })
      .then((generated) => {
        setFlashcards(generated || []);
        toast.success(append ? "More flashcards generated" : "Flashcards generated from this document");
      })
      .catch((error) => {
        toast.error(error?.response?.data?.message || "Failed to generate flashcards");
      })
      .finally(() => {
        setIsGeneratingFlashcards(false);
      });
  };

  useEffect(() => {
    if (!id || !isDocumentReady || activeTab !== "flashcards" || !isTopicFlow) {
      return;
    }
    if (searchParams.get("autoFlashcards") !== "1") {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.delete("autoFlashcards");
    setSearchParams(params, { replace: true });

    setFlashcardCount("10");
    setIsGeneratingFlashcards(true);
    flashcardApi.generate(id, {
      regenerate: true,
      append: false,
      count: 10,
    })
      .then((generated) => {
        setFlashcards(generated || []);
        toast.success("10 flashcards generated for this roadmap topic");
      })
      .catch(() => {
        toast.error("Failed to auto-generate flashcards");
      })
      .finally(() => {
        setIsGeneratingFlashcards(false);
      });
  }, [id, isDocumentReady, activeTab, isTopicFlow, searchParams, setSearchParams]);

  const handleToggleFavorite = async (flashcardId: string) => {
    try {
      const updated = await flashcardApi.toggleFavorite(flashcardId);
      setFlashcards((current) =>
        current.map((card) => (card._id === flashcardId ? updated : card))
      );
    } catch (error) {
      toast.error("Failed to update flashcard");
    }
  };

  const handleDeleteFlashcard = async (flashcardId: string) => {
    try {
      await flashcardApi.delete(flashcardId);
      setFlashcards((current) => current.filter((card) => card._id !== flashcardId));
      toast.success("Flashcard deleted");
    } catch (error) {
      toast.error("Failed to delete flashcard");
    }
  };

  const handleStartQuiz = async () => {
    if (!id || !isDocumentReady) return;
    setIsGenerating(true);
    try {
      localStorage.setItem(`quiz-settings-${id}`, JSON.stringify({
        count: Number(quizCount) || 5,
        difficulty: quizDifficulty,
      }));
      const quiz = await quizApi.generate(id, {
        count: parseInt(quizCount),
        difficulty: quizDifficulty,
      });
      navigate(`/quiz/${quiz._id}`);
    } catch (err) {
       toast.error((err as any)?.response?.data?.message || "Failed to generate quiz. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return "Unknown upload date";
    return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 MB";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const pageCount = document?.metadata?.pageCount || 0;

  if (isLoadingDocument) {
    return <div className="max-w-7xl mx-auto text-[var(--muted-foreground)]">Loading document...</div>;
  }

  if (!document) {
    return <div className="max-w-7xl mx-auto text-[var(--weak)]">Document not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate("/documents")}
          className="flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Documents
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-[var(--accent-soft)] rounded-lg flex items-center justify-center flex-shrink-0 border border-[var(--border)]">
            <FileText className="w-6 h-6 text-[var(--accent-primary)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{document.title || document.originalName}</h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              {pageCount} pages • {formatSize(document.size)} • Uploaded {formatDate(document.createdAt)}
            </p>
            <p className="text-sm mt-2 text-[var(--muted-foreground)]">
              Status: {document.ingestionStatus}
              {isRefreshingDocument ? " • refreshing..." : ""}
            </p>
            {document?.ingestionProgress?.stage && document.ingestionStatus !== "completed" ? (
              <p className="text-sm mt-1 text-[var(--muted-foreground)]">
                Stage: {document.ingestionProgress.stage} • {document.ingestionProgress.progressPercent || 0}% • {document.ingestionProgress.processedChunks || 0}/{document.ingestionProgress.totalChunks || 0} chunks
              </p>
            ) : null}
            {document.ingestionStatus !== "completed" ? (
              <p className="text-sm mt-1 text-[var(--warning)]">
                AI features will unlock after document processing completes.
              </p>
            ) : null}
            {document.ingestionStatus === "failed" ? (
              <p className="text-sm mt-1 text-[var(--weak)]">
                {document.ingestionError || "Document processing failed."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="study-panel rounded-xl overflow-hidden">
        <div className="border-b border-[var(--border)] flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                const nextTab = tab.id as "chat" | "summary" | "flashcards" | "quiz";
                setActiveTab(nextTab);
                updateTabQuery(nextTab);
              }}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "chat" && (
            <div className="space-y-4">
              <div className="h-96 overflow-y-auto space-y-4 p-4 rounded-lg study-panel-quiet">
                {!isLoadingHistory && messages.length === 0 && (
                  <div className="text-[var(--muted-foreground)]">
                    Ask anything about <span className="font-medium">{document.title || document.originalName}</span>.
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <ChatMessage key={idx} role={msg.role} content={msg.content} citations={msg.citations} />
                ))}
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Ask anything about this document..."
                  disabled={!isDocumentReady}
                  className="flex-1 px-4 py-3 rounded-lg study-input"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!isDocumentReady}
                  className="px-6 py-3 rounded-lg study-button-primary"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {activeTab === "summary" && (
            <div className="space-y-6">
              {isTopicFlow ? (
                <div className="p-4 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)]/40">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Topic Summary: {topicFocus}</h3>
                  {isGeneratingTopicExplanation ? (
                    <p className="text-[var(--muted-foreground)]">Generating topic summary...</p>
                  ) : topicExplanation ? (
                    renderReadableSummary(topicExplanation)
                  ) : (
                    <p className="text-[var(--muted-foreground)]">Topic summary is not ready yet.</p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--glass-border)] pt-4">
                    <button
                      onClick={handleGenerateTopicSummary}
                      disabled={isGeneratingTopicExplanation || !isDocumentReady}
                      className="px-4 py-2 rounded-lg study-button-secondary"
                    >
                      {isGeneratingTopicExplanation ? "Generating..." : "Dive Deeper"}
                    </button>
                    <button
                      onClick={() => {
                        setFlashcardCount("10");
                        setActiveTab("flashcards");
                        updateTabQuery("flashcards", { autoFlashcards: "1", count: "10" });
                      }}
                      className="px-4 py-2 rounded-lg study-button-secondary"
                    >
                      Move to Flashcards
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("quiz");
                        updateTabQuery("quiz");
                      }}
                      className="px-4 py-2 rounded-lg study-button-secondary"
                    >
                      Move to Quiz
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Document Summary</h3>
                {summary ? (
                  <div className="p-6 rounded-lg border border-[var(--accent-primary)]/20 bg-[var(--accent-soft)]">
                    {renderReadableSummary(summary)}
                    <button
                      onClick={() => handleGenerateSummary(true)}
                      disabled={isGenerating || !isDocumentReady}
                      className="mt-4 px-4 py-2 rounded-lg study-button-primary"
                    >
                      Regenerate Summary
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
                    <p className="text-[var(--muted-foreground)] mb-4">Generate an AI-powered summary of this document</p>
                    <button
                      onClick={() => handleGenerateSummary()}
                      disabled={isGenerating || !isDocumentReady}
                      className="px-6 py-3 rounded-lg study-button-primary"
                    >
                      {isGenerating ? "Generating..." : "Generate Summary"}
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {activeTab === "flashcards" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {flashcards.length} Flashcards
                </h3>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  {isTopicFlow ? (
                    <button
                      onClick={() => {
                        setActiveTab("summary");
                        updateTabQuery("summary");
                      }}
                      className="px-4 py-2 rounded-lg study-button-secondary"
                    >
                      Back to Summary
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleGenerateFlashcards(true)}
                    disabled={isGeneratingFlashcards || !isDocumentReady}
                    className="px-4 py-2 rounded-lg study-button-secondary"
                  >
                    {isGeneratingFlashcards ? "Generating..." : "Add More Cards"}
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("quiz");
                      updateTabQuery("quiz");
                    }}
                    className="px-4 py-2 rounded-lg study-button-secondary"
                  >
                    Move to Quiz
                  </button>
                  <button
                    onClick={() => handleGenerateFlashcards(false)}
                    disabled={isGeneratingFlashcards || !isDocumentReady}
                    className="px-4 py-2 rounded-lg study-button-secondary"
                  >
                    {isGeneratingFlashcards ? "Generating..." : flashcards.length ? "Replace Set" : "Generate Cards"}
                  </button>
                </div>
              </div>

              <div className="max-w-xs">
                <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">Cards per generation</label>
                <select
                  value={flashcardCount}
                  onChange={(e) => setFlashcardCount(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg study-input"
                >
                  <option value="5">5 cards</option>
                  <option value="10">10 cards</option>
                  <option value="15">15 cards</option>
                  <option value="20">20 cards</option>
                </select>
              </div>

              {isLoadingFlashcards ? (
                <div className="text-[var(--muted-foreground)]">Loading flashcards...</div>
              ) : flashcards.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {flashcards.map((card) => (
                    <FlashcardComponent
                      key={card._id}
                      id={card._id}
                      front={card.question}
                      back={card.answer}
                      isFavorite={card.isFavorite}
                      onToggleFavorite={handleToggleFavorite}
                      onDelete={handleDeleteFlashcard}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
                  No flashcards yet for this document. Generate them from the uploaded content.
                </div>
              )}
            </div>
          )}

          {activeTab === "quiz" && (
            <div className="text-center py-12">
              <Brain className="w-16 h-16 text-[var(--accent-primary)] mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-[var(--foreground)] mb-4">Ready to test your knowledge?</h3>
              <p className="text-[var(--muted-foreground)] mb-8 max-w-md mx-auto leading-7">
                Generate a quiz based on this document and see how well you understand the material
              </p>
              
              <div className="max-w-sm mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2 text-left">
                    Number of Questions
                  </label>
                  <select
                    value={quizCount}
                    onChange={(e) => setQuizCount(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg study-input"
                  >
                    <option value="5">5 questions</option>
                    <option value="10">10 questions</option>
                    <option value="15">15 questions</option>
                    <option value="20">20 questions</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2 text-left">
                    Difficulty
                  </label>
                  <select
                    value={quizDifficulty}
                    onChange={(e) => setQuizDifficulty(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg study-input"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <button
                  onClick={handleStartQuiz}
                  disabled={isGenerating || !isDocumentReady}
                  className="w-full px-6 py-3 rounded-lg study-button-primary"
                >
                  {isGenerating ? "Generating..." : "Start Quiz"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

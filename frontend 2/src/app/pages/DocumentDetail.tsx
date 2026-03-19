import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, FileText, MessageSquare, BookOpen, Brain, Sparkles } from "lucide-react";
import { ChatMessage } from "../components/ChatMessage";
import { FlashcardComponent } from "../components/FlashcardComponent";
import { toast } from "sonner";
import { aiApi, documentApi, flashcardApi, quizApi } from "../../services/api";

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "flashcards" | "quiz">("chat");
  const [chatInput, setChatInput] = useState("");
  const [document, setDocument] = useState<any | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [isRefreshingDocument, setIsRefreshingDocument] = useState(false);
  const [messages, setMessages] = useState<{ role: "assistant" | "user", content: string }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [summary, setSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [quizCount, setQuizCount] = useState("5");

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
        }));

        setMessages(formattedHistory);
        const flashcardData = await flashcardApi.getByDocument(id);
        setFlashcards(flashcardData || []);
      } catch (error) {
        console.error("Failed to load document workspace", error);
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
        console.error("Failed to refresh ingestion status", error);
      } finally {
        setIsRefreshingDocument(false);
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [id, document]);

  const isDocumentReady = document?.ingestionStatus === "completed";

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !id || !isDocumentReady) return;

    const userMessage: { role: "user" | "assistant", content: string } = { role: "user", content: chatInput };
    const historyForApi = messages.map((message) => ({
      role: message.role === "assistant" ? "ai" : "user",
      content: message.content,
    }));

    setMessages(prev => [...prev, userMessage]);
    setChatInput("");

    try {
      const response = await aiApi.chat(id, userMessage.content, historyForApi);
      const aiResponse: { role: "user" | "assistant", content: string } = {
        role: "assistant",
        content: response.reply || response.content || 'Something went wrong',
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
      console.error("Failed to generate summary", error);
      toast.error("Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFlashcards = () => {
    if (!id || !isDocumentReady) return;

    setIsGeneratingFlashcards(true);
    flashcardApi.generate(id, flashcards.length > 0)
      .then((generated) => {
        setFlashcards(generated || []);
        toast.success("Flashcards generated from this document");
      })
      .catch((error) => {
        console.error("Failed to generate flashcards", error);
        toast.error("Failed to generate flashcards");
      })
      .finally(() => {
        setIsGeneratingFlashcards(false);
      });
  };

  const handleToggleFavorite = async (flashcardId: string) => {
    try {
      const updated = await flashcardApi.toggleFavorite(flashcardId);
      setFlashcards((current) =>
        current.map((card) => (card._id === flashcardId ? updated : card))
      );
    } catch (error) {
      console.error("Failed to update flashcard favorite", error);
      toast.error("Failed to update flashcard");
    }
  };

  const handleDeleteFlashcard = async (flashcardId: string) => {
    try {
      await flashcardApi.delete(flashcardId);
      setFlashcards((current) => current.filter((card) => card._id !== flashcardId));
      toast.success("Flashcard deleted");
    } catch (error) {
      console.error("Failed to delete flashcard", error);
      toast.error("Failed to delete flashcard");
    }
  };

  const handleStartQuiz = async () => {
    if (!id || !isDocumentReady) return;
    setIsGenerating(true);
    try {
      const quiz = await quizApi.generate(id, { count: parseInt(quizCount) });
      navigate(`/quiz/${quiz._id}`);
    } catch (err) {
       toast.error("Failed to generate quiz. Please try again.");
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
    return <div className="max-w-7xl mx-auto text-gray-600 dark:text-gray-400">Loading document...</div>;
  }

  if (!document) {
    return <div className="max-w-7xl mx-auto text-red-600">Document not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate("/documents")}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Documents
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{document.title || document.originalName}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {pageCount} pages • {formatSize(document.size)} • Uploaded {formatDate(document.createdAt)}
            </p>
            <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">
              Status: {document.ingestionStatus}
              {isRefreshingDocument ? " • refreshing..." : ""}
            </p>
            {document.ingestionStatus !== "completed" ? (
              <p className="text-sm mt-1 text-amber-600 dark:text-amber-400">
                AI features will unlock after document processing completes.
              </p>
            ) : null}
            {document.ingestionStatus === "failed" ? (
              <p className="text-sm mt-1 text-red-600 dark:text-red-400">
                {document.ingestionError || "Document processing failed."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
              <div className="h-96 overflow-y-auto space-y-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                {!isLoadingHistory && messages.length === 0 && (
                  <div className="text-gray-600 dark:text-gray-300">
                    Ask anything about <span className="font-medium">{document.title || document.originalName}</span>.
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <ChatMessage key={idx} role={msg.role} content={msg.content} />
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
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!isDocumentReady}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {activeTab === "summary" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Document Summary</h3>
                {summary ? (
                  <div className="p-6 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    <div className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{summary}</div>
                    <button
                      onClick={() => handleGenerateSummary(true)}
                      disabled={isGenerating || !isDocumentReady}
                      className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                      Regenerate Summary
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Generate an AI-powered summary of this document</p>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isGenerating || !isDocumentReady}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                      {isGenerating ? "Generating..." : "Generate Summary"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Explain a Concept</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Enter a topic from the document..."
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">
                    Explain
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "flashcards" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {flashcards.length} Flashcards
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(`/flashcards/review?documentId=${id}`)}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Review
                  </button>
                  <button
                    onClick={handleGenerateFlashcards}
                    disabled={isGeneratingFlashcards || !isDocumentReady}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
                  >
                    {isGeneratingFlashcards ? "Generating..." : flashcards.length ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>

              {isLoadingFlashcards ? (
                <div className="text-gray-600 dark:text-gray-300">Loading flashcards...</div>
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
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-gray-600 dark:text-gray-300">
                  No flashcards yet for this document. Generate them from the uploaded content.
                </div>
              )}
            </div>
          )}

          {activeTab === "quiz" && (
            <div className="text-center py-12">
              <Brain className="w-16 h-16 text-indigo-600 dark:text-indigo-400 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Ready to test your knowledge?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Generate a quiz based on this document and see how well you understand the material
              </p>
              
              <div className="max-w-sm mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
                    Number of Questions
                  </label>
                  <select
                    value={quizCount}
                    onChange={(e) => setQuizCount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="5">5 questions</option>
                    <option value="10">10 questions</option>
                    <option value="15">15 questions</option>
                    <option value="20">20 questions</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
                    Difficulty
                  </label>
                  <select className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </div>

                <button
                  onClick={handleStartQuiz}
                  disabled={isGenerating || !isDocumentReady}
                  className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
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

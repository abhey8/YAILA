import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { FlashcardComponent } from "../components/FlashcardComponent";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { activityApi, flashcardApi } from "../../services/api";

export default function FlashcardReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const documentId = params.get("documentId");

    const loadFlashcards = async () => {
      try {
        setLoading(true);
        const data = documentId
          ? await flashcardApi.getByDocument(documentId)
          : await flashcardApi.getFavorites();
        setFlashcards(data || []);
        if (documentId) {
          await activityApi.track({
            type: "flashcards-reviewed",
            title: "Flashcards reviewed",
            description: "A document flashcard review session was started.",
            documentId,
            metadata: { count: data?.length || 0 },
          });
        }
      } catch (error) {
        toast.error("Failed to load flashcards");
      } finally {
        setLoading(false);
      }
    };

    loadFlashcards();
  }, [location.search]);

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleShuffle = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentIndex(0);
    toast.success("Flashcards shuffled!");
  };

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

  const handleDelete = async (flashcardId: string) => {
    try {
      await flashcardApi.delete(flashcardId);
    } catch (error) {
      toast.error("Failed to delete flashcard");
      return;
    }

    const newFlashcards = flashcards.filter(card => card._id !== flashcardId);
    setFlashcards(newFlashcards);
    if (currentIndex >= newFlashcards.length && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    toast.success("Flashcard deleted");
  };

  const progress = ((currentIndex + 1) / flashcards.length) * 100;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-[var(--foreground-soft)]">
        Loading flashcards...
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/documents")}
          className="flex items-center gap-2 text-[var(--foreground-soft)] hover:text-[var(--foreground)] mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Documents
        </button>
        
        <div className="study-panel rounded-xl p-12 text-center">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">No Flashcards</h2>
          <p className="text-[var(--foreground-soft)] mb-6">You've removed all flashcards. Go to a document to generate more.</p>
          <button
            onClick={() => navigate("/documents")}
            className="px-6 py-3 rounded-lg font-medium study-button-primary"
          >
            Browse Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate("/documents")}
          className="flex items-center gap-2 text-[var(--foreground-soft)] hover:text-[var(--foreground)] mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Documents
        </button>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Flashcard Review</h1>
          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-4 py-2 rounded-lg study-button-secondary"
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </button>
        </div>

        <div className="study-progress-track rounded-full h-2 mb-2">
          <motion.div
            className="study-progress-fill h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="text-sm text-[var(--foreground-soft)] text-right">
          {currentIndex + 1} of {flashcards.length}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="p-3 rounded-full study-button-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-[var(--foreground)]" />
        </button>

        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <FlashcardComponent
                id={flashcards[currentIndex]._id}
                front={flashcards[currentIndex].question}
                back={flashcards[currentIndex].answer}
                isFavorite={flashcards[currentIndex].isFavorite}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={handleNext}
          disabled={currentIndex === flashcards.length - 1}
          className="p-3 rounded-full study-button-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-6 h-6 text-[var(--foreground)]" />
        </button>
      </div>

      <div className="study-status-panel-info rounded-lg p-4">
        <h3 className="font-semibold text-[var(--info)] mb-2">Tips</h3>
        <ul className="text-sm text-[var(--foreground-soft)] space-y-1">
          <li>• Click on a card to flip it</li>
          <li>• Use arrow buttons to navigate</li>
          <li>• Mark important cards as favorites</li>
          <li>• Shuffle for spaced repetition practice</li>
        </ul>
      </div>

      <div className="study-panel rounded-xl p-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-4">All Flashcards</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {flashcards.map((card, index) => (
            <button
              key={card._id}
              onClick={() => setCurrentIndex(index)}
              className={`aspect-square rounded-lg font-medium transition-all ${
                currentIndex === index
                  ? "text-white shadow-lg scale-105 bg-[image:var(--accent-gradient)]"
                  : card.isFavorite
                  ? "status-weak"
                  : "study-button-secondary text-[var(--foreground-soft)] hover:text-[var(--foreground)]"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

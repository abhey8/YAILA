import { useState } from "react";
import { motion } from "motion/react";
import { Heart, Trash2 } from "lucide-react";

interface FlashcardProps {
  id: string;
  front: string;
  back: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function FlashcardComponent({ 
  id, 
  front, 
  back, 
  isFavorite, 
  onToggleFavorite,
  onDelete 
}: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="perspective-1000 h-80 flex flex-col">
      <motion.div
        className="relative w-full flex-1 cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 rounded-xl p-6 flex flex-col items-center justify-center text-[var(--primary-foreground)] shadow-[var(--shadow-soft)] border"
          style={{
            backfaceVisibility: "hidden",
            background: "linear-gradient(160deg, color-mix(in srgb, var(--accent-primary) 92%, white 8%) 0%, color-mix(in srgb, var(--accent-secondary) 72%, var(--accent-primary) 28%) 100%)",
            borderColor: "color-mix(in srgb, var(--accent-primary) 34%, transparent)",
          }}
        >
          <div className="text-sm font-medium opacity-80 mb-4 tracking-wide">Question</div>
          <div className="text-center text-lg font-medium">{front}</div>
          <div className="mt-6 text-sm opacity-70">Click to flip</div>
        </div>

        <div
          className="absolute inset-0 study-panel rounded-xl p-6 flex flex-col items-center justify-center"
          style={{ 
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)" 
          }}
        >
          <div className="text-sm font-medium text-[var(--accent-primary)] mb-4 tracking-wide">Answer</div>
          <div className="text-center text-[var(--foreground)] leading-7">{back}</div>
        </div>
      </motion.div>

      <div className="mt-3 h-11 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 flex items-center justify-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(id);
          }}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors border ${
            isFavorite 
              ? "status-weak" 
              : "study-button-secondary text-[var(--muted-foreground)] hover:text-[var(--weak)]"
          }`}
        >
          <Heart className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(id);
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border study-button-secondary text-[var(--muted-foreground)] hover:text-[var(--weak)]"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

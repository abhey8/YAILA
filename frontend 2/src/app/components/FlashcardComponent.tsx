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
    <div className="perspective-1000 h-64">
      <motion.div
        className="relative w-full h-full cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 flex flex-col items-center justify-center text-white shadow-lg"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-sm font-medium opacity-80 mb-4">Question</div>
          <div className="text-center text-lg font-medium">{front}</div>
          <div className="mt-6 text-sm opacity-70">Click to flip</div>
        </div>

        <div
          className="absolute inset-0 bg-white border-2 border-indigo-300 rounded-xl p-6 flex flex-col items-center justify-center shadow-lg"
          style={{ 
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)" 
          }}
        >
          <div className="text-sm font-medium text-indigo-600 mb-4">Answer</div>
          <div className="text-center text-gray-900">{back}</div>
        </div>
      </motion.div>

      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(id);
          }}
          className={`p-2 rounded-lg transition-colors ${
            isFavorite 
              ? "bg-red-100 text-red-600" 
              : "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600"
          }`}
        >
          <Heart className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(id);
          }}
          className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

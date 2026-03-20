import { motion } from "motion/react";

interface QuizQuestionCardProps {
  question: string;
  options: string[];
  selectedOption?: number;
  correctOption?: number;
  onSelect?: (index: number) => void;
  showResult?: boolean;
}

export function QuizQuestionCard({ 
  question, 
  options, 
  selectedOption, 
  correctOption,
  onSelect,
  showResult = false
}: QuizQuestionCardProps) {
  return (
    <div className="study-panel rounded-xl p-6">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6 leading-8">{question}</h3>
      
      <div className="space-y-3">
        {options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect = correctOption === index;
          
          let bgClass = "bg-[var(--surface-1)] hover:bg-[var(--surface-2)]";
          let borderClass = "border-[var(--border)]";
          let textClass = "text-[var(--foreground-soft)]";
          
          if (showResult) {
            if (isCorrect) {
              bgClass = "bg-[var(--success-surface)]";
              borderClass = "border-[var(--success)]";
              textClass = "text-[var(--success)]";
            } else if (isSelected && !isCorrect) {
              bgClass = "bg-[var(--weak-surface)]";
              borderClass = "border-[var(--weak)]";
              textClass = "text-[var(--weak)]";
            }
          } else if (isSelected) {
            bgClass = "bg-[var(--accent-soft)]";
            borderClass = "border-[var(--accent-primary)]";
            textClass = "text-[var(--accent-primary)]";
          }

          return (
            <motion.button
              key={index}
              whileHover={{ scale: showResult ? 1 : 1.01 }}
              whileTap={{ scale: showResult ? 1 : 0.99 }}
              onClick={() => !showResult && onSelect?.(index)}
              disabled={showResult}
              className={`w-full text-left p-4 border-2 rounded-xl transition-all ${bgClass} ${borderClass} ${textClass} ${
                showResult ? "cursor-default" : "cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? borderClass : "border-[var(--border)]"
                }`}>
                  {isSelected && (
                    <div className={`w-3 h-3 rounded-full ${
                      showResult && isCorrect ? "bg-[var(--success)]" :
                      showResult && !isCorrect ? "bg-[var(--weak)]" :
                      "bg-[var(--accent-primary)]"
                    }`} />
                  )}
                </div>
                <span className="font-medium leading-7">{option}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

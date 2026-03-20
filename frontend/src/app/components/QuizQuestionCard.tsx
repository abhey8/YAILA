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
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">{question}</h3>
      
      <div className="space-y-3">
        {options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect = correctOption === index;
          
          let bgClass = "bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700";
          let borderClass = "border-gray-200 dark:border-gray-600";
          let textClass = "text-gray-700 dark:text-gray-300";
          
          if (showResult) {
            if (isCorrect) {
              bgClass = "bg-green-50 dark:bg-green-900/30";
              borderClass = "border-green-500 dark:border-green-500";
              textClass = "text-green-900 dark:text-green-300";
            } else if (isSelected && !isCorrect) {
              bgClass = "bg-red-50 dark:bg-red-900/30";
              borderClass = "border-red-500 dark:border-red-500";
              textClass = "text-red-900 dark:text-red-300";
            }
          } else if (isSelected) {
            bgClass = "bg-indigo-50 dark:bg-indigo-900/40";
            borderClass = "border-indigo-500 dark:border-indigo-400";
            textClass = "text-indigo-900 dark:text-indigo-200";
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
                  isSelected ? borderClass : "border-gray-300"
                }`}>
                  {isSelected && (
                    <div className={`w-3 h-3 rounded-full ${
                      showResult && isCorrect ? "bg-green-500" :
                      showResult && !isCorrect ? "bg-red-500" :
                      "bg-indigo-500"
                    }`} />
                  )}
                </div>
                <span className="font-medium">{option}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

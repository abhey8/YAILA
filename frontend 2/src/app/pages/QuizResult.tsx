import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Trophy, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { QuizQuestionCard } from "../components/QuizQuestionCard";
import { motion } from "motion/react";
import { useState } from "react";
import { quizApi } from "../../services/api";
import { toast } from "sonner";

export default function QuizResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { attempt, quiz } = location.state || {};
  const questions = quiz?.questions || [];
  const answers = attempt?.answers || [];
  const documentId = quiz?.document;
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);

  const correctCount = attempt?.score || 0;
  const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  const getScoreBgColor = () => {
    if (score >= 80) return "from-green-500 to-emerald-600";
    if (score >= 60) return "from-yellow-500 to-orange-600";
    return "from-red-500 to-pink-600";
  };

  const getMessage = () => {
    if (score >= 80) return "Excellent work! 🎉";
    if (score >= 60) return "Good job! Keep practicing! 💪";
    return "Don't give up! Review and try again! 📚";
  };

  if (!questions.length) {
    navigate(-1);
    return null;
  }

  const handleGenerateMore = async () => {
    if (!documentId) {
      return;
    }

    try {
      setIsGeneratingMore(true);
      const config = {
        count: quiz?.config?.count || questions.length || 5,
        difficulty: quiz?.config?.difficulty || "medium",
      };
      const nextQuiz = await quizApi.generate(documentId, config);
      navigate(`/quiz/${nextQuiz._id}`);
    } catch (error) {
      toast.error("Failed to generate another quiz");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate(documentId ? `/documents/${documentId}` : -1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Document
        </button>

        <h1 className="text-2xl font-bold text-gray-900">Quiz Results</h1>
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`bg-gradient-to-br ${getScoreBgColor()} rounded-2xl p-8 text-white text-center shadow-xl`}
      >
        <Trophy className="w-16 h-16 mx-auto mb-4" />
        <h2 className="text-5xl font-bold mb-2">{score}%</h2>
        <p className="text-xl mb-6">{getMessage()}</p>
        
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="text-2xl font-bold">{questions.length}</div>
            <div className="text-sm opacity-90">Total</div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="text-2xl font-bold">{correctCount}</div>
            <div className="text-sm opacity-90">Correct</div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="text-2xl font-bold">{questions.length - correctCount}</div>
            <div className="text-sm opacity-90">Wrong</div>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-4">
        <button
          onClick={() => navigate(`/quiz/${id}`)}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
          Retake Quiz
        </button>
        <button
          onClick={() => navigate(documentId ? `/documents/${documentId}` : -1)}
          className="flex-1 px-6 py-3 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-lg font-medium hover:bg-[var(--secondary)] transition-colors"
        >
          Back to Document
        </button>
      </div>

      <div className="bg-[var(--glass-background)] border border-[var(--glass-border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-3">
          Continue Practice?
        </h3>
        <p className="text-[var(--muted-foreground)] mb-4">
          Generate more questions with the same count and difficulty, or go back to roadmap.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleGenerateMore}
            disabled={isGeneratingMore}
            className="px-4 py-2 rounded-lg study-button-primary"
          >
            {isGeneratingMore ? "Generating..." : "Generate More (Same Settings)"}
          </button>
          <button
            onClick={() => navigate("/roadmap")}
            className="px-4 py-2 rounded-lg study-button-secondary"
          >
            Back to Learning Roadmap
          </button>
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">Detailed Review</h3>
        
        <div className="space-y-6">
          {questions.map((question: any, index: number) => {
            const answer = answers.find((item: any) => item.questionIndex === index);
            const selectedOptionIndex = question.options.findIndex(
              (option: string) => option === answer?.selectedOption
            );
            const correctOptionIndex = question.options.findIndex(
              (option: string) => option === question.correctAnswer
            );
            const isCorrect = Boolean(answer?.isCorrect);
            
            return (
              <div key={index} className="space-y-3">
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-600">Question {index + 1}</span>
                      <span className={`text-sm font-bold ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                        {isCorrect ? "Correct" : "Incorrect"}
                      </span>
                    </div>
                    
                    <QuizQuestionCard
                      question={question.question}
                      options={question.options}
                      selectedOption={selectedOptionIndex >= 0 ? selectedOptionIndex : undefined}
                      correctOption={correctOptionIndex >= 0 ? correctOptionIndex : undefined}
                      showResult={true}
                    />

                    {!isCorrect && (
                      <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-900 mb-1">Explanation:</p>
                        <p className="text-sm text-blue-800">
                          The correct answer is: <strong>{question.correctAnswer}</strong>
                        </p>
                        {question.explanation ? (
                          <p className="mt-2 text-sm text-blue-800">{question.explanation}</p>
                        ) : null}
                      </div>
                    )}
                    {isCorrect && question.explanation ? (
                      <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-900 mb-1">Why this is correct:</p>
                        <p className="text-sm text-green-800">{question.explanation}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

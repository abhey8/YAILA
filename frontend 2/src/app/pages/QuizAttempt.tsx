import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Clock, Flag, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { QuizQuestionCard } from "../components/QuizQuestionCard";
import { motion } from "motion/react";
import { quizApi } from "../../services/api";

interface Question {
  question: string;
  options: string[];
  correctAnswer?: string;
  explanation?: string;
}

export default function QuizAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(600);
  const [answers, setAnswers] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNavOpen, setIsNavOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    quizApi.getQuiz(id).then(data => {
      if (data && data.questions) {
        setQuestions(data.questions);
      }
      setLoading(false);
    }).catch(err => {
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSelectOption = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    if (!id) return;

    try {
      const payload = questions.map((question, index) => ({
        questionIndex: index,
        selectedOption: question.options[answers[index]],
      }));

      const result = await quizApi.submitAttempt(id, payload);
      navigate(`/quiz/${id}/result`, { state: result });
    } catch (error) {
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center p-20 space-y-4">
         <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
         <p className="text-gray-600 dark:text-gray-400">Loading your quiz questions...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center p-20 space-y-4">
         <p className="text-gray-600 dark:text-gray-400">No questions found for this quiz.</p>
         <button onClick={() => navigate(-1)} className="text-indigo-600 hover:text-indigo-700">Go Back</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Exit Quiz
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Document Quiz</h1>

        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
          <motion.div
            className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600 dark:text-gray-400">
            Question {currentQuestion + 1} of {questions.length}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span className={timeLeft < 60 ? "text-red-500 font-bold" : ""}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              {answers.filter(a => a !== undefined).length}/{questions.length} answered
            </div>
          </div>
        </div>
      </div>

      <QuizQuestionCard
        question={questions[currentQuestion].question}
        options={questions[currentQuestion].options}
        selectedOption={answers[currentQuestion]}
        onSelect={handleSelectOption}
      />

      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
          className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <Flag className="w-5 h-5" />
            Submit Quiz
          </button>

          {currentQuestion < questions.length - 1 && (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </div>

      <div className="bg-[var(--glass-background)] rounded-xl border border-[var(--glass-border)] overflow-hidden mt-8">
        <button 
          onClick={() => setIsNavOpen(!isNavOpen)}
          className="w-full flex items-center justify-between p-4 bg-[var(--secondary)]/30 hover:bg-[var(--secondary)]/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--foreground)] text-sm">Question Navigation</h3>
            <span className="text-xs text-[var(--muted-foreground)]">
              {answers.filter(a => a !== undefined).length} / {questions.length} answered
            </span>
          </div>
          {isNavOpen ? <ChevronUp className="w-5 h-5 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />}
        </button>
        
        {isNavOpen && (
          <div className="p-4 border-t border-[var(--glass-border)]">
            <div className="flex flex-wrap gap-2">
              {questions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentQuestion(index)}
                  className={`w-8 h-8 flex items-center justify-center rounded-md font-medium text-xs transition-colors ${
                    currentQuestion === index
                      ? "bg-[var(--accent-primary)] text-white shadow-sm"
                      : answers[index] !== undefined
                      ? "bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30"
                      : "bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--border)] hover:border-[var(--accent-primary)]/50 hover:text-[var(--foreground)]"
                  }`}
                  title={`Question ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

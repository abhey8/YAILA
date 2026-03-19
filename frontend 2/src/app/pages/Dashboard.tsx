import { FileText, BookOpen, Brain, TrendingUp, Clock } from "lucide-react";
import { ProgressStatCard } from "../components/ProgressStatCard";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const recentActivity = [
    { id: 1, type: "quiz", title: "Completed Quiz: Introduction to ML", time: "2 hours ago", score: 85 },
    { id: 2, type: "flashcard", title: "Reviewed 15 flashcards", time: "5 hours ago" },
    { id: 3, type: "document", title: "Uploaded: Neural Networks.pdf", time: "1 day ago" },
    { id: 4, type: "chat", title: "AI Chat: Deep Learning concepts", time: "2 days ago" },
  ];

  const quickActions = [
    { label: "Browse Documents", color: "indigo", onClick: () => navigate("/documents") },
    { label: "Review Flashcards", color: "purple", onClick: () => navigate("/flashcards/review") },
    { label: "Start Quiz", color: "green", onClick: () => navigate("/documents") },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {user?.name}!
        </h1>
        <p className="text-gray-600">Here's your learning progress overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ProgressStatCard
          icon={FileText}
          label="Total Documents"
          value={12}
          trend="8%"
          trendUp={true}
          color="indigo"
        />
        <ProgressStatCard
          icon={BookOpen}
          label="Flashcards Created"
          value={127}
          trend="15%"
          trendUp={true}
          color="purple"
        />
        <ProgressStatCard
          icon={Brain}
          label="Quizzes Taken"
          value={24}
          trend="12%"
          trendUp={true}
          color="green"
        />
        <ProgressStatCard
          icon={TrendingUp}
          label="Avg. Accuracy"
          value="87%"
          trend="5%"
          trendUp={true}
          color="orange"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={action.onClick}
              className={`p-4 rounded-lg border-2 border-dashed ${
                action.color === "indigo" ? "border-indigo-300 hover:bg-indigo-50" :
                action.color === "purple" ? "border-purple-300 hover:bg-purple-50" :
                "border-green-300 hover:bg-green-50"
              } transition-colors text-gray-900 font-medium`}
            >
              {action.label}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
          <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            View All
          </button>
        </div>

        <div className="space-y-4">
          {recentActivity.map((activity) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                activity.type === "quiz" ? "bg-green-100" :
                activity.type === "flashcard" ? "bg-purple-100" :
                activity.type === "document" ? "bg-indigo-100" :
                "bg-orange-100"
              }`}>
                {activity.type === "quiz" && <Brain className="w-5 h-5 text-green-600" />}
                {activity.type === "flashcard" && <BookOpen className="w-5 h-5 text-purple-600" />}
                {activity.type === "document" && <FileText className="w-5 h-5 text-indigo-600" />}
                {activity.type === "chat" && <TrendingUp className="w-5 h-5 text-orange-600" />}
              </div>

              <div className="flex-1">
                <p className="font-medium text-gray-900">{activity.title}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <Clock className="w-4 h-4" />
                  {activity.time}
                </div>
              </div>

              {activity.score && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">{activity.score}%</div>
                  <div className="text-xs text-gray-500">Score</div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

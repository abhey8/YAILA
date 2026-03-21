import { AlertTriangle, BookOpen, Brain, FileText, Flame, Target } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { GlassCard } from "../components/GlassCard";
import { useAuth } from "../context/AuthContext";
import { dashboardApi } from "../../services/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true);
        const data = await dashboardApi.getStats();
        setStats(data);
      } catch (error) {
        toast.error("Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

  const masteryCards = [
    {
      icon: Target,
      label: "Average Quiz Score",
      value: `${stats?.avgQuizScore ?? 0}%`,
      change: `${stats?.totalQuizzesAttempted ?? 0} quizzes`,
      color: "linear-gradient(155deg, var(--plum) 0%, color-mix(in srgb, var(--plum) 65%, var(--sage) 35%) 100%)",
    },
    {
      icon: FileText,
      label: "Documents",
      value: `${stats?.totalDocuments ?? 0}`,
      change: `${stats?.trackedDocuments ?? 0} tracked`,
      color: "linear-gradient(155deg, var(--sky) 0%, color-mix(in srgb, var(--sky) 68%, var(--sage) 32%) 100%)",
    },
    {
      icon: BookOpen,
      label: "Flashcards",
      value: `${stats?.totalFlashcards ?? 0}`,
      change: "Saved for review",
      color: "linear-gradient(155deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 70%, var(--rose) 30%) 100%)",
    },
    {
      icon: Flame,
      label: "Study Time",
      value: `${Math.round((stats?.totalStudyTimeSeconds ?? 0) / 60)} min`,
      change: "Across all sessions",
      color: "linear-gradient(155deg, var(--sage) 0%, color-mix(in srgb, var(--sage) 62%, var(--amber) 38%) 100%)",
    },
  ];

  const quickActions = [
    { label: "Browse Documents", description: "Open uploaded material", onClick: () => navigate("/documents") },
    { label: "Review Flashcards", description: "Practice saved cards", onClick: () => navigate("/flashcards/review") },
    { label: "Update Profile", description: "Manage account settings", onClick: () => navigate("/profile") },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-[var(--foreground)] mb-2"
        >
          Welcome back, {user?.name || "Scholar"}!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-[var(--muted-foreground)] text-lg"
        >
          Your redesigned learning workspace is now connected to the live backend.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {masteryCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <GlassCard hover className="p-6 relative overflow-hidden text-left w-full">
              <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.12] blur-3xl" style={{ background: stat.color }} />
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-[var(--shadow-soft)]" style={{ background: stat.color }}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className="text-sm text-[var(--muted-foreground)] font-medium">{stat.change}</div>
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)] mb-1">{isLoading ? "..." : stat.value}</div>
              <div className="text-sm text-[var(--muted-foreground)]">{stat.label}</div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-1">Recent Documents</h2>
                <p className="text-sm text-[var(--muted-foreground)]">Latest uploads from your library</p>
              </div>
              <button
                onClick={() => navigate("/documents")}
                className="px-4 py-2 study-button-primary rounded-xl"
              >
                View Documents
              </button>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                <div className="text-[var(--muted-foreground)]">Loading dashboard stats...</div>
              ) : (stats?.recentDocuments?.length ?? 0) > 0 ? (
                stats.recentDocuments.map((document: any) => (
                  <button
                    key={document._id}
                    onClick={() => navigate(`/documents/${document._id}`)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl study-panel-quiet hover:border-[var(--accent-primary)]/30 text-left transition-colors"
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(155deg, var(--accent-primary) 0%, color-mix(in srgb, var(--accent-secondary) 62%, var(--accent-primary) 38%) 100%)" }}>
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[var(--foreground)] truncate">{document.title}</div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        Status: {document.ingestionStatus} • Chunks: {document.chunkCount || 0} • Concepts: {document.conceptCount || 0}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
                  No documents yet. Upload a PDF to start learning.
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(155deg, var(--rose) 0%, color-mix(in srgb, var(--amber) 58%, var(--rose) 42%) 100%)" }}>
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)]">Progress Snapshot</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Live overview from backend stats</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-[var(--muted-foreground)]">
              <div className="flex items-center justify-between">
                <span>Tracked documents</span>
                <span className="text-[var(--foreground)]">{stats?.trackedDocuments ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Quiz attempts</span>
                <span className="text-[var(--foreground)]">{stats?.totalQuizzesAttempted ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total study time</span>
                <span className="text-[var(--foreground)]">{Math.round((stats?.totalStudyTimeSeconds ?? 0) / 60)} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Learning progress</span>
                <span className="text-[var(--foreground)]">{stats?.progressOverview?.learningProgressPercent ?? 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Study streak</span>
                <span className="text-[var(--foreground)]">{stats?.progressOverview?.studyStreakDays ?? 0} days</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(155deg, var(--sage) 0%, color-mix(in srgb, var(--sky) 34%, var(--sage) 66%) 100%)" }}>
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)]">Quick Actions</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Use the redesigned workflows</p>
              </div>
            </div>

            <div className="space-y-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="w-full p-4 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 hover:border-[var(--accent-primary)]/30 transition-colors text-left"
                >
                  <div className="font-medium text-[var(--foreground)]">{action.label}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">{action.description}</div>
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-[var(--foreground)]">Recent Activity</h3>
              <p className="text-sm text-[var(--muted-foreground)]">Live timeline from your study actions</p>
            </div>
            <div className="space-y-3">
              {(stats?.recentActivity || []).length ? stats.recentActivity.map((item: any) => (
                <div key={item.id} className="study-panel-quiet rounded-2xl p-4">
                  <div className="font-medium text-[var(--foreground)]">{item.title}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">{item.description}</div>
                  {item.document ? (
                    <div className="text-xs text-[var(--accent-primary)] mt-1">{item.document.title}</div>
                  ) : null}
                </div>
              )) : (
                <div className="text-sm text-[var(--muted-foreground)]">No recent activity yet.</div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}

import { Suspense, lazy } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./layouts/Layout";
import { AuthLayout } from "./layouts/AuthLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import QuizAttempt from "./pages/QuizAttempt";
import QuizResult from "./pages/QuizResult";
import FlashcardReview from "./pages/FlashcardReview";
import Profile from "./pages/Profile";

const KnowledgeGraph = lazy(() => import("./pages/KnowledgeGraph"));
const LearningRoadmap = lazy(() => import("./pages/LearningRoadmap"));
const WeakConcepts = lazy(() => import("./pages/WeakConcepts"));
const ActiveRecall = lazy(() => import("./pages/ActiveRecall"));
const Analytics = lazy(() => import("./pages/Analytics"));

const withSuspense = (Component) => () => (
  <Suspense fallback={<div className="flex items-center justify-center py-24 text-[var(--muted-foreground)]">Loading...</div>}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthLayout,
    children: [
      { path: "/login", Component: Login },
      { path: "/register", Component: Register },
    ],
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "documents", Component: Documents },
      { path: "documents/:id", Component: DocumentDetail },
      { path: "knowledge-graph", Component: withSuspense(KnowledgeGraph) },
      { path: "roadmap", Component: withSuspense(LearningRoadmap) },
      { path: "weak-concepts", Component: withSuspense(WeakConcepts) },
      { path: "active-recall", Component: withSuspense(ActiveRecall) },
      { path: "analytics", Component: withSuspense(Analytics) },
      { path: "quiz/:id", Component: QuizAttempt },
      { path: "quiz/:id/result", Component: QuizResult },
      { path: "flashcards/review", Component: FlashcardReview },
      { path: "profile", Component: Profile },
    ],
  },
]);

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

export const router = createBrowserRouter([
  {
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
      { path: "quiz/:id", Component: QuizAttempt },
      { path: "quiz/:id/result", Component: QuizResult },
      { path: "flashcards/review", Component: FlashcardReview },
      { path: "profile", Component: Profile },
    ],
  },
]);

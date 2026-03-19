import { Outlet, Navigate } from "react-router";
import { BookOpen } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function AuthLayout() {
  const { token, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center dark:bg-gray-900 bg-gray-50 text-indigo-600">Loading...</div>;
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg bg-white overflow-hidden p-1">
            <img src="/logo.png" alt="YAILA Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">YAILA</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Transform PDFs into interactive learning</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
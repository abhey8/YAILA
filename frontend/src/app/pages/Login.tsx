import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../../services/api";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to login");

      login(data, data.token);
      toast.success("Login successful!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    }
  };

  const handleGuestLogin = async () => {
    try {
      setIsGuestLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to continue as guest");

      login(data, data.token);
      toast.success("Guest session ready");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Guest login failed");
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="study-panel rounded-2xl p-8"
    >
      <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Welcome back</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full pl-11 pr-4 py-3 rounded-lg study-input"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full pl-11 pr-11 py-3 rounded-lg study-input"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground-soft)]"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input type="checkbox" className="w-4 h-4 accent-[var(--accent-primary)] rounded" />
            <span className="ml-2 text-sm text-[var(--muted-foreground)]">Remember me</span>
          </label>
          <a href="#" className="text-sm text-[var(--accent-primary)] hover:opacity-80">
            Forgot password?
          </a>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-lg study-button-primary"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={isGuestLoading}
          className="w-full py-3 rounded-lg study-button-secondary"
        >
          {isGuestLoading ? "Opening guest workspace..." : "Login as Guest"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
        Don't have an account?{" "}
        <Link to="/register" className="text-[var(--accent-primary)] hover:opacity-80 font-medium">
          Sign up
        </Link>
      </p>
    </motion.div>
  );
}

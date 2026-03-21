import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../../services/api";

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    age: "",
    studySpecifications: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all required fields (Name, Email, Password)");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          age: formData.age ? parseInt(formData.age, 10) : undefined,
          studySpecifications: formData.studySpecifications
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to register");

      login(data, data.token);
      toast.success("Account created successfully!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="study-panel rounded-2xl p-8"
    >
      <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Create your account</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full pl-11 pr-4 py-3 rounded-lg study-input"
              placeholder="John Doe"
            />
          </div>
        </div>

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

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
            <input
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full pl-11 pr-4 py-3 rounded-lg study-input"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Age (optional)
          </label>
          <div className="relative">
            <input
              type="number"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              className="w-full px-4 py-3 rounded-lg study-input"
              placeholder="e.g. 21"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
            Study Specifications (optional)
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.studySpecifications}
              onChange={(e) => setFormData({ ...formData, studySpecifications: e.target.value })}
              className="w-full px-4 py-3 rounded-lg study-input"
              placeholder="e.g. MS Computer Science"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-lg study-button-primary"
        >
          Create Account
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
        Already have an account?{" "}
        <Link to="/login" className="text-[var(--accent-primary)] hover:opacity-80 font-medium">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}

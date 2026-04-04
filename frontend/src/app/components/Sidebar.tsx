import { NavLink, useNavigate } from "react-router";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Network,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../context/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/documents", icon: FileText, label: "Documents" },
    { to: "/knowledge-graph", icon: Network, label: "Knowledge Graph" },
    { to: "/roadmap", icon: Map, label: "Learning Roadmap" },
    { to: "/weak-concepts", icon: AlertTriangle, label: "Weak Concepts" },
    { to: "/active-recall", icon: Brain, label: "Active Recall" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/profile", icon: User, label: "Profile" },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? 256 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] overflow-hidden backdrop-blur-md"
      >
        <div className="w-64 h-full flex flex-col">
          <div className="p-6 flex items-center justify-between border-b border-[var(--sidebar-border)]">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="YAILA" className="w-10 h-10 object-contain rounded-xl bg-[var(--surface-1)] border border-[var(--border)] p-0.5" />
              <div className="flex flex-col">
                <span className="font-bold text-[var(--sidebar-foreground)] text-xl tracking-wide">YAILA</span>
                <span className="text-[10px] text-[var(--muted-foreground)] font-medium">AI Learning Assistant</span>
              </div>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-[var(--sidebar-accent)] transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--muted-foreground)]" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group relative overflow-hidden ${
                    isActive
                      ? "text-[var(--accent-primary)] font-medium border border-[var(--accent-primary)]/20"
                      : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]"
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                        background:
                          "linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 12%, transparent) 0%, color-mix(in srgb, var(--accent-secondary) 10%, transparent) 100%)",
                        boxShadow: "0 12px 24px color-mix(in srgb, var(--accent-primary) 8%, transparent)",
                      }
                    : undefined
                }
              >
                <item.icon className="w-5 h-5 relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-[var(--sidebar-border)]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[var(--sidebar-foreground)]/70 hover:bg-[var(--weak-surface)] hover:text-[var(--weak)] transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </motion.aside>

      {isOpen ? (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm lg:hidden z-40"
          onClick={onToggle}
        />
      ) : null}
    </>
  );
}

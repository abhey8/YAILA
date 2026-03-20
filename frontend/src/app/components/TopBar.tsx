import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

interface TopBarProps {
  onSearch: (query: string) => void;
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export function TopBar({ onSearch, onMenuClick, isSidebarOpen }: TopBarProps) {
  const [searchValue, setSearchValue] = useState("");
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    onSearch(value);
  };

  return (
    <header className="bg-[var(--glass-background)] backdrop-blur-xl border-b border-[var(--glass-border)] px-6 py-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className={`p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors ${isSidebarOpen ? "lg:hidden" : ""}`}
        >
          <Menu className="w-5 h-5 text-[var(--muted-foreground)]" />
        </button>

        <div className="flex-1 max-w-2xl relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search documents, concepts, topics..."
            value={searchValue}
            onChange={handleSearch}
            className="w-full pl-12 pr-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] transition-all text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="p-2.5 rounded-xl hover:bg-[var(--secondary)] transition-colors">
            {theme === "light" ? (
              <Moon className="w-5 h-5 text-[var(--muted-foreground)]" />
            ) : (
              <Sun className="w-5 h-5 text-[var(--muted-foreground)]" />
            )}
          </button>

          <button className="relative p-2.5 rounded-xl hover:bg-[var(--secondary)] transition-colors">
            <Bell className="w-5 h-5 text-[var(--muted-foreground)]" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--glass-background)]" />
          </button>

          <Link to="/profile">
            <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-tertiary)] rounded-2xl flex items-center justify-center text-white font-bold shadow-lg shadow-[var(--accent-primary)]/20 hover:scale-105 transition-transform overflow-hidden">
              {user?.profilePic ? (
                <img src={user.profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name.charAt(0).toUpperCase() : "U"
              )}
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}

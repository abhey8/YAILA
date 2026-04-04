import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { notificationApi } from "../../services/api";

interface TopBarProps {
  onSearch: (query: string) => void;
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export function TopBar({ onSearch, onMenuClick, isSidebarOpen }: TopBarProps) {
  const [searchValue, setSearchValue] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  const loadNotifications = async () => {
    try {
      const [listResponse, unreadResponse] = await Promise.all([
        notificationApi.getAll(8),
        notificationApi.getUnreadCount(),
      ]);
      setNotifications(listResponse.items || []);
      setUnreadCount(unreadResponse.unreadCount || 0);
    } catch (error) {
    }
  };

  useEffect(() => {
    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    onSearch(value);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    await notificationApi.markRead(notificationId);
    await loadNotifications();
    setNotificationsOpen(false);
  };

  return (
    <header className="bg-[var(--glass-background)] backdrop-blur-md border-b border-[var(--glass-border)] px-6 py-4 relative z-50">
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
            className="w-full pl-12 pr-4 py-3 study-input rounded-2xl"
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

          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative p-2.5 rounded-xl hover:bg-[var(--secondary)] transition-colors"
            >
              <Bell className="w-5 h-5 text-[var(--muted-foreground)]" />
              {unreadCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-[var(--weak)] text-white text-[10px] flex items-center justify-center ring-2 ring-[var(--glass-background)]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 mt-3 w-[24rem] max-w-[24rem] study-panel rounded-2xl p-3 z-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h3>
                  <div className="flex gap-4">
                    <button
                      onClick={async () => {
                        await notificationApi.markAllRead();
                        await loadNotifications();
                      }}
                      className="text-xs text-[var(--accent-primary)] hover:opacity-80"
                    >
                      Mark all read
                    </button>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {notifications.length ? notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleMarkAsRead(item.id)}
                      className={`w-full text-left rounded-xl p-3 transition-colors ${
                        item.read ? "study-panel-quiet" : "bg-[var(--accent-soft)] border border-[var(--border)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-[var(--foreground)]">{item.title}</div>
                          <div className="text-xs text-[var(--muted-foreground)] mt-1 leading-6">{item.message}</div>
                          {item.document ? (
                            <div className="text-[11px] text-[var(--accent-primary)] mt-1">{item.document.title}</div>
                          ) : null}
                        </div>
                        {!item.read ? <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] mt-1.5" /> : null}
                      </div>
                    </button>
                  )) : (
                    <div className="text-sm text-[var(--muted-foreground)] p-3">No notifications yet.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <Link to="/profile">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold shadow-[var(--shadow-soft)] hover:scale-105 transition-transform overflow-hidden border border-[var(--border)]"
              style={{ background: "linear-gradient(155deg, var(--accent-primary) 0%, color-mix(in srgb, var(--accent-secondary) 68%, var(--accent-primary) 32%) 100%)" }}
            >
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

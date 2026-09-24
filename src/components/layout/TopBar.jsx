import React, { useState } from "react";
import { Search, Bell, Sun, Moon, ChevronDown, LogOut, MessageSquare } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useTheme } from "../../hooks/useTheme.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { listMyNotifications, markRead, markAllRead, notificationLink } from "../../api/notifications.js";

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

export default function TopBar() {
  const { theme, toggle, isDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useClickOutside(() => setNotifOpen(false));
  const menuRef = useClickOutside(() => setMenuOpen(false));
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();

  const userId = session?.user?.id;
  const { data: notifications, refetch } = useQuery(() => listMyNotifications(userId), [userId]);
  const unreadCount = (notifications || []).filter((n) => !n.is_read).length;

  const displayName = profile?.name || session?.user?.email || "User";
  const displayRole = profile?.role || "-";

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  async function openNotification(n) {
    if (!n.is_read) {
      await markRead(n.id);
      refetch();
    }
    setNotifOpen(false);
    navigate(notificationLink(n));
  }

  return (
    <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-6 py-3 flex items-center justify-between gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          placeholder="Search projects, tickets, customers…"
          className="w-full pl-10 pr-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white dark:focus:bg-stone-800 transition-colors"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={`w-9 h-9 rounded-full flex items-center justify-center ${isDark ? "text-stone-300 bg-stone-800/10" : "text-amber-500 bg-amber-50"}`}
        >
          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <Link
          to="/chat"
          title="Team chat"
          className="w-9 h-9 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
        >
          <MessageSquare className="w-4 h-4" />
        </Link>
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-semibold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-lg z-20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-700">
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={async () => { await markAllRead(userId); refetch(); }}
                    className="text-xs text-stone-900 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-auto">
                {(!notifications || notifications.length === 0) && (
                  <p className="text-sm text-stone-400 text-center py-6">No notifications yet</p>
                )}
                {notifications?.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 border-b border-stone-50 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors ${
                      !n.is_read ? "bg-stone-100/40 dark:bg-stone-800/5" : ""
                    }`}
                  >
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {n.reason === "mention" ? "🔔 You were mentioned by " : "💬 New comment from "}
                      <span className="font-medium text-stone-700 dark:text-stone-200">{n.comment?.author?.name || "User"}</span>
                    </p>
                    <p className="text-sm text-stone-700 dark:text-stone-200 mt-0.5 line-clamp-2">{n.comment?.body}</p>
                    <p className="text-xs text-stone-400 mt-1">{timeAgo(n.created_at)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2.5 pl-3 border-l border-stone-200 dark:border-stone-700">
          <div className="w-9 h-9 rounded-full bg-stone-800 flex items-center justify-center text-white text-xs font-semibold">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-tight">{displayName}</p>
            <p className="text-xs text-stone-400 leading-tight">{displayRole}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-lg py-1.5 z-20">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

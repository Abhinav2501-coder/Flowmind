import { useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Bot,
  BarChart3,
  Settings as SettingsIcon,
  Bell,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sun,
  Moon,
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

import { NotificationCenter } from "./NotificationCenter";

export function Layout() {
  const { userProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    {
      to: "/dashboard",
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
      label: "Dashboard",
    },
    {
      to: "/tasks",
      icon: <CheckSquare className="w-5 h-5 shrink-0" />,
      label: "Tasks",
    },
    {
      to: "/calendar",
      icon: <CalendarDays className="w-5 h-5 shrink-0" />,
      label: "Calendar",
    },
    {
      to: "/ai-chat",
      icon: <Bot className="w-5 h-5 shrink-0" />,
      label: "AI Assistant",
    },
    {
      to: "/analytics",
      icon: <BarChart3 className="w-5 h-5 shrink-0" />,
      label: "Analytics",
    },
    {
      to: "/settings",
      icon: <SettingsIcon className="w-5 h-5 shrink-0" />,
      label: "Settings",
    },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex min-h-screen bg-background text-text font-sans">
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarCollapsed ? 80 : 260 }}
        className="hidden md:flex flex-col border-r border-surface bg-background sticky top-0 h-screen z-20 transition-all duration-300"
      >
        <div
          className={`p-4 flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"} mb-4 h-16`}
        >
          {!isSidebarCollapsed && (
            <Link to="/">
              <h1 className="text-2xl font-bold font-display text-primary tracking-tight">
                FlowMind
              </h1>
            </Link>
          )}
          {isSidebarCollapsed && (
            <Link to="/">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center font-display">
                F
              </div>
            </Link>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-start gap-3"} px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-white shadow-[0_0_15px_rgba(124,110,240,0.4)]"
                    : "text-muted hover:text-text hover:bg-surface"
                }`
              }
              title={isSidebarCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isSidebarCollapsed && (
                <span className="font-medium">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-surface">
          <div
            className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"} mb-4`}
          >
            <div className="w-10 h-10 rounded-full bg-surface border border-primary/30 flex items-center justify-center shrink-0 overflow-hidden">
              {userProfile?.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-primary">
                  {userProfile?.displayName?.charAt(0).toUpperCase() || "U"}
                </span>
              )}
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-text truncate">
                  {userProfile?.displayName || "User"}
                </p>
                <p className="text-xs text-muted truncate">
                  {userProfile?.role || "Member"}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center py-2 text-muted hover:text-text hover:bg-surface rounded-lg transition-colors"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen relative">
        {/* Top bar */}
        <header className="h-16 border-b border-surface bg-background/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile menu toggle */}
            <button
              className="md:hidden text-text"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-xl font-bold text-text">
                {greeting()},{" "}
                {userProfile?.displayName?.split(" ")[0] || "there"} 👋
              </h2>
              <p className="text-sm text-muted">
                {format(new Date(), "EEEE, MMMM do")}
              </p>
            </div>
            <div className="sm:hidden font-bold text-lg text-primary font-display">
              FlowMind
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="relative p-2 text-muted hover:text-text transition-colors rounded-full hover:bg-surface focus:outline-none"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <NotificationCenter />
            <button
              onClick={logout}
              className="text-sm font-medium text-muted hover:text-danger transition-colors hidden sm:block"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Mobile slide-out menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 w-64 bg-card border-r border-surface z-40 p-4 flex flex-col md:hidden shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-2xl font-bold font-display text-primary tracking-tight">
                    FlowMind
                  </h1>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-muted hover:text-text"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-8 p-3 bg-surface rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-background border border-primary/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {userProfile?.avatarUrl ? (
                      <img
                        src={userProfile.avatarUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold text-primary">
                        {userProfile?.displayName?.charAt(0).toUpperCase() ||
                          "U"}
                      </span>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-text truncate">
                      {userProfile?.displayName || "User"}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {userProfile?.role || "Member"}
                    </p>
                  </div>
                </div>
                <nav className="flex-1 space-y-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                          isActive
                            ? "bg-primary text-white shadow-[0_0_15px_rgba(124,110,240,0.4)]"
                            : "text-muted hover:text-text hover:bg-surface"
                        }`
                      }
                    >
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </NavLink>
                  ))}
                </nav>
                <button
                  onClick={logout}
                  className="mt-auto py-3 text-danger font-medium hover:bg-danger/10 rounded-xl transition-colors"
                >
                  Logout
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-surface flex items-center justify-around z-20 pb-safe">
        {[
          navItems[0],
          navItems[1],
          {
            to: "/quick-add",
            icon: (
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_0_15px_rgba(124,110,240,0.5)] -mt-6">
                <Plus className="w-6 h-6" />
              </div>
            ),
            label: "Add",
          },
          navItems[2],
          navItems[3],
        ].map((item, i) =>
          item.to === "/quick-add" ? (
            <button
              key={i}
              onClick={() =>
                window.dispatchEvent(new CustomEvent("open-quick-add"))
              }
              className="flex flex-col items-center justify-center focus:outline-none"
            >
              {item.icon}
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-12 h-12 transition-colors ${
                  isActive ? "text-primary" : "text-muted hover:text-text"
                }`
              }
            >
              {item.icon}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}

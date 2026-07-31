import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ClipboardList,
  PlusCircle,
  FileText,
  Settings,
  Shield,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  LayoutDashboard,
  BookOpen,
} from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/useTheme";

export function AppLayout({ children }) {
  const location = useLocation();
  const { isDark, toggle } = useTheme();

  // Set default open state based on current path
  const [roundsOpen, setRoundsOpen] = useState(() =>
    location.pathname.startsWith("/officer-rounds"),
  );
  const [visitsOpen, setVisitsOpen] = useState(() =>
    location.pathname.startsWith("/officer-visits"),
  );

  const roundsGroup = {
    title: "Officer Night Rounds",
    icon: ClipboardList,
    isOpen: roundsOpen,
    setIsOpen: setRoundsOpen,
    items: [
      { name: "View Reports", href: "/officer-rounds", icon: FileText },
      {
        name: "Create Report",
        href: "/officer-rounds/create",
        icon: PlusCircle,
      },
      {
        name: "Template Builder",
        href: "/officer-rounds/template-builder",
        icon: Settings,
      },
    ],
  };

  const visitsGroup = {
    title: "Officer Visits",
    icon: ClipboardList,
    isOpen: visitsOpen,
    setIsOpen: setVisitsOpen,
    items: [
      { name: "View Reports", href: "/officer-visits", icon: FileText },
      {
        name: "Create Report",
        href: "/officer-visits/create",
        icon: PlusCircle,
      },
      {
        name: "Template Builder",
        href: "/officer-visits/template-builder",
        icon: Settings,
      },
    ],
  };

  const renderGroup = (group) => {
    const Icon = group.icon;
    const isAnyChildActive = group.items.some(
      (item) => location.pathname === item.href,
    );

    return (
      <div className="space-y-1">
        {/* Header Toggle */}
        <button
          onClick={() => group.setIsOpen(!group.isOpen)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isAnyChildActive
              ? "bg-slate-100 dark:bg-slate-800 text-sky-500 dark:text-sky-400"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{group.title}</span>
          </div>
          {group.isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        {/* Dropdown Items */}
        {group.isOpen && (
          <div className="pl-6 space-y-1 mt-1 border-l border-slate-200 dark:border-slate-800 ml-6">
            {group.items.map((item) => {
              const isActive = location.pathname === item.href;
              const ChildIcon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-200 dark:border-slate-800">
            <Shield className="h-6 w-6 text-sky-500" />
            <span className="font-bold text-lg tracking-tight">
              F.O. Portal
            </span>
          </div>
          <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
            <Link
              to="/"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                location.pathname === "/" || location.pathname === "/dashboard"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <LayoutDashboard className="h-4.5 w-4.5" />
              Dashboard
            </Link>
            <Link
              to="/general-visits"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                location.pathname.startsWith("/general-visits")
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <BookOpen className="h-4.5 w-4.5" />
              General Visit
            </Link>
            {renderGroup(roundsGroup)}
            {renderGroup(visitsGroup)}
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-6 md:px-8">
            <h1 className="text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-200">
              Field Officer Management
            </h1>
            <div className="flex items-center gap-4">
              {/* Theme Toggle Button */}
              <button
                onClick={toggle}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all shadow-sm"
                title="Toggle Theme"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-amber-500 animate-spin-slow" />
                ) : (
                  <Moon className="h-4 w-4 text-indigo-500" />
                )}
              </button>
            </div>
          </header>

          {/* Main page view */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  MapPin,
  User,
  LogOut,
  CalendarDays,
  PanelLeft,
} from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/useTheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();

  // Collapsible Sidebar State
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  // Get logged-in user
  const currentUser = (() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {
        return null;
      }
    }
    return null;
  })();

  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user");
    navigate("/login");
  };

  const getInitials = () => {
    if (!currentUser?.name) return "FO";
    const names = currentUser.name.split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return currentUser.name.substring(0, 2).toUpperCase();
  };

  // Set default open state based on current path
  const [roundsOpen, setRoundsOpen] = useState(() =>
    location.pathname.startsWith("/officer-rounds"),
  );
  const [visitsOpen, setVisitsOpen] = useState(() =>
    location.pathname.startsWith("/officer-visits"),
  );
  const [attendanceOpen, setAttendanceOpen] = useState(() =>
    location.pathname.startsWith("/attendance"),
  );

  const isAdmin = currentUser?.role?.toLowerCase() === "admin" || currentUser?.role?.toLowerCase() === "it admin";

  const roundsGroup = {
    title: "Night Visits",
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
      isAdmin && {
        name: "Template Builder",
        href: "/officer-rounds/template-builder",
        icon: Settings,
      },
    ].filter(Boolean),
  };

  const visitsGroup = {
    title: "Day Visits",
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
      isAdmin && {
        name: "Template Builder",
        href: "/officer-visits/template-builder",
        icon: Settings,
      },
    ].filter(Boolean),
  };

  const attendanceGroup = {
    title: "Attendance",
    icon: CalendarDays,
    isOpen: attendanceOpen,
    setIsOpen: setAttendanceOpen,
    items: [
      { name: "Guard Attendance", href: "/attendance/guard-attendance", icon: User },
      { name: "Regularize History", href: "/attendance/regularize-history", icon: FileText },
    ],
  };

  const renderGroup = (group) => {
    const Icon = group.icon;
    const isAnyChildActive = group.items.some(
      (item) => location.pathname === item.href,
    );

    if (isCollapsed) {
      return (
        <div className="space-y-1">
          <button
            onClick={() => {
              setIsCollapsed(false);
              group.setIsOpen(true);
            }}
            title={group.title}
            className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all ${isAnyChildActive
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
          </button>

          {group.isOpen && (
            <div className="space-y-1 py-1 flex flex-col items-center">
              {group.items.map((item) => {
                const isActive = location.pathname === item.href;
                const ChildIcon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    title={`${group.title}: ${item.name}`}
                    className={`flex items-center justify-center p-2 rounded-lg transition-all ${isActive
                        ? "bg-sky-500 text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                  >
                    <ChildIcon className="h-4 w-4 shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {/* Header Toggle */}
        <button
          onClick={() => group.setIsOpen(!group.isOpen)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-base font-semibold transition-all ${isAnyChildActive
              ? "bg-slate-100 dark:bg-slate-800 text-sky-500 dark:text-sky-400"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
        >
          <div className="flex items-center gap-3">
            <Icon className="h-4.5 w-4.5 shrink-0" />
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
                  className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
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
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 print:bg-white print:text-black print:block">
        {/* Sidebar */}
        <aside
          className={`${isCollapsed ? "w-20" : "w-64"
            } border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 transition-all duration-300 ease-in-out print:hidden`}
        >
          <div
            className={`h-16 flex items-center ${isCollapsed ? "justify-center px-2" : "px-6"
              } border-b border-slate-200 dark:border-slate-800`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Shield className="h-6 w-6 text-sky-500 shrink-0" />
              {!isCollapsed && (
                <span className="font-bold text-lg tracking-tight truncate">
                  F.O. Portal
                </span>
              )}
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
            <Link
              to="/"
              title="Dashboard"
              className={`flex items-center ${isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
                } rounded-xl text-base font-semibold transition-all ${location.pathname === "/" || location.pathname === "/dashboard"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>Dashboard</span>}
            </Link>
            <Link
              to="/my-sites"
              title="My Sites"
              className={`flex items-center ${isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
                } rounded-xl text-base font-semibold transition-all ${location.pathname.startsWith("/my-sites")
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              <MapPin className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>My Sites</span>}
            </Link>

            {renderGroup(attendanceGroup)}
            {renderGroup(roundsGroup)}
            {renderGroup(visitsGroup)}

            <Link
              to="/general-visits"
              title="General Visits"
              className={`flex items-center ${isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
                } rounded-xl text-base font-semibold transition-all ${location.pathname.startsWith("/general-visits")
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              <BookOpen className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>General Visits</span>}
            </Link>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 print:block print:p-0">
          {/* Header */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card dark:bg-slate-900 flex items-center justify-between px-4 md:px-6 print:hidden">
            <div className="flex items-center gap-3">
              {/* Collapse/Expand Toggle Button in Header */}
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shadow-xs"
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                <PanelLeft className="h-5 w-5" />
              </button>

              <h1 className="text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                Field Officer Management
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {/* Theme Toggle Button */}
              <button
                onClick={toggle}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-all shadow-sm"
                title="Toggle Theme"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-amber-500 animate-spin-slow" />
                ) : (
                  <Moon className="h-4 w-4 text-indigo-500" />
                )}
              </button>

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all rounded-lg flex items-center group">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold text-white ring-2 ring-slate-200 dark:ring-slate-800 group-hover:ring-sky-500 transition-all">
                      {getInitials()}
                    </div>
                    <span className="hidden sm:inline-block text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[80px] truncate">
                      {currentUser?.name ? currentUser.name.split(" ")[0] : "User"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-card border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-1.5 z-50">
                  <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 rounded-lg mb-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {currentUser?.name || "Unknown User"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                      {currentUser?.role || "Staff"}
                    </p>
                  </div>

                  <DropdownMenuSeparator className="my-1 border-slate-200 dark:border-slate-800" />

                  <DropdownMenuItem className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:text-sky-500 dark:focus:text-sky-400 focus:bg-sky-500/10 dark:focus:bg-sky-500/10 cursor-pointer transition-all">
                    <User className="h-4 w-4" /> Profile
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="my-1 border-slate-200 dark:border-slate-800" />

                  <DropdownMenuItem
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 focus:bg-red-500/10 focus:text-red-650 cursor-pointer transition-all font-medium"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main page view */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8 print:p-0 print:m-0 print:overflow-visible">
            <div className="mx-auto max-w-7xl print:max-w-full print:m-0 print:p-0">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
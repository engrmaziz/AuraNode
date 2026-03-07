"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart2,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Upload,
  Users,
  X,
} from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  clinic: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/upload", label: "Upload Case", icon: Upload },
    { href: "/dashboard/cases", label: "My Cases", icon: FolderOpen },
    { href: "/dashboard/reports", label: "Reports", icon: FileText },
  ],
  specialist: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/queue", label: "Review Queue", icon: ClipboardList },
    { href: "/dashboard/completed", label: "Completed Reviews", icon: CheckSquare },
  ],
  admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/cases", label: "All Cases", icon: FolderOpen },
    { href: "/dashboard/users", label: "Users", icon: Users },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart2 },
  ],
};

function Sidebar({
  navItems,
  onClose,
}: {
  navItems: NavItem[];
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-border flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
          <span className="text-2xl">🩺</span>
          <span className="text-lg font-extrabold aura-gradient-text">AuraNode</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-accent"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom branding */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">© 2024 AuraNode</p>
      </div>
    </aside>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const navItems = NAV_BY_ROLE[user.role as UserRole] ?? NAV_BY_ROLE.clinic;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 flex-shrink-0">
        <Sidebar navItems={navItems} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-50 w-64 h-full">
            <Sidebar navItems={navItems} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-white dark:bg-gray-900 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Desktop spacer */}
          <div className="hidden lg:block" />

          {/* User menu */}
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

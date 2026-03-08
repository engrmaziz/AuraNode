"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart2,
  CheckSquare,
  ClipboardList,
  Menu,
  X,
} from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { useReviewQueue } from "@/hooks/useReviewQueue";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

function Sidebar({
  navItems,
  onClose,
  specialistName,
}: {
  navItems: NavItem[];
  onClose?: () => void;
  specialistName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-border flex-shrink-0">
        <Link href="/review" className="flex items-center gap-2" onClick={onClose}>
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

      {/* Specialist name */}
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">Signed in as</p>
        <p className="text-sm font-medium truncate">{specialistName}</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const isActive =
            href === "/review" ? pathname === href : pathname.startsWith(href);

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
              <span className="flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Dashboard link */}
      <div className="px-3 pb-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={onClose}
        >
          <Activity className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          Dashboard
        </Link>
      </div>

      {/* Bottom branding */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">© 2024 AuraNode</p>
      </div>
    </aside>
  );
}

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { queue } = useReviewQueue();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
    if (!loading && user && user.role !== "specialist" && user.role !== "admin") {
      router.replace("/dashboard");
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

  const specialistName = user.full_name ?? user.email.split("@")[0];

  const navItems: NavItem[] = [
    { href: "/review", label: "My Queue", icon: ClipboardList, badge: queue.length },
    { href: "/review/stats", label: "My Stats", icon: BarChart2 },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 flex-shrink-0">
        <Sidebar navItems={navItems} specialistName={specialistName} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 w-64 h-full">
            <Sidebar
              navItems={navItems}
              specialistName={specialistName}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-white dark:bg-gray-900 flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Specialist Review</span>
          </div>
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

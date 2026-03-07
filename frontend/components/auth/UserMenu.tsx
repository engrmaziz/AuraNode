"use client";

import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

const ROLE_COLORS: Record<UserRole, string> = {
  clinic: "bg-blue-100 text-blue-700",
  specialist: "bg-purple-100 text-purple-700",
  admin: "bg-amber-100 text-amber-700",
};

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }
  return email[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (!user) return null;

  const initials = getInitials(user.full_name, user.email);
  const roleBadgeClass = ROLE_COLORS[user.role as UserRole] ?? "bg-gray-100 text-gray-700";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="User menu"
        >
          {/* Avatar */}
          <div className="h-8 w-8 rounded-full aura-gradient flex items-center justify-center text-white text-sm font-semibold select-none flex-shrink-0">
            {initials}
          </div>

          {/* Name + role */}
          <div className="hidden sm:flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
              {user.full_name ?? user.email}
            </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadgeClass}`}
            >
              {user.role}
            </span>
          </div>

          {/* Chevron */}
          <svg
            className="h-4 w-4 text-muted-foreground hidden sm:block"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md p-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          sideOffset={8}
          align="end"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b mb-1">
            <p className="text-sm font-medium">{user.full_name ?? "Anonymous"}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>

          <DropdownMenu.Item
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:outline-none"
            onSelect={() => router.push("/dashboard/profile")}
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Profile
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:outline-none"
            onSelect={() => router.push("/dashboard/settings")}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer text-destructive hover:bg-destructive/10 focus:outline-none"
            onSelect={handleSignOut}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

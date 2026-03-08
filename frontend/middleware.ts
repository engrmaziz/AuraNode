import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase";

// Routes that require authentication
const PROTECTED_PREFIXES = ["/dashboard", "/cases", "/review", "/reports", "/admin"];

// Auth routes — redirect away if already logged in
const AUTH_ROUTES = ["/login", "/register"];

// Role-based access control map
const ROLE_ACCESS: Record<string, string[]> = {
  "/admin": ["admin"],
  "/review": ["specialist", "admin"],
  "/cases": ["clinic", "admin"],
  "/dashboard": ["clinic", "specialist", "admin"],
  "/reports": ["clinic", "specialist", "admin"],
};

/**
 * Determine if a user's role grants access to the given pathname.
 * Finds the most specific matching prefix in ROLE_ACCESS and checks
 * whether the role is in the allowed list.
 *
 * @returns true if access is allowed, false if denied
 */
function isRoleAllowed(pathname: string, userRole: string): boolean {
  const matchedPrefix = Object.keys(ROLE_ACCESS)
    .filter((prefix) => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedPrefix) return true; // No specific rule — allow
  return ROLE_ACCESS[matchedPrefix].includes(userRole);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req: request, res: response });

  // Refresh session if it exists
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Unauthenticated user trying to access protected route
  if (isProtectedRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth routes — redirect to dashboard
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Role-based access control for authenticated users
  if (session && isProtectedRoute) {
    // Fetch user role from users table
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", session.user.id)
      .single();

    const userRole = (userData as unknown as { role?: string } | null)?.role;

    if (userRole) {
        if (!isRoleAllowed(pathname, userRole)) {
          // Redirect to dashboard with access denied flag
          const dashboardUrl = new URL("/dashboard", request.url);
          dashboardUrl.searchParams.set("error", "access_denied");
          return NextResponse.redirect(dashboardUrl);
        }
      }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - API routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

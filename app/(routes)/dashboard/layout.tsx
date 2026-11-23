import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { SidebarInset, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/session";

import { AppSidebar } from "./_components/app-sidebar";
import { UserMenu } from "./_components/user-menu";

/**
 * The studio shell: an app frame exactly one viewport tall. The sidebar never moves; only the main
 * area scrolls, and only when its content is taller than the window.
 * The sidebar is static and prerenders; only the user row reads the session, so it streams in
 * behind its own boundary (and redirects to sign-in if the session is gone).
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        userMenu={
          <Suspense fallback={<UserMenuSkeleton />}>
            <SignedInUser />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0 overflow-y-auto bg-background">
        {/* Below `sm` the sidebar is a sheet, so it needs a way in. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:hidden">
          <SidebarTrigger />
          <Logo href="/dashboard" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

async function SignedInUser() {
  const user = await requireUser();
  return <UserMenu user={{ name: user.name, email: user.email, image: user.image }} />;
}

/**
 * Same footprint as the lg user button. Not SidebarMenuSkeleton: it calls Math.random() while
 * rendering, which Cache Components rejects during prerender.
 */
function UserMenuSkeleton() {
  return (
    <SidebarMenuItem className="flex h-12 items-center gap-2 p-2 group-data-[collapsible=icon]:p-0">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </SidebarMenuItem>
  );
}

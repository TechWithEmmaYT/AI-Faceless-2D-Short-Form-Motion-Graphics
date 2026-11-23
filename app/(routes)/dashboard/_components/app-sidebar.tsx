"use client";

import { FolderIcon, HomeIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlayIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { href: "/dashboard", label: "Home", icon: HomeIcon, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderIcon, exact: false },
] as const;

/**
 * The studio sidebar, built the way shadcn's sidebar blocks are (sidebar-07): every row is a
 * SidebarMenuButton, so the collapsed icon rail lines up on its own.
 * DESIGN.md: logo (with the collapse toggle at its right), the black "Create Project" action,
 * Home / Projects with a yellow active edge, and the user dropdown (account, theme, sign out) at the foot.
 */
export function AppSidebar({ userMenu }: { userMenu: ReactNode }) {
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const closeOnMobile = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 pt-4">
        <SidebarMenu className="gap-3">
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="MotionStudio" render={<Link href="/dashboard" onClick={closeOnMobile} />} className="hover:bg-transparent active:bg-transparent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <PlayIcon className="fill-current" />
              </div>
              <span className="text-lg font-bold tracking-tight">MotionStudio</span>
            </SidebarMenuButton>
            {/* Collapse lives on the logo row (desktop); hidden in the rail, where Expand takes over below. */}
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuAction
                      onClick={toggleSidebar}
                      aria-label="Collapse sidebar"
                      className="size-7 text-muted-foreground hover:text-foreground"
                    />
                  }
                >
                  <PanelLeftCloseIcon />
                </TooltipTrigger>
                <TooltipContent side="right">Collapse (Ctrl+B)</TooltipContent>
              </Tooltip>
            )}
          </SidebarMenuItem>

          {collapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} tooltip="Expand (Ctrl+B)" aria-label="Expand sidebar" className="text-muted-foreground">
                <PanelLeftOpenIcon />
                <span>Expand</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <SidebarMenuButton
              size="nav"
              tooltip="Create Project"
              render={<Link href="/dashboard/projects/new" onClick={closeOnMobile} />}
              className="justify-center bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground active:bg-primary/85 active:text-primary-foreground group-data-[collapsible=icon]:justify-start"
            >
              <PlusIcon />
              <span>Create Project</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* usePathname is request data on dynamic routes (/projects/[id]), so with Cache
                Components it streams; the fallback is the same menu with nothing highlighted. */}
            <Suspense fallback={<NavMenu pathname={null} onNavigate={closeOnMobile} />}>
              <ActiveNavMenu onNavigate={closeOnMobile} />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>{userMenu}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNavMenu({ onNavigate }: { onNavigate: () => void }) {
  return <NavMenu pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavMenu({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  return (
    <SidebarMenu className="gap-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            size="nav"
            tooltip={label}
            isActive={pathname !== null && (exact ? pathname === href : pathname.startsWith(href))}
            render={<Link href={href} onClick={onNavigate} />}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

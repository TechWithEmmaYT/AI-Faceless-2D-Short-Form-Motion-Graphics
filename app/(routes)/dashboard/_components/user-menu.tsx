"use client";

import { ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "next-themes";

import { signOut } from "@/lib/auth-client";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

const THEME_OPTIONS: Record<Theme, { label: string; icon: typeof SunIcon }> = {
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
  system: { label: "System", icon: MonitorIcon },
};

export type MenuUser = { name: string; email: string; image?: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function UserIdentity({ user }: { user: MenuUser }) {
  return (
    <>
      <Avatar className="rounded-lg">
        {user.image && <AvatarImage src={user.image} alt="" />}
        <AvatarFallback className="rounded-lg bg-brand-soft font-semibold text-brand-ink">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </>
  );
}

/** shadcn NavUser (sidebar-07): a menu item whose lg SidebarMenuButton opens the account menu. */
export function UserMenu({ user }: { user: MenuUser }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  // next-themes reports undefined until mounted; fall back so the menu renders the same on server and client.
  const { theme: rawTheme, resolvedTheme, setTheme } = useTheme();
  const theme: Theme = THEMES.includes(rawTheme as Theme) ? (rawTheme as Theme) : "light";
  const [signingOut, setSigningOut] = useState(false);
  const ThemeIcon = resolvedTheme === "dark" ? MoonIcon : SunIcon;

  async function onSignOut() {
    setSigningOut(true);
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      toast.error("Couldn't sign out. Try again.");
      return;
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}>
          <UserIdentity user={user} />
          <ChevronsUpDownIcon className="ml-auto text-faint" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <UserIdentity user={user} />
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ThemeIcon />
                Theme
                <span className="ml-auto text-xs text-muted-foreground">{THEME_OPTIONS[theme].label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  {THEMES.map((option) => {
                    const { label, icon: Icon } = THEME_OPTIONS[option];
                    return (
                      <DropdownMenuRadioItem key={option} value={option}>
                        <Icon />
                        {label}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onSignOut} disabled={signingOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

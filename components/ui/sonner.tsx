"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { useTheme } from "next-themes"

// MotionStudio toasts: Sonner's rich colours (green success, red error, …) at a larger size —
// wider, more padding, 15px text and 20px icons — so a status change is hard to miss.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      icons={{
        success: (
          <CircleCheckIcon className="size-5" />
        ),
        info: (
          <InfoIcon className="size-5" />
        ),
        warning: (
          <TriangleAlertIcon className="size-5" />
        ),
        error: (
          <OctagonXIcon className="size-5" />
        ),
        loading: (
          <Loader2Icon className="size-5 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "420px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast min-h-16 gap-3 px-5! py-4! text-[15px]! shadow-lg",
          title: "text-[15px] font-semibold",
          description: "text-sm",
          icon: "size-5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

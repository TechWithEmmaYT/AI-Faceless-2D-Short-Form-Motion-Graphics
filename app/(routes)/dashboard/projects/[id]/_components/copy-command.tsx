"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** DESIGN.md command block: one line of JetBrains Mono that scrolls sideways, with a copy button. */
export function CopyCommand({
  command,
  variant = "dark",
  copyable = true,
}: {
  command: string;
  variant?: "dark" | "light";
  /** false for display-only commands (e.g. a masked key that can't be used). */
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-4",
        variant === "dark" ? "bg-terminal text-terminal-foreground" : "border bg-well text-foreground",
      )}
    >
      <code className={cn("no-scrollbar min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] whitespace-nowrap", !copyable && "opacity-60")}>{command}</code>
      {copyable && <Button
        type="button"
        size="sm"
        variant={variant === "dark" ? "ghost" : "outline"}
        onClick={copy}
        className={cn("shrink-0", variant === "dark" && "text-terminal-foreground hover:bg-white/10 hover:text-terminal-foreground")}
      >
        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
        {copied ? "Copied" : "Copy"}
      </Button>}
    </div>
  );
}

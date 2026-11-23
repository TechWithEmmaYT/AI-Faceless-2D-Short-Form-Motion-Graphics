"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A button that asks first (shadcn AlertDialog) — for anything that can't be undone.
 * `onConfirm` may return a promise: the dialog then stays open with a spinner on the action (and
 * can't be dismissed) until it resolves, closing only once the work is done. If it rejects, the
 * dialog stays open so the user can retry (the caller shows the error).
 */
export function ConfirmButton({
  label,
  icon: Icon,
  title,
  description,
  confirm,
  onConfirm,
  destructive,
}: {
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => Promise<unknown> | void;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function run() {
    setWorking(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Stay open; the caller reports the error (toast).
    } finally {
      setWorking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !working && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant={destructive ? "destructive" : "outline"} size="sm" />}>
        <Icon data-icon="inline-start" />
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} disabled={working} onClick={run}>
            {working && <Spinner data-icon="inline-start" />}
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

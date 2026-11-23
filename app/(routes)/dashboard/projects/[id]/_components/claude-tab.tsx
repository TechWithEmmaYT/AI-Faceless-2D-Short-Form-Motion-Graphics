"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ClipboardCopyIcon, KeyRoundIcon, RefreshCwIcon, ShieldAlertIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/studio/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  apiKeyKeys,
  createApiKeyMutationFn,
  getApiKeyQueryFn,
  revokeApiKeyMutationFn,
  type ApiKeyInfo,
  type ProjectDetail,
  type ProjectState,
} from "@/lib/api";
import { workspacePath } from "@/lib/agent/guide/workspace";
import { formatRelative } from "@/lib/styles";
import { scriptLines } from "@/lib/validation/script";

import { CopyCommand } from "./copy-command";

const STYLE_NAME = { "story-scene": "Story Scene", presenter: "Presenter", system: "System", documentary: "Documentary" } as const;
const CONNECTED_WITHIN_MS = 10 * 60 * 1000;
/** Where a just-created key lives for this browser session only (memory, never persisted). */
const SECRET_KEY = [...apiKeyKeys.current, "secret"] as const;

function mcpCommand(key: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `claude mcp add --transport http motionstudio ${origin}/api/mcp --header "x-api-key: ${key}"`;
}

/** The handoff prompt the user pastes into Claude Code; it says where the project is up to. */
function handoffPrompt(project: ProjectDetail, sceneCount: number) {
  const lines = project.script ? scriptLines(project.script).length : 0;
  const hasStoryboard = Array.isArray(project.storyboard) && project.storyboard.length > 0;
  const status = sceneCount
    ? `The script, storyboard and ${sceneCount} scene(s) exist. Call get_project and continue building; look at your work with render_frames.`
    : hasStoryboard
      ? "The script and storyboard are approved and saved. Continue with the voice, then build the scenes one at a time."
      : project.script
        ? `The script is approved and saved (${lines} lines). Next: the storyboard — show it to me and wait for my approval before save_storyboard.`
        : "Show me the script and the storyboard and wait for my approval of each before saving them.";
  return [
    `You're working on MotionStudio project "${project.title}" (projectId: ${project.id}), style ${project.motionStyle}, target about ${project.targetSeconds} s.`,
    `The user's ${project.inputMode}:`,
    project.brief,
    `Call agent_md first and follow its loop. ${status}`,
    `Work in ${workspacePath(project.id)}/ — create it if it's missing; if it has a progress.md, read it first and pick up where it stops.`,
  ].join("\n");
}

/**
 * Claude Code tab (_design/claude-mcp.jpg, claude-mcp-2.png): connection status, the API key and the
 * command to connect, the saved script, the brief, and "Copy for Claude Code".
 */
export function ClaudeTab({ state }: { state: ProjectState }) {
  const { project, scenes } = state;
  const [copied, setCopied] = useState(false);
  const lines = project.script ? scriptLines(project.script) : [];

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(handoffPrompt(project, scenes.length));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Handoff prompt copied. Paste it into Claude Code.");
    } catch {
      toast.error("Couldn't copy the prompt.");
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <ConnectionCard />

      <Card>
        <CardHeader>
          <CardTitle className="section-heading text-lg font-semibold">Script</CardTitle>
          <CardDescription>
            {project.script ? "Approved in chat and saved by Claude Code." : "Claude Code writes it and shows it to you in chat; it's saved only after you approve."}
          </CardDescription>
          <CardAction>
            <Badge variant={project.script ? "brand" : "outline"}>{project.script ? `${lines.length} lines` : "Waiting"}</Badge>
          </CardAction>
        </CardHeader>
        {project.script && (
          <CardContent>
            <ol className="max-h-72 overflow-y-auto rounded-lg border bg-well p-3 text-[14px] leading-relaxed">
              {lines.map((line) => (
                <li key={line.n} className={line.sceneBreakBefore ? "mt-3" : undefined}>
                  <span className="mr-2 inline-block w-6 text-right font-mono text-xs text-faint tabular-nums">{line.n}</span>
                  <ScriptLine text={line.text} />
                </li>
              ))}
            </ol>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="section-heading text-lg font-semibold">Project Brief</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 rounded-lg border bg-well p-4">
            <p className="font-semibold">{project.title}</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{project.brief}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="brand">Motion Style: {STYLE_NAME[project.motionStyle]}</Badge>
              <Badge variant="outline">Target {project.targetSeconds === 60 ? "1m" : `${project.targetSeconds}s`}</Badge>
              <Badge variant="outline">{project.inputMode === "idea" ? "From an idea" : "From a script"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 mt-auto -mx-1 bg-linear-to-t from-card via-card to-transparent px-1 pt-4 pb-1">
        <Button size="lg" className="h-12 w-full text-[15px]" onClick={copyHandoff}>
          {copied ? <CheckIcon data-icon="inline-start" /> : <ClipboardCopyIcon data-icon="inline-start" />}
          {copied ? "Copied!" : "Copy for Claude Code"}
        </Button>
      </div>
    </div>
  );
}

/** A script line with its *key* word highlighted. */
function ScriptLine({ text }: { text: string }) {
  return (
    <span>
      {text.split(/(\*[^*]+\*)/g).map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? (
          <mark key={i} className="rounded-sm bg-brand-soft px-0.5 font-semibold text-foreground">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

function ConnectionCard() {
  const queryClient = useQueryClient();
  const keyQuery = useQuery({ queryKey: apiKeyKeys.current, queryFn: getApiKeyQueryFn, refetchInterval: 15_000 });
  const secret = useQuery({ queryKey: SECRET_KEY, queryFn: () => null as string | null, enabled: false, staleTime: Infinity, gcTime: Infinity }).data ?? null;

  const create = useMutation({
    mutationFn: createApiKeyMutationFn,
    onSuccess: ({ key, secret }) => {
      queryClient.setQueryData(apiKeyKeys.current, key);
      queryClient.setQueryData(SECRET_KEY, secret);
      toast.success("API key created. Copy the command now — the key is shown only once.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't create a key."),
  });
  const revoke = useMutation({
    mutationFn: revokeApiKeyMutationFn,
    onSuccess: () => {
      queryClient.setQueryData(apiKeyKeys.current, null);
      queryClient.setQueryData(SECRET_KEY, null);
      toast.success("API key revoked. Claude Code can't reach this studio until you create a new one.");
    },
    onError: () => toast.error("Couldn't revoke the key."),
  });

  const key = keyQuery.data ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Claude Code MCP</CardTitle>
        <CardDescription>Claude Code builds this video through MotionStudio&apos;s MCP server, using your API key.</CardDescription>
        <CardAction>{keyQuery.isPending ? <Skeleton className="h-7 w-28 rounded-full" /> : <StatusBadge apiKey={key} />}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {keyQuery.isPending ? (
          <Skeleton className="h-11 rounded-lg" />
        ) : !key ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">Create your API key to get the command that connects Claude Code to MotionStudio.</p>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
              Get API key
            </Button>
          </div>
        ) : (
          <>
            <h3 className="section-heading text-[15px] font-semibold">MCP Command</h3>
            {secret ? (
              <>
                <CopyCommand command={mcpCommand(secret)} />
                <Alert className="border-brand-border bg-brand-soft text-brand-ink">
                  <ShieldAlertIcon />
                  <AlertTitle>Copy it now — the key is shown only once.</AlertTitle>
                  <AlertDescription className="text-brand-ink/80">
                    Run it in your terminal, then start Claude Code. Keep the key private: anyone with it can edit your projects.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <>
                <CopyCommand command={mcpCommand(`${key.start}…`)} copyable={false} />
                <p className="text-xs text-muted-foreground">
                  Your key starts with <code className="font-mono">{key.start}</code>. It&apos;s stored hashed, so it can&apos;t be shown again. Lost it? Regenerate.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <ConfirmButton
                label="Regenerate key"
                icon={RefreshCwIcon}
                title="Regenerate your API key?"
                description="The current key stops working immediately. You'll run the new claude mcp add command in your terminal."
                confirm="Regenerate"
                onConfirm={() => create.mutateAsync()}
              />
              <ConfirmButton
                label="Revoke"
                icon={TrashIcon}
                destructive
                title="Revoke your API key?"
                description="Claude Code loses access to MotionStudio until you create a new key."
                confirm="Revoke key"
                onConfirm={() => revoke.mutateAsync()}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ apiKey }: { apiKey: ApiKeyInfo | null }) {
  // Re-evaluated on every refetch (15 s); the clock read is what makes "connected" go stale.
  const [now] = useState(() => Date.now());
  if (!apiKey) {
    return (
      <Badge variant="outline" className="h-7 px-3">
        No API key
      </Badge>
    );
  }
  const last = apiKey.lastRequest ? new Date(apiKey.lastRequest).getTime() : 0;
  const connected = last > 0 && now - last < CONNECTED_WITHIN_MS;
  return connected ? (
    <Badge variant="brand" className="h-7 gap-1.5 px-3">
      <span className="size-1.5 rounded-full bg-brand" aria-hidden />
      Connected · {formatRelative(apiKey.lastRequest!)}
    </Badge>
  ) : (
    <Badge variant="outline" className="h-7 gap-1.5 px-3">
      <span className="size-1.5 rounded-full bg-faint" aria-hidden />
      {apiKey.lastRequest ? `Last seen ${formatRelative(apiKey.lastRequest)}` : "Not connected yet"}
    </Badge>
  );
}

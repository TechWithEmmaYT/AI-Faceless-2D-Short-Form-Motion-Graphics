"use client";

import { AlertTriangleIcon, CheckIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RenderHostFrame, type RenderHostHandle } from "@/components/studio/render-host";
import type { ProjectState } from "@/lib/api";
import type { HostScene } from "@/lib/render/host/protocol";
import { formatTimecode, totalDuration } from "@/lib/render/timeline";
import { CANVAS_H, CANVAS_W, FPS } from "@/lib/render/types";
import { mixProjectAudio } from "@/lib/studio/audio-mix";

/**
 * An upper bound for the MP4's size: H.264 "high" quality at 1080×1920 peaks near 8 Mb/s, AAC adds
 * ~0.2 Mb/s. Flat motion graphics usually come out far smaller (a 13.5 s demo: 1.0 MB).
 */
const ESTIMATED_MBPS = 8.2;

type Phase =
  | { step: "idle" }
  | { step: "mixing" }
  | { step: "encoding"; frame: number; frames: number }
  | { step: "done"; url: string; fileName: string; bytes: number; warnings: string[] }
  | { step: "failed"; message: string };

/** Export needs WebCodecs (VideoEncoder) in a Chromium browser — desktop Chrome or Edge. */
function canExport() {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined" || typeof OfflineAudioContext === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[]; mobile: boolean } }).userAgentData;
  return !!brands && !brands.mobile && brands.brands.some((b) => b.brand === "Chromium");
}
const noSubscribe = () => () => undefined;

/**
 * Export (plan, Phase 8): the soundtrack is mixed here (OfflineAudioContext, same timing as the
 * preview), then a dedicated hidden sandbox renders every frame with the preview's renderer and
 * encodes the MP4 (1080×1920, 30 fps, H.264 + AAC). The file is downloaded, never stored. Cancelling
 * removes that sandbox, which stops the export wherever it is.
 */
export function ExportButton({
  state,
  hostData,
  onStart,
}: {
  state: ProjectState;
  hostData: HostScene;
  /** Called as an export starts (the editor pauses its preview, so the two don't compete for the CPU). */
  onStart?: () => void;
}) {
  const supported = useSyncExternalStore(noSubscribe, canExport, () => true);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  // A new key remounts the export sandbox: how a cancel or a retry starts from nothing.
  const [hostKey, setHostKey] = useState(0);
  const host = useRef<RenderHostHandle>(null);
  const run = useRef(0);

  const duration = totalDuration(state.scenes);
  const frames = Math.round(duration * FPS);
  const busy = phase.step === "mixing" || phase.step === "encoding";
  const doneUrl = phase.step === "done" ? phase.url : null;

  // Free the file's memory when it's replaced or the editor closes.
  useEffect(() => () => (doneUrl ? URL.revokeObjectURL(doneUrl) : undefined), [doneUrl]);

  async function start() {
    const id = ++run.current;
    const current = () => run.current === id;
    onStart?.();
    setPhase({ step: "mixing" });
    try {
      const audio = await mixProjectAudio({ scenes: state.scenes, clips: state.voiceClips, sounds: state.sounds, frames });
      if (!current()) return;
      setPhase({ step: "encoding", frame: 0, frames });
      if (!host.current) throw new Error("The export renderer isn't ready. Close this and try again.");
      const result = await host.current.exportVideo(audio, (frame, total) => current() && setPhase({ step: "encoding", frame, frames: total }));
      if (!current()) return;
      const blob = new Blob([result.mp4], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const fileName = `${fileSafe(state.project.title)}.mp4`;
      download(url, fileName);
      const warnings = [
        ...(result.audioCodec && result.audioCodec !== "aac" ? [`Audio is ${result.audioCodec.toUpperCase()} — this browser couldn't encode AAC.`] : []),
        ...(audio ? [] : ["The video has no audio yet."]),
        ...result.layerErrors.map((e) => `Layer “${e.layer}” failed to draw in some frames: ${e.message}`),
      ];
      setPhase({ step: "done", url, fileName, bytes: blob.size, warnings });
    } catch (error) {
      if (!current()) return;
      setPhase({ step: "failed", message: error instanceof Error ? error.message : String(error) });
      setHostKey((k) => k + 1); // a failed sandbox may be mid-encode: start the retry from a fresh one
    }
  }

  function cancel() {
    run.current++;
    setHostKey((k) => k + 1);
    setPhase({ step: "idle" });
  }

  function onOpenChange(next: boolean) {
    if (!next && busy) return; // close only via Cancel while exporting
    setOpen(next);
    if (!next) {
      run.current++;
      setPhase({ step: "idle" });
    }
  }

  const trigger = (
    <Button size="lg" className="h-10 px-4" disabled={!supported || frames < 1} onClick={() => setOpen(true)}>
      <UploadIcon data-icon="inline-start" />
      Export
    </Button>
  );

  return (
    <>
      {supported && frames >= 1 ? (
        trigger
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} />}>{trigger}</TooltipTrigger>
          <TooltipContent>{supported ? "Nothing to export yet — the video has no scenes" : "Use desktop Chrome or Edge to export"}</TooltipContent>
        </Tooltip>
      )}

      <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={busy}>
        <DialogContent showCloseButton={!busy} className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Export video</DialogTitle>
            <DialogDescription>An MP4 for TikTok, Reels and Shorts, downloaded to this computer.</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-3 gap-2 rounded-xl border bg-well p-3 text-sm">
            <Fact label="Length" value={formatTimecode(duration)} />
            <Fact label="Resolution" value={`${CANVAS_W}×${CANVAS_H}`} />
            <Fact label="Size" value={phase.step === "done" ? megabytes(phase.bytes) : `≤ ${megabytes((duration * ESTIMATED_MBPS * 1e6) / 8)}`} />
          </dl>

          {phase.step === "mixing" || phase.step === "encoding" ? (
            <div className="flex flex-col gap-2">
              <Progress value={phase.step === "encoding" ? Math.round((phase.frame / phase.frames) * 100) : 0}>
                <ProgressLabel>{phase.step === "mixing" ? "Mixing the audio…" : `Rendering frame ${phase.frame} of ${phase.frames}`}</ProgressLabel>
                <ProgressValue />
              </Progress>
              <p className="text-xs text-muted-foreground">Export keeps running if you switch tabs. Keep this tab open until it finishes.</p>
            </div>
          ) : null}

          {phase.step === "done" ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                Downloaded <span className="truncate font-mono text-[13px]">{phase.fileName}</span>
              </p>
              {phase.warnings.length ? (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertDescription>
                    <ul className="flex flex-col gap-1">
                      {phase.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {phase.step === "failed" ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>Export failed</AlertTitle>
              <AlertDescription>{phase.message}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            {busy ? (
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
            ) : null}
            {phase.step === "done" ? (
              <Button onClick={() => download(phase.url, phase.fileName)}>
                <DownloadIcon data-icon="inline-start" />
                Download again
              </Button>
            ) : (
              <Button onClick={start} disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
                {busy ? "Exporting…" : phase.step === "failed" ? "Try again" : "Export MP4"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The export sandbox: present only while the dialog is open; remounted to cancel or retry. */}
      {open ? <RenderHostFrame key={hostKey} ref={host} data={hostData} hidden label="Export renderer" /> : null}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

const fileSafe = (title: string) =>
  title
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "motionstudio-video";

function download(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

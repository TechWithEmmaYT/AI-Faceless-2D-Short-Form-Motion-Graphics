/**
 * The render-host page script. Runs in <iframe sandbox="allow-scripts"> — an opaque origin with no
 * access to the studio's DOM, cookies or storage, and a CSP with connect-src 'none' (no network).
 * It owns one canvas, runs the renderer in a worker (built from __WORKER_SOURCE__), and keeps a
 * watchdog: if agent code hangs the worker (an infinite loop), it is terminated and restarted, so the
 * studio never freezes. Bundled into public/render-host/index.html by scripts/build-render-host.mjs.
 */
import type {
  FromHost,
  FromWorker,
  HostScene,
  ToHost,
  ToWorker,
} from "./protocol";

declare const __WORKER_SOURCE__: string;

const FRAME_TIMEOUT_MS = 1500;
/** Watchdogs per job: render_frames and a still must finish in time; an export must keep making progress. */
const JOB_TIMEOUT_MS = { capture: 25_000, still: 8_000, export: 20_000 } as const;
type JobKind = keyof typeof JOB_TIMEOUT_MS;
const JOB_HANG: Record<JobKind, string> = {
  capture: "Rendering the frames took too long (possibly an infinite loop in a layer's code), so the renderer was restarted.",
  still: "Rendering the poster took too long (possibly an infinite loop in a layer's code), so the renderer was restarted.",
  export: "The export stopped making progress (possibly an infinite loop in a layer's code), so the renderer was restarted.",
};

let worker: Worker | null = null;
let fonts: { sans: ArrayBuffer; mono: ArrayBuffer } | null = null;
let data: HostScene | null = null;
let latestT = 0;
let drawnT = -1;
let busy = false;
let seq = 0;
let frameTimer: ReturnType<typeof setTimeout> | null = null;
const jobs = new Map<string, { kind: JobKind; timer: ReturnType<typeof setTimeout> }>();
let lastErrors = "";

const toParent = (message: FromHost, transfer: Transferable[] = []) => window.parent.postMessage(message, "*", transfer); // parent origin is ours; data only
const toWorker = (message: ToWorker, transfer: Transferable[] = []) =>
  worker?.postMessage(message, transfer);

function startWorker() {
  document.querySelector("canvas")?.remove();
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const offscreen = canvas.transferControlToOffscreen();
  worker = new Worker(
    URL.createObjectURL(
      new Blob([__WORKER_SOURCE__], { type: "text/javascript" }),
    ),
  );
  worker.onmessage = (event: MessageEvent<FromWorker>) => onWorker(event.data);
  busy = false;
  // Structured clone copies the font buffers, so they can be sent again after a restart.
  toWorker({ type: "init", canvas: offscreen, fonts: fonts! }, [offscreen]);
  resize();
  if (data) toWorker({ type: "load", data });
}

function restart(reason: string) {
  worker?.terminate();
  worker = null;
  if (frameTimer) clearTimeout(frameTimer);
  for (const [id, job] of jobs) {
    clearTimeout(job.timer);
    toParent(job.kind === "capture" ? { type: "capture-failed", id, message: reason } : { type: "job-failed", id, message: reason });
  }
  jobs.clear();
  toParent({ type: "restarted", reason });
  startWorker();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  toWorker({
    type: "resize",
    width: Math.max(1, Math.round(window.innerWidth * dpr)),
    height: Math.max(1, Math.round(window.innerHeight * dpr)),
  });
  drawnT = -1;
  pump();
}

/** One frame in flight at a time; always draw the latest requested t. */
function pump() {
  if (!worker || busy || latestT === drawnT) return;
  busy = true;
  const t = latestT;
  toWorker({ type: "frame", seq: ++seq, t });
  frameTimer = setTimeout(
    () =>
      restart(
        "A layer took too long to draw (possibly an infinite loop in its code), so the renderer was restarted.",
      ),
    FRAME_TIMEOUT_MS,
  );
  drawnT = t;
}

function onWorker(msg: FromWorker) {
  if (msg.type === "drawn") {
    if (frameTimer) clearTimeout(frameTimer);
    busy = false;
    const errors = JSON.stringify(msg.errors);
    if (errors !== lastErrors) {
      lastErrors = errors;
      toParent({ type: "layer-errors", errors: msg.errors });
    }
    pump();
  } else if (msg.type === "initialized") {
    toParent({ type: "initialized" });
    pump();
  } else if (msg.type === "export-progress") {
    const job = jobs.get(msg.id);
    if (job) watch(msg.id, job.kind); // still alive: restart its stall timer
    toParent(msg);
  } else if (msg.type === "export-done") {
    endJob(msg.id);
    toParent(msg, [msg.result.mp4]);
  } else if (msg.type === "still-done") {
    endJob(msg.id);
    toParent(msg, [msg.jpeg]);
  } else if (msg.type === "captured" || msg.type === "capture-failed" || msg.type === "job-failed") {
    endJob(msg.id);
    toParent(msg);
  }
}

function watch(id: string, kind: JobKind) {
  const previous = jobs.get(id);
  if (previous) clearTimeout(previous.timer);
  jobs.set(id, { kind, timer: setTimeout(() => restart(JOB_HANG[kind]), JOB_TIMEOUT_MS[kind]) });
}

function endJob(id: string) {
  const job = jobs.get(id);
  if (job) clearTimeout(job.timer);
  jobs.delete(id);
}

/** Starts a worker job under a watchdog, or fails it at once if the renderer isn't up. */
function startJob(message: Extract<ToWorker, { type: JobKind }>, transfer: Transferable[] = []) {
  if (!worker) {
    const reason = "The renderer isn't ready yet.";
    return toParent(message.type === "capture" ? { type: "capture-failed", id: message.id, message: reason } : { type: "job-failed", id: message.id, message: reason });
  }
  watch(message.id, message.type);
  toWorker(message, transfer);
}

window.addEventListener("message", (event: MessageEvent<ToHost>) => {
  if (event.source !== window.parent) return; // only the studio page that embeds us
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "init") {
    fonts = msg.fonts;
    if (!worker) startWorker();
  } else if (msg.type === "load") {
    data = msg.data;
    toWorker({ type: "load", data });
    drawnT = -1;
    pump();
  } else if (msg.type === "frame") {
    latestT = msg.t;
    pump();
  } else if (msg.type === "capture") {
    startJob({ type: "capture", id: msg.id, spec: msg.spec });
  } else if (msg.type === "still") {
    startJob({ type: "still", id: msg.id, t: msg.t, longEdge: msg.longEdge });
  } else if (msg.type === "export") {
    startJob({ type: "export", id: msg.id, audio: msg.audio }, msg.audio ? msg.audio.channels.map((c) => c.buffer as ArrayBuffer) : []);
  }
});

new ResizeObserver(() => resize()).observe(document.documentElement);
toParent({ type: "ready" });

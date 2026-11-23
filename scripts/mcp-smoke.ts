/**
 * MCP self-check (mcp-builder skill, "Verify Your Server"): connects to the running MotionStudio MCP
 * server like Claude Code does, calls every tool with realistic arguments, checks that bad input
 * comes back as a readable tool error, and exits non-zero on any failure.
 *
 *   MCP_URL=http://localhost:3000/api/mcp MCP_API_KEY=ms_… MCP_PROJECT_ID=… npm run mcp:smoke
 *
 * It WRITES to the given project (script, storyboard, two scenes, layers, an element), so point it
 * at a throwaway project.
 */
import { strict as assert } from "node:assert";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.env.MCP_URL ?? "http://localhost:3000/api/mcp");
const apiKey = process.env.MCP_API_KEY ?? "";
const projectId = process.env.MCP_PROJECT_ID ?? "";
if (!apiKey || !projectId) {
  console.error("Set MCP_API_KEY and MCP_PROJECT_ID (a throwaway project).");
  process.exit(2);
}

type Result = { isError?: boolean; content?: { type: string; text?: string }[] };
const textOf = (r: Result) => (r.content ?? []).map((c) => c.text ?? "").join("\n");
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  assert.ok(ok, `${name} ${detail}`);
  passed++;
  console.error(`  ✓ ${name}`);
}

async function connect(key: string) {
  const client = new Client({ name: "motionstudio-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { "x-api-key": key } } }));
  return client;
}

async function main() {
  // Auth: a wrong key must be refused before any tool runs.
  const refused = await connect("ms_not_a_real_key").then(
    () => false,
    () => true,
  );
  check("rejects an invalid API key", refused);

  const client = await connect(apiKey);
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<Result>;

  const { tools } = await client.listTools();
  const expected = [
    "add_layer", "add_scene", "agent_md", "delete_layer", "delete_scene", "get_element_code", "get_guide", "get_project",
    "get_example", "get_selection", "get_upload_target", "list_elements", "render_frames", "save_generated_audio", "reorder_scenes", "save_element", "save_script", "save_storyboard", "update_layer", "update_scene",
    "add_sound", "update_sound", "remove_sound",
  ];
  check("lists the 23 tools", JSON.stringify(tools.map((t) => t.name).sort()) === JSON.stringify([...expected].sort()), JSON.stringify(tools.map((t) => t.name)));
  check("every tool has annotations", tools.every((t) => t.annotations));

  check("agent_md returns the loop", textOf(await call("agent_md")).includes("The loop"));
  check("get_guide storyboard", textOf(await call("get_guide", { topic: "storyboard" })).includes("shot list"));
  check("get_guide style brief", textOf(await call("get_guide", { topic: "presenter" })).length > 500);
  const example = (await call("get_example", { style: "presenter", include_code: false })) as Result & { content: { type: string }[] };
  check("get_example returns notes + 6 stills", textOf(example).includes("What to copy") && example.content.filter((c) => c.type === "image").length === 6);
  check("get_guide unknown lists topics", textOf(await call("get_guide", { topic: "nope" })).includes("## Topics"));

  const notFound = await call("get_project", { projectId: "00000000-0000-0000-0000-000000000000" });
  check("get_project: unknown project is a tool error", !!notFound.isError && textOf(notFound).includes("not found"));

  const early = await call("save_storyboard", { projectId, shots: [{ id: "hook", place: "desk", lines: [1] }] });
  check("save_storyboard before a script is refused", !!early.isError && textOf(early).includes("save_script"));

  const script = "You can make *this* video\nwithout opening an editor\n\nClaude Code builds every scene\nand you watch it *live*";
  check("save_script", !textOf(await call("save_script", { projectId, script })).includes("Error"));

  const gap = await call("save_storyboard", { projectId, shots: [{ id: "hook", place: "desk", lines: [1, 2] }, { id: "proof", place: "studio", lines: [4] }] });
  check("save_storyboard: a missing line is refused", !!gap.isError && textOf(gap).includes("line 3"));

  const board = await call("save_storyboard", {
    projectId,
    shots: [
      { id: "hook", place: "a paper desk, top light", lines: [1, 2], cards: [{ kind: "stamp", text: "NO EDITOR", from: 2 }], join: "cut" },
      { id: "proof", place: "the studio, preview on screen", lines: [3, 4], moves: "the preview fills in scene by scene", join: "dissolve" },
    ],
  });
  check("save_storyboard", !board.isError, textOf(board));

  const sceneA = textOf(await call("add_scene", { projectId, title: "Hook — No editor", durationSec: 4, shotId: "hook" })).match(/scene id: ([0-9a-f-]{36})/)?.[1];
  const sceneB = textOf(await call("add_scene", { projectId, title: "Proof — Live", durationSec: 3, join: "dissolve", shotId: "proof" })).match(/scene id: ([0-9a-f-]{36})/)?.[1];
  check("add_scene ×2 returns ids", !!sceneA && !!sceneB);

  const full = { x: 0, y: 0, w: 1080, h: 1920 };
  const bg = await call("add_layer", { projectId, sceneId: sceneA, kind: "element", name: "paper", elementRef: "background", z: 0, box: full, params: { color: "#EEEBE3" } });
  check("add_layer element", !bg.isError, textOf(bg));
  const capId = textOf(
    await call("add_layer", { projectId, sceneId: sceneA, kind: "caption", name: "caption 1", text: "You can make *this* video", z: 50, start: 0.2, end: 2, box: { x: 70, y: 1480, w: 940, h: 260 }, style: { color: "#141414", accent: "#D63A2F", size: 84 } }),
  ).match(/layer id: ([0-9a-f-]{36})/)?.[1];
  check("add_layer caption", !!capId);

  const badRef = await call("add_layer", { projectId, sceneId: sceneA, kind: "element", name: "x", elementRef: "nope", box: full });
  check("add_layer: unknown element is refused", !!badRef.isError && textOf(badRef).includes("Built-in"));
  const impure = await call("add_layer", { projectId, sceneId: sceneA, kind: "code", name: "x", code: "ctx.fillRect(Math.random()*w,0,10,10)", box: full });
  check("add_layer: Math.random is refused", !!impure.isError && textOf(impure).includes("M.rnd"));
  const syntax = await call("add_layer", { projectId, sceneId: sceneA, kind: "code", name: "x", code: "ctx.fillRect(", box: full });
  check("add_layer: syntax error is reported", !!syntax.isError && textOf(syntax).includes("Syntax error"));
  const late = await call("add_layer", { projectId, sceneId: sceneA, kind: "caption", name: "x", text: "too late", start: 9, box: full });
  check("add_layer: start past the scene end is refused", !!late.isError && textOf(late).includes("update_scene"));
  const badInput = await call("add_layer", { projectId, sceneId: sceneA, kind: "caption", name: "x", text: "tiny", box: full, style: { size: 20 } });
  check("schema: caption under 58px is rejected by zod", !!badInput.isError);

  check("update_layer", !(await call("update_layer", { projectId, layerId: capId, end: 3.5, style: { color: "#111111", accent: "#D63A2F", size: 90 } })).isError);
  check("update_scene", !(await call("update_scene", { projectId, sceneId: sceneB, durationSec: 3.5 })).isError);

  // Voice: validation runs before Cloudinary is touched, so these hold with or without credentials.
  const target = await call("get_upload_target", { projectId, kind: "voice", name: "scene-01" });
  check(
    "get_upload_target: a curl command, or a clear 'not configured'",
    target.isError ? textOf(target).includes("Cloudinary isn't configured") : textOf(target).includes("curl") && textOf(target).includes("/voice/scene-01"),
    textOf(target).slice(0, 160),
  );
  const voiceBase = { projectId, sceneId: sceneA, voiceName: "Emma", publicId: "motionstudio/x/y/voice/scene-01" };
  const offShot = await call("save_generated_audio", { ...voiceBase, lines: [{ line: 3, start: 0, end: 1.5 }] });
  check("save_generated_audio: a line from another shot is refused", !!offShot.isError && textOf(offShot).includes("shot"), textOf(offShot));
  const overlap = await call("save_generated_audio", { ...voiceBase, lines: [{ line: 1, start: 0, end: 2 }, { line: 2, start: 1.5, end: 3 }] });
  check("save_generated_audio: overlapping lines are refused", !!overlap.isError && textOf(overlap).includes("overlapping"), textOf(overlap));
  const foreign = await call("save_generated_audio", { ...voiceBase, lines: [{ line: 1, start: 0, end: 1.8 }, { line: 2, start: 2.05, end: 3.6 }] });
  check("save_generated_audio: a file outside this project's folder is refused", !!foreign.isError && /voice folder|isn't configured/.test(textOf(foreign)), textOf(foreign));
  const both = await call("save_generated_audio", { ...voiceBase, url: "https://example.com/a.mp3", lines: [{ line: 1, start: 0, end: 1 }] });
  check("save_generated_audio: publicId and url together are refused", !!both.isError && textOf(both).includes("exactly one"));

  // Sounds: the same — every refusal below is decided before Cloudinary is touched.
  const sfx = { projectId, kind: "sfx", sceneId: sceneA, name: "phone buzz", source: "Openverse", url: "https://example.com/buzz.mp3" };
  const refuses = async (label: string, args: Record<string, unknown>, expect: RegExp, tool = "add_sound") => {
    const r = await call(tool, args);
    check(label, !!r.isError && expect.test(textOf(r)), textOf(r).slice(0, 160));
  };
  await refuses("add_sound: sfx without a scene is refused", { ...sfx, sceneId: undefined }, /needs sceneId/);
  await refuses("add_sound: music with a scene is refused", { ...sfx, kind: "music" }, /omit sceneId/);
  await refuses("add_sound: a loud story sound is refused", { ...sfx, volume: 0.9 }, /0\.2–0\.4/);
  await refuses("add_sound: loud music is refused", { ...sfx, kind: "music", sceneId: undefined, volume: 0.5 }, /under the voice/);
  await refuses("add_sound: a time past the scene's end is refused", { ...sfx, at_sec: 50 }, /past the end/);
  await refuses("add_sound: an empty trim is refused", { ...sfx, trim_start: 1, trim_end: 1 }, /Nothing left to play/);
  await refuses("add_sound: publicId and url together are refused", { ...sfx, publicId: "motionstudio/x/y/sound/a" }, /exactly one/);
  await refuses("add_sound: a file outside this project's folder is refused", { ...sfx, url: undefined, publicId: "motionstudio/x/y/sound/a" }, /sound folder|isn't configured/);
  await refuses("add_sound: a plain sfx reaches Cloudinary (or says it isn't configured)", sfx, /isn't configured|fetch|upload|Cloudinary/i);
  await refuses("update_sound: an unknown sound id is refused", { projectId, soundId: "nope" }, /not found/, "update_sound");
  await refuses("remove_sound: an unknown sound id is refused", { projectId, soundId: "nope" }, /not found/, "remove_sound");
  check("get_project still answers with sounds wired in", !(await call("get_project", { projectId })).isError);

  const element = await call("save_element", {
    projectId,
    name: "badge",
    role: "card",
    description: "A rounded accent badge with a label (p.label).",
    code: "M.rr(ctx, 0, 0, w, h, h / 2);\nctx.fillStyle = p.color || '#D63A2F';\nctx.fill();\nctx.fillStyle = '#fff';\nctx.font = '700 40px sans-serif';\nctx.textAlign = 'center';\nctx.textBaseline = 'middle';\nctx.fillText(p.label || 'NEW', w / 2, h / 2 + 2 * Math.sin(t * 3));",
    defaultParams: { label: "NEW" },
  });
  check("save_element", !element.isError, textOf(element));
  check("save_element: built-in names are refused", !!(await call("save_element", { projectId, name: "chip", code: "ctx.fill();" })).isError);
  check("add_layer uses the saved element", !(await call("add_layer", { projectId, sceneId: sceneB, kind: "element", name: "badge", elementRef: "badge", box: { x: 340, y: 800, w: 400, h: 120 } })).isError);

  const elements = textOf(await call("list_elements", { projectId }));
  check("list_elements shows built-in + saved", elements.includes("terminal") && elements.includes("badge"));
  check("get_element_code built-in", textOf(await call("get_element_code", { projectId, name: "terminal" })).includes("cps"));
  check("get_element_code saved", textOf(await call("get_element_code", { projectId, name: "badge" })).includes("fillText"));

  check("reorder_scenes", !(await call("reorder_scenes", { projectId, sceneIds: [sceneB, sceneA] })).isError);
  check("reorder_scenes: incomplete list is refused", !!(await call("reorder_scenes", { projectId, sceneIds: [sceneA] })).isError);
  check("reorder back", !(await call("reorder_scenes", { projectId, sceneIds: [sceneA, sceneB] })).isError);

  check("get_selection with nothing open", textOf(await call("get_selection", { projectId })).includes("Nothing selected"));

  const project = await call("get_project", { projectId, response_format: "json" });
  const data = (project as unknown as { structuredContent?: { scenes: { title: string; layers: unknown[] }[]; storyboard: unknown[] } }).structuredContent;
  check("get_project json: 2 scenes, storyboard, layers", data?.scenes.length === 2 && data.storyboard.length === 2 && data.scenes[0]!.layers.length === 2, JSON.stringify(data?.scenes.map((s) => s.title)));

  if (process.env.MCP_EXPECT_NO_EDITOR) {
    const noEditor = await call("render_frames", { projectId, mode: "contact_sheet" });
    check("render_frames with no editor open tells the agent to open it", !!noEditor.isError && textOf(noEditor).includes("isn't open"), textOf(noEditor).slice(0, 300));
  }

  // Leave the project with its script, storyboard and scenes so the studio can be checked by eye.
  await client.close();
  console.error(`\nMCP smoke test passed: ${passed} checks.`);
}

main().catch((error) => {
  console.error("\nMCP smoke test FAILED:", error.message);
  process.exit(1);
});

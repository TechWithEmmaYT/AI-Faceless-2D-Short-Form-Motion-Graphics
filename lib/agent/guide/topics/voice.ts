/** get_guide({ topic: "voice" }) — the voice comes first and sets every time in the video. */
export const voiceTopic = `# The voice

**The voice sets the timing; the picture follows it.** A single long clip dropped on a video timed from an estimate drifted 17 s against its captions. So: one clip per line, measured.

## Before you start
- The fish-audio tools must be loaded. If not, stop and tell the user: \`claude mcp add --transport http fish-audio https://api.fish.audio/mcp\`, then /mcp to sign in, then start a new session. Never ask for a Fish Audio key.
- get_credit_balance shows the credits left and the per-call text budget. If the script won't fit, say so before generating.
- Pick one voice (search_voices) and say which. The same voice and the same settings for every line.

## The steps
1. **One clip per line**, in order, with text_to_speech — strip the \`*\` marks. Generate them one after another (never more than 3 at once, or Fish answers 429). Save each on the user's machine: \`vo/<scene>-<nn>.mp3\`.
2. **Measure each clip** (ffprobe, or a metadata reader). Free and exact.
3. **Lay out the times**: each line starts where the last one ended plus a breath — 0.25 s inside a shot, 0.5 s at the end of a shot. Keep a shot's lead-in.
4. **Join each scene's clips** into one file with those breaths (ffmpeg concat with short silences): \`vo/scene-01.mp3\`.
5. **Upload it**: get_upload_target({ projectId, kind: "voice", name: "scene-01" }) returns a curl command — run it with \`file=@vo/scene-01.mp3\`. (A scene that is a single Fish clip can skip this: pass its URL straight to save_generated_audio.)
6. **save_generated_audio once per scene**: { projectId, sceneId, publicId (or url), voiceName, lines: [{ line, start, end }] } — each line's start and end inside the joined file. The scene's length becomes the last line's end + 0.5 s. 8–12 saves for a short, never one per line.
7. Build the scenes on those times: each caption layer starts and ends on its line's times.

## Cost
Fish bills by the text, not by the number of calls: one clip per line costs the same as one long clip. What costs more is the **same text twice** — generate each line once and keep it. To fix one line, regenerate only that line, re-join its scene and save that scene again.

## Word timing (optional)
Lines are exact; words inside a line are spread evenly across its clip — fine for 3–8 word lines. If the user has Whisper installed, run it on the same clips for word times, then keep the approved script's words and take only the times (Whisper can mishear). Never require it.

## Never
A Fish Audio API key anywhere. One clip for the whole script. Captions timed from an estimate once the voice exists. The same line generated twice.`

/** get_guide({ topic: "checks" }) — what render_frames checks, and how to read it. */
export const checksTopic = `# Looking at your work

render_frames is your eyes. It renders the times you ask for with the same renderer as the preview and the export, and returns the frames (labelled with their time and the line being spoken) plus named checks.

## How to call it
- One scene: \`render_frames({ projectId, sceneId, times })\` — a frame on each of its lines, after you build it and after every fix. Omit times for 4 frames spread across the scene.
- The whole video at the end: \`render_frames({ projectId, mode: "contact_sheet" })\` — one frame per scene in one image.
- At most 8 frames a call, 480 px on the long edge (long_edge up to 720).
- It renders in the user's open editor. If it says MotionStudio isn't open, ask the user to open the project and keep the tab open.
- Extra checks you may see: layer-error (a layer threw — its message says why), past-scene-end (a layer ends after its scene), and a renderer restart (a layer hung: remove the loop).

## The named checks — fix every one
| check | means | usual fix |
|---|---|---|
| text-too-small | text under 3% of the height | bigger, or cut it |
| off-canvas | a layer outside the frame | move it in, or shrink it |
| hero-too-small | the character smaller than its style asks | its brief's size |
| words-float | a caption or label far from its picture | pin it to the object |
| layout-repeats | this scene's layout matches the last one | change framing or place |
| nothing-moves | no change inside the shot | a move from the storyboard |
| caption-outside-band | a caption outside its style's band | the brief's caption position |

## Then look yourself
Compare each frame with the example's stills for the style: the layout, the character's size, the caption band, the colours. A frame can pass every check and still be wrong.

## Done when
Every scene has passed twice with no check left, the whole-video pass is clean, and you have told the user what you checked and the five timecodes to check by ear.`

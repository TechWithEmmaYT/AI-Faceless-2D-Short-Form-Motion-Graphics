import type { Brief } from "./types"
import { BRIEF_FOOTER, SHARED_BUILD } from "./shared"

/**
 * Story Scene — a survival serial: someone lives through a situation, day by day.
 * Measured frame by frame on four serials (the lighthouse, the night train, the gridlock, the
 * stickman). Reference implementation: prototype/story-serial.html.
 */
export const storyScene: Brief = {
  id: "story-scene",
  name: "Story Scene",
  summary: "A character living through it, in a dark room: a survival serial, day by day.",
  when: 'A story where something happens to someone: "what if the zombie apocalypse caught you in…", a blackout, a stranded train, a scenario told over days. Serials that end on a cliffhanger.',
  formats: ["9:16"],
  length: "60 to 120 s, one day per episode.",
  character:
    "One front-facing hero with a friendly face: big readable head, dot eyes, one silhouette feature, one coat colour seen nowhere else. 20–25% of frame height.",
  elements: ["chip", "stamp", "crosssection"],
  tools: ["get_project", "get_guide", "save_script", "save_storyboard", "add_scene", "add_layer", "update_layer", "save_element", "list_elements", "get_element_code", "save_generated_audio", "render_frames"],
  body: `<inputs>
The story (a script, or a premise to write one from): the setting, the hero's name, age and job, and what goes wrong. Ask once for anything missing; otherwise pick one place and keep it. The series title for the end card ("THE LOOKOUT"). Never copy another creator's script; write the story fresh in this format.
</inputs>

<direction>
1. Layout, fixed in every shot: the picture fills the top 66% of the frame (the ground line at y 1270 of 1920); below it is a dark band that carries the caption at 77% (y 1484). Never put words over the picture except cards.
2. Look: clean flat vector, navy night (#0B142E to #1F2C52), every light from something you can see (a lamp, a window, a screen), soft glow pools. No grain, no heavy vignette, no rim light: that murk is what makes it look generated.
3. HUD, top-left on every story shot: a small red dot and "DAY 1", the clock big in Oswald 600 ("10:47 PM"), a small grey place tag under it ("NIGHT", "14TH FLOOR"). The clock advances across shots. The hook, the breath shots, the map and the end card have no HUD.
4. Captions: the whole spoken line at once, sentence case, Oswald 600 at 76 px with a dark outline, wrapped to two rows past 900 px. The whole line takes one colour, and the colour is a code fixed for the video: red #F2553F danger, green #3DC46E safe or good news, yellow #F6B526 names, numbers and facts, white everything else.
5. Mood wash: on the hardest red lines a red tint covers the frame; on the luckiest green lines a green tint from the top. Never on every line.
6. The card system, one look everywhere: pills (dark fill, gold #D9A63A border, coloured caps text) centred under the HUD; a name card ("THEO · 27 / FIRE LOOKOUT"); ✓ chips for a routine (LAMP · WEATHER · TEA); a dispatch card that types its message; a cream supplies card with filling bars; a checklist card that ticks on "check."; data labels pinned to objects.
7. Shots hold 4 to 12 s and the world moves inside them: lights die window by window, a bath fills, chips tick on, a crowd walks in. One system shot recurs (a map, a cross-section) and is the spine.
8. Breath shots: black, red eyes blinking in the dark around the tiny place, once near the start and once before the end.
9. Camera: none, beyond a 2.5% drift per shot alternating in and out. The map shot may pull back once to reveal.
</direction>

<character>
Front-facing, friendly, built on a 222-unit grid with the feet at 0 (the example's drawing.hero is the reference):
- Head about a quarter of the height (radius 31), two dot eyes, a short mouth line, a tiny nose dot, faint blush. Skin one flat tone, never shaded.
- One silhouette feature kept in every shot: a bun, a beanie, a ponytail. Never two.
- A coat in the one hero colour (yellow raincoat, orange jacket, pink hoodie) that appears nowhere else in the frame, with a white reflective stripe or a hood and drawstrings; straight sleeves, round hands; dark trousers.
- 20–25% of frame height in a room (about 444 px of 1920), about 360 px outside.
- Motion is a breath (one unit) and a blink every ~4 s. Nothing else moves; props do the acting (a "?" over the head, a card).
- Crowds: the same face language, smaller, simpler, shirts in many colours; the infected with green skin, red eyes and arms out.
Save the hero once with save_element and place it by id in every shot.
</character>

<structure>
Hook (0–12 s): "If the [disaster] finds you [in this place]…", the place on its establishing shot, no HUD; a green-washed "you got lucky".
Breath: black, red eyes — "But only if you don't make one mistake."
Meet: the hero in their room with the name card, a routine of three ✓ chips, then the turn ("But tonight, everything changes" — red wash, a light dies).
The news: a radio or phone with a dispatch card typing the message.
The decision: the hero considers leaving, a "?" pops over the head; the crowd shot shows why not (red wash, "TOO DANGEROUS").
The advantage: the system shot (map or cross-section) with one rule ("ZOMBIES CAN'T CLIMB").
Supplies: shelves with highlighted items as they are named, then the supplies card.
Secure: a gate chained, a ladder pulled up.
The plan: the checklist card ticking "check." three times, then the room dims on "On paper…".
Cliffhanger: red eyes — "But [name] forgot one thing…", then "WHAT DID SHE FORGET? / TELL ME IN THE COMMENTS", then "THE [SERIES] / DAY 2 / FOLLOW FOR DAY 2".
</structure>

<build>
${SHARED_BUILD}
- Places are code layers drawn from t: flat walls and floor, one light source with a radial glow, props built from few right shapes. Save each place you return to (save_element "cabin", params for lit, alert, candle).
- HUD, pills, chips, cards and captions are overlays on every shot at fixed positions; only their contents change.
- Washes and the dim are full-frame layers whose opacity follows the line they belong to.
- Joins: a 0.2 s dissolve by default; a hard cut into and out of each breath shot.
</build>

<gotchas>
A tiny, faceless back-view figure: the reference hero faces you. One accented word instead of a whole coloured line. Captions chopped into three-word pieces. Grain, murk and dark pools hiding the picture. Captions over the picture instead of in the band. A shot cut on every line instead of holding several. The hero's coat colour used on a prop. A system shot drawn differently each time. A number from nowhere ("SHOT 3 / 24"); DAY 1 · 10:47 PM is a story fact and is fine.
</gotchas>

${BRIEF_FOOTER}`,
}

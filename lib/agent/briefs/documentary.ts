import type { Brief } from "./types"
import { BRIEF_FOOTER, SHARED_BUILD } from "./shared"

/**
 * Documentary — a true story told chapter by chapter in warm, dark line art.
 * The look measured on the long-form "biggest IPO" explainer; the characters and the seven beats
 * learned from the "true story" shorts (big-head stick cutouts, faces swapped on the line).
 * Reference implementation: prototype/style-documentary.html.
 */
export const documentary: Brief = {
  id: "documentary",
  name: "Documentary",
  summary: "A true story told in warm, dark line art, chapter by chapter: history, money, how it happened.",
  when: 'A real story: "the story of…", how a company was born, a crazy true event, money and history told with numbers, as a vertical short.',
  formats: ["9:16"],
  length: "40 to 90 s.",
  character:
    "Big-head stick cutouts: a white round head (a third of the height), stick limbs, a small suit, one accessory each; the face does all the acting and swaps on the line.",
  elements: ["counter", "chip", "stamp"],
  tools: ["get_project", "get_guide", "save_script", "save_storyboard", "add_scene", "add_layer", "update_layer", "save_element", "list_elements", "get_element_code", "save_generated_audio", "render_frames"],
  body: `<inputs>
The story and its sources: real names, dates and numbers, each one checkable. Ask for any you don't have; never invent one, and say "about" or "over" where a figure is rounded. Real people are named only with what is publicly reported about them, and treated with respect.
</inputs>

<direction>
0. Layout, 1080×1920: the floor line at y 1400; the glowing object in the upper half (y 300–1000); the characters standing on the floor in the lower half; the chapter label top-left (64, 110); captions at 82% (y 1580) in the dark floor band.
1. Warm dark interiors in line art: wood panelling (#24160D to #2E1D11), columns, arched windows onto a night city; every shape outlined in dark brown #1A100A at 3–6 px. One glowing hero object per shot — a lit calendar, a phosphor screen, a flip board, a chart, a spotlight — carries the light; everything else falls into shadow.
2. Finish on every frame: a heavy vignette and fine film grain, both computed from t (seeded by the frame, never random).
3. A chapter label top-left in spaced caps (Patrick Hand 36 px, letter-spacing 5 px, cream at 85%): "THE OFFER", "BUT", "WHAT HAPPENED NEXT". It changes per chapter.
4. Data looks like objects from the period: a flip board whose digits roll then land, a green phosphor chart (#0F2A1C board, #46E07A line with a glow) that draws itself while its value counts up, a forum post typing on an old monitor, a calendar page. The payoff number gets a spotlight and a big glowing figure.
5. Captions: one or two words at a time, big (Patrick Hand 112 px), centred at y 1580, white with a heavy black outline, popping in; the key word in amber #F2B860.
6. Joins: a 0.35 s dissolve; a slow 2.5% push per shot, alternating in and out.
</direction>

<character>
Big-head stick cutouts, built around the feet (x, ground), h = standing height:
- Head a white circle (#FBF8F2) with radius 0.17h, outlined; no skin tone, no shading. The outline does the work.
- Stick legs and arms (black lines ~0.016h), small black oval feet, round white hands. A small suit (a tapered body in one colour) with a white collar triangle and a tie.
- One accessory says who it is, kept in every shot: glasses, a backwards cap, a moustache, a side-parted hair cap, a visor. Never two people with the same one.
- The face does the acting, from very few marks — eyebrow angle carries the emotion: grin (closed happy arcs, a wide mouth full of teeth), shock (big white eyes, raised brows, a small "o"), smug (half-lids, a side smirk), worried (brows up in the middle, a wavy mouth, a sweat drop), shrug (one brow up, a flat mouth), neutral (dots and a small curve).
- Arms are a fixed shape per pose: down, point, cheer (both up), shrug, hold, keys.
- Faces and arms SWAP on the line that calls for them, never morph. A blink every ~4 s; nothing else moves.
- Stand them about a third of frame height (600–640 px of 1920) on the floor at y 1400; a shopkeeper or a rival smaller (about 440 px) behind a counter.
Save each person once (save_element with face and arm params) and place them by id.
</character>

<structure>
The seven beats of a true story:
1. Hook: a real name, a date and the stakes ("In 2010, a programmer named Laszlo made the priciest food order in history").
2. The problem: what was in the way ("Back then, bitcoin bought nothing").
3. How it worked: one prop explained step by step (the forum post, the offer, the deal).
4. "But": the turn, its own chapter.
5. The payoff number on screen, counted up, then the maths in a spotlight.
6. The consequence: what changed because of it (a law, a holiday, a no-regrets quote).
7. End on a real object: the thing itself, still there ("And his forum post is still online today") with a stamp, the chapter "WHAT DO YOU THINK?".
</structure>

<build>
${SHARED_BUILD}
- The room is one saved element (params: panels, windows, light position); each glowing object is its own element.
- Counters, flip boards and charts compute their values from t; a chart's line and its number move together.
- The finishing pass (grain + vignette) is the top layer of every scene.
</build>

<gotchas>
A number nobody can check, or one invented to sound dramatic. A character with a shaded, realistic face (the cutout is the style). Two accessories on one person, or one changing between shots. A face that morphs instead of swapping. Captions as a long line at the bottom (one or two words, big). Flat, evenly lit rooms with no glowing object. Grain that flickers randomly between renders (seed it from the frame).
</gotchas>

${BRIEF_FOOTER}`,
}

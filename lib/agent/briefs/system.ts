import type { Brief } from "./types"
import { BRIEF_FOOTER, SHARED_BUILD } from "./shared"

/**
 * System — a place or system seen whole and built up in front of you.
 * Measured on the space explainer. Reference implementation: prototype/style-system.html.
 */
export const system: Brief = {
  id: "system",
  name: "System",
  summary: "A place or system built piece by piece, with a counter that moves: how-it-works explainers.",
  when: 'How something works or what would happen: "if the sun vanished", how the space station orbits, how a request moves through a stack, a process explained by building it.',
  formats: ["9:16"],
  length: "30 to 60 s.",
  character:
    "No hero. The system is the hero; at most one small mascot (≤10% of frame height) for scale and warmth, floating, never acting.",
  elements: ["counter", "chip"],
  tools: ["get_project", "get_guide", "save_script", "save_storyboard", "add_scene", "add_layer", "update_layer", "save_element", "list_elements", "get_element_code", "save_generated_audio", "render_frames"],
  body: `<inputs>
The question and its real answer, with its real numbers from a source (an orbit takes about 92 minutes, the light takes 8 minutes 20 seconds). Ask for any number you don't have; never invent one. The one accent colour (warm orange #FFB547 on space, the brand's colour on a stack).
</inputs>

<direction>
1. One soft cartoon world the whole video: a deep radial background (#16294F to #0A1129) with twinkling stars, or the stack's own page. Objects are flat shapes with one soft gradient each and a glow where light comes from.
2. Hero objects drawn properly, not as blobs: a planet from real rough coastlines projected onto the sphere (continents green, deserts sand, poles ice), clouds, a soft terminator, city lights on the night side, an atmosphere glow; a sun with corona rings; a station with a truss and solar wings. Whatever the system is, its parts are recognisable at a glance.
3. Layout, 1080×1920: the counter top-centre (y 200), the system in the middle 60% (planet centre about y 960–1240), captions at 83% (y 1595). The hero object is big: a planet 500–1200 px across, filling the lower frame on the hook.
   The HUD is a big rounded counter (Nunito 900 at 120 px, white) with a small cyan caps line under it (#7FD3FF, letter-spaced): "46:13 / UNTIL THE NEXT SUNRISE". The counter is a story fact and it moves in sync with what you see (it hits zero as the station reaches the sun).
4. Labels pin to objects with a dashed leader and a rounded pill in the accent ("28,000 KM/H" riding on the station). Arcs mark spans ("DAY · ~45 MIN" in the accent on the lit side, "NIGHT" in cyan on the dark side).
5. Captions: Nunito 800 at 64 px, white with a dark outline, the key word in the accent; one line, or two balanced rows past 940 px. Pills sit in the open space above the object, never off the frame's edge. The payoff line becomes a big lockup in the top third instead ("16 sunrises / one alarm clock").
6. Build order is the story: the whole first, then one part per line, each arriving on the word that names it. One dashed orbit or path, one thing travelling along it.
7. Camera: holds, or a slow push; the motion is the system's own (rotation, orbit, a counter). The hook may start close and later pull back to the whole.
</direction>

<character>
No hero: the system is the subject. When the subject is for people, one mascot gives scale and warmth:
- Small (≤10% of frame height), cute and simple: a round helmet with a dark visor and one highlight, a white suit, one orange patch. Floating with a slow tilt; never talking, never pointing.
- If people are needed in a scene (a crew asleep), draw them in the same soft rounded style as the objects — flat colours, closed-eye arcs, no outlines.
</character>

<structure>
Hook (0–6 s): the system up close, the surprising fact stated ("Right now, 400 km above you, astronauts are watching the Sun come up").
The whole: pull back to the system, the counter appears and starts moving.
One part per line: each new piece or label lands on its word.
The count: the number made visible (16 suns filling a row while the counter rolls to 16).
The human side: what it means for a person (a sleep cabin with no window, one clock: GMT).
Payoff (held 2 s): the big lockup over the whole system.
</structure>

<build>
${SHARED_BUILD}
- Each object is a saved element with params (planet: rotation, sun side; station: angle on its orbit). Draw it from t only: rotation and orbit position are functions of t.
- The counter is a code layer computing its value from t; never a sequence of text layers.
- An object behind another on an orbit is drawn before it (split the orbit into back and front halves).
</build>

<gotchas>
Continents as round blobs. A counter that jumps or isn't tied to what's on screen. A number nobody gave you. Arrows instead of objects. A label floating free instead of pinned with a leader. A character acting the story here (that is Story Scene). Text over 3% too small to read. Everything arriving at once instead of one piece per line.
</gotchas>

${BRIEF_FOOTER}`,
}

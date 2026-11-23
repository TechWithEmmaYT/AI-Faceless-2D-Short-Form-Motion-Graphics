import type { Brief } from "./types"
import { BRIEF_FOOTER, SHARED_BUILD } from "./shared"

/**
 * Presenter — a host tells you something: tools, tips, a list.
 * Measured on the "7 free tools" reel. Reference implementation: prototype/style-presenter.html.
 */
export const presenter: Brief = {
  id: "presenter",
  name: "Presenter",
  summary: "A drawn host at the bottom, cards building above: tutorials, tool roundups, tips.",
  when: 'Someone tells the viewer something: "5 tools that…", a tutorial, a how-to, a list of tips, a product walkthrough.',
  formats: ["9:16"],
  length: "30 to 60 s; a list item every 5 to 7 s.",
  character:
    "A comic-line host cropped at the chest, locked bottom-centre at ~35% of frame height, thick dark outline, dotted halftone halo, a pose set swapped on the beat.",
  elements: ["terminal", "stamp", "counter"],
  tools: ["get_project", "get_guide", "save_script", "save_storyboard", "add_scene", "add_layer", "update_layer", "save_element", "list_elements", "get_element_code", "save_generated_audio", "render_frames"],
  body: `<inputs>
The topic or the script, and the real things it names (tools, repos, commands) with their own words. The host's look if the user has one; otherwise design one host and keep them. One red accent (#C8322A).
</inputs>

<direction>
1. The page is cream #ECE9E3 with a faint 40 px grid, the whole video. No dark scenes. Depth comes from halftone dotted shadows under cards, never from backgrounds.
2. Top-left a mono chip naming the section (JetBrains Mono 28 px, grey): "// 03 · claude code". Top-right a counter, grey label and red number: "TOOL 1/5", "TOOLS 5". Both always on; the counter advances.
3. The headline under them is the caption: Inter 600 at 66 px, the key word in Instrument Serif italic, red, slightly bigger. Words reveal as spoken: upcoming words faint (#C9C5BE), spoken words black. One headline per line.
4. A lockup per beat: Anton at up to 168 px, the first word black, the second red with a hand-drawn red underline that draws on. Long lockups shrink to fit 940 px; they never clip.
5. One hero card per beat, centred under the lockup, white with a 3 px dark border and a halftone shadow offset down-right: a terminal that types its command with a block cursor, a code card, a waveform, a frame grid that fills, a file card, a row of tool pills.
6. A red rank badge (#1, #2) pins to the card's corner in a list. One or two red rotated stamps in the whole video ("NO EDITOR", "100% CODE"), slammed in.
7. Pace: a hard swap between beats (no dissolve); the page never moves, so there is no camera.
</direction>

<character>
A comic host, front-facing, cropped at the chest — never full body:
- Head and shoulders fill the bottom ~35% of the frame (top of the head about 1250 of 1920); bottom-centre, always.
- Comic line: every shape filled flat and outlined in #1A1A1A at 6–8 px. Big white eyes with dark pupils and a glint, eyebrows, a nose line, an open smile with teeth, blush. One hair shape (a bob, a fringe) and one detail (earrings, glasses).
- A hoodie in one strong colour (navy #2E4A7A) with drawstrings.
- A dotted halftone halo around the whole silhouette (the silhouette grown by ~24 px, filled with a 12 px dot pattern), which is what makes it look printed.
- A pose set, not a rig: wave, point up, open palms, thumbs up, think (finger to chin), smile (eyes closed happy). Swap the pose on the line; never tween between poses. A breath and a blink only.
Save the host once (save_element "host" with a pose param) and place it in every scene.
</character>

<structure>
Hook (0–4 s): the promise as a lockup ("NO EDITOR") over a card showing the result, the host waving; a stamp on the second line.
Count: "Five tools." — the lockup "5 TOOLS", a card of tool pills popping in one by one.
One beat per item: "One: Claude Code." — chip and counter advance, the lockup names it, the badge pins, the card shows it working (a command typing, a result appearing), the pose changes on each line.
Payoff: the result as a card ("One prompt in. One MP4 out.").
End (2–3 s): "Follow for the full build." — a red follow pill, the host waving.
</structure>

<build>
${SHARED_BUILD}
- One scene per beat, joined with a hard swap. The chip, counter, headline, lockup, card, stamp and host are layers at fixed positions; only their contents change.
- Cards are code layers with params (kind, lines, from) so every card in the video matches. A terminal types from t at ~34 characters a second.
- Words on cards are the real thing's own: its command, its repo name, its button text. Never an invented star count or feature.
</build>

<gotchas>
A host that moves between poses (swap, never tween). A pose held across three beats. A dark scene. A second accent colour. A lockup that overflows the frame. A screenshot pasted where a drawn card belongs. A counter that doesn't advance. Captions as well as the headline (the headline is the caption). More than two stamps.
</gotchas>

${BRIEF_FOOTER}`,
}

/** get_guide({ topic: "storyboard" }) — the shot list the user approves before anything is built. */
export const storyboardTopic = `# The storyboard

A storyboard is a **shot list, not drawings**: what each shot is, which lines it carries, and what lands in it. The user approves it before any voice or scene exists — a wrong storyboard costs one edit, a wrong video costs a rebuild.

## One shot
\`\`\`json
{ "id": "meet", "place": "Maya's apartment, night, city in the window",
  "lines": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "hud": "DAY 1 · 9:14 PM · 14TH FLOOR",
  "cards": [ { "kind": "name", "text": "MAYA · 24 / NIGHT-SHIFT NURSE", "from": 1, "to": 4 },
             { "kind": "chips", "items": ["SHOES", "CHARGER", "KETTLE"], "from": 6 } ],
  "moves": "the city lights die window by window on line 9; the lamp goes out",
  "join": "dissolve" }
\`\`\`
- **place**: where we are, in a few words. A place used twice is one saved element.
- **lines**: which script lines this shot carries. A shot holds several lines (4–12 s); the world moves inside it — never a new shot per line.
- **cards / labels / chips**: what lands, on which line.
- **moves**: what changes inside the shot.
- **join**: how it meets the next one (the brief's default, a cut into a breath shot).

## Show it like this
A numbered list, one line per shot: \`3 · meet — Maya's apartment — lines 1–11 — name card, 3 chips — lights die on line 9\`. Ask: "Approve the storyboard, or change something?" save_storyboard only after a yes.

## Checks before you show it
- Every line belongs to exactly one shot, in order.
- No two neighbouring shots share the same place and framing.
- The style's recurring shot (the map, the system, the room) is there.
- 8 to 12 shots for 60–90 s.`

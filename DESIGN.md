# Design System: MotionStudio
**Project ID:** Not linked to a Stitch project. Synthesised from the reference screens in `_design/`: `home-screen.jpg`, `create-screen.jpg`, `scene-tab-editor.jpg`, `voice-tab-editor.jpg`, `claude-mcp.jpg`, `claude-mcp-2.png`.

> Scope: this file describes the **studio UI**: the app chrome, panels, cards and controls. It does **not** describe the look of the videos. That lives in each motion style's brief in `lib/agent/briefs/`, and the preview canvas shows whatever the video draws. The colours and type below must never leak into rendered video frames, and the video's colours must never leak into the chrome.

## 1. Visual Theme & Atmosphere

MotionStudio feels like a **bright, calm production studio with one sunny highlight**. The atmosphere is *airy, tidy and quietly confident*: a near-white page, white panels drawn with hairline grey outlines, near-black type, and a single **warm sunflower yellow** that marks whatever is selected, active or approved. The interface steps back so the 9:16 preview, with its bold, colourful motion graphics, is the loudest thing on screen.

The density is **comfortable but not loose**. Panels have generous inner padding and short, plain labels, and each screen has one obvious primary action, drawn as a solid near-black button. The UI should read as a *control room you watch*, not an editor you work in: Claude Code does the editing, so read-only status and progress (badges, durations, "Voiceover Ready") matter more than editing controls.

Recurring signature details give the system its identity:
- A **short vertical yellow bar** before every section heading ("Prompt / Script", "2D Motion Style", "Preview", "Recents", "MCP Command").
- **Yellow underlines** on the active tab, and a yellow edge on the active sidebar item.
- A **faint dotted grid** behind the preview canvas, like a design tool's artboard.
- **Pale-yellow status pills** with a small yellow dot ("Connected", "Voiceover Ready").

## 2. Color Palette & Roles

**Neutrals: the canvas of the studio**
- **Soft Paper White (#FAFAFA):** the page background behind every panel, and the sidebar's resting tone. It separates white surfaces from the page without needing shadows.
- **Pure Surface White (#FFFFFF):** cards, panels, the sidebar, the editor's left column, inputs and outline buttons.
- **Hairline Mist Grey (#E5E7EB):** every border: panel outlines, card strokes, input strokes, dividers, the sidebar's right edge, and the editor's split line.
- **Quiet Cloud Grey (#F3F4F6):** hover fills, the active sidebar item's background, unselected duration chips, the backing for the preview's dot grid, and placeholder thumbnails.
- **Dot Grid Grey (#E5E7EB at ~70%):** the 1px dots, spaced about 16px apart, on the preview stage.

**Ink: text and primary actions**
- **Studio Ink Black (#111111):** primary buttons ("Create Project", "Export", "Copy for Claude Code", "Get API Key"), the dark code/command block, and the play-button circles in the Voice tab. It is the one heavy neutral; use it for exactly one main action per region.
- **Headline Charcoal (#111827):** headings, project titles, card titles and body text.
- **Slate Secondary (#6B7280):** descriptions under titles, helper text ("Authenticate with /mcp in Claude Code…"), timestamps, character counters ("99/1000"), and inactive tab labels.
- **Faint Slate (#9CA3AF):** placeholder text, disabled icons, drag-handle dots, and the "Saved" indicator.

**Accent: the single highlight**
- **Sunflower Yellow (#FACC15):** the brand accent. Use it for the logo tile, section-heading bars, active-tab underlines, the active sidebar marker, selected duration chips, the selected style card's border, the selected scene card's border, the scrubber's progress fill and handle, the "Reconnect" button, the "Describe idea" toggle when active, and the status dots. Text on yellow is always Studio Ink Black, never white.
- **Buttercream Tint (#FEF9C3):** the selected style card's fill, the backing of status pills ("Voiceover Ready", "Connected", "Motion Style: …"), and the Claude Code connection banner. It is the accent at a whisper.
- **Honey Border (#FDE68A):** the outline of buttercream pills and of the connection banner.
- **Amber Ink (#854D0E):** text inside buttercream pills, so the pills pass contrast without turning loud.

**Code: commands and prompts**
- **Terminal Night (#1F2937):** the background of command blocks (`claude mcp add …`) when shown as a dark block.
- **Terminal Cream (#FDE68A):** monospace command text on Terminal Night, a warm echo of the accent.
- **Light code well (#F9FAFB with a #E5E7EB border):** the alternative, lighter command field used in the Voice tab and the compact Claude Code layout, with Headline Charcoal monospace text.

**Feedback**
- **Signal Red (#DC2626):** destructive actions only: Disconnect, Regenerate key, Delete project, and render errors. Shown as red text or a pale red tint (#FEF2F2), never as a solid red button.
- **Success:** shown with the buttercream pill and a check icon, not a separate green, so the palette stays to one hue.

**Implementation mapping (shadcn variables in `app/globals.css`):**
- `--background` #FAFAFA · `--card` / `--popover` #FFFFFF · `--foreground` #111827
- `--primary` #111111 with `--primary-foreground` #FFFFFF
- `--secondary` / `--muted` / `--accent` #F3F4F6 · `--muted-foreground` #6B7280
- `--border` / `--input` #E5E7EB · `--ring` #FACC15
- a new `--brand` #FACC15 with `--brand-foreground` #111111 · `--brand-soft` #FEF9C3 · `--brand-border` #FDE68A
- `--destructive` #DC2626
- **Light first, dark optional.** Light is the default. Users switch theme (Light / Dark / System) from the user dropdown at the foot of the sidebar; the choice persists per browser.

**Dark mode: the same roles at night**
- **Night Page (#0E0F12)** replaces Soft Paper White. **Night Surface (#16181D)** replaces Pure Surface White for cards and panels; popovers sit a step lighter (#1B1E24). The sidebar is #121418.
- **Night Hairline (#2A2E36)** replaces Hairline Mist Grey for every border; inputs use #2F333C.
- **Text:** #F3F4F6 for content, #9CA3AF for secondary text, #6B7280 for faint text.
- **The primary action inverts:** near-white (#F5F5F5) with ink text (#111111), so the one solid button still reads as the loudest control.
- **Sunflower Yellow (#FACC15) does not change.** Text on yellow is still ink, including the highlighter word. The buttercream pill becomes a dark amber (#2B2410 fill, #5B4A12 border, #FDE68A text).
- **The preview canvas never changes with the theme.** Video frames are drawn by the style briefs, not the UI tokens.

## 3. Typography Rules

- **Interface family: Inter.** A clean, neutral sans-serif for everything except code. Its plain shapes let the colourful preview carry the personality.
- **Code family: JetBrains Mono.** Only for literal things the user copies or reads as machine text: MCP commands, API keys (masked), file names such as `hook-voiceover.mp3`, and ids. Never use it for headings or labels.

**Hierarchy:**
- **Hero headline** (Home banner, "Build faceless 2D motion shorts from a prompt"): Inter **ExtraBold (800)**, about 44–48px, tight leading (1.05) and slightly negative tracking (−0.02em). One key phrase sits on a **yellow highlighter block** ("motion") that is slightly rounded and padded, like a marker stroke behind the word.
- **Page title** ("Create Project", the project name in the editor header): Inter **Bold (700)**, 28–32px for page titles and 20px for the editor header title. A one-line Slate Secondary subtitle at 14px sits beneath.
- **Section heading** ("Prompt / Script", "2D Motion Style", "Recents", "Generated Audio"): Inter **Bold (700)**, 18–20px, always preceded by the 4×20px yellow bar with a 10px gap. Sub-labels such as "MCP Command" or "Project Brief" use **Semibold (600)** at 15–16px with the same bar, smaller.
- **Card title** ("Story Scene", "01 · Hook — Build Smarter with AI"): Inter **Semibold (600)**, 15–17px, in Headline Charcoal.
- **Body and descriptions:** Inter **Regular (400)**, 14px, line height 1.5, in Slate Secondary for supporting text and Headline Charcoal for content the user wrote (their prompt, the script).
- **Buttons and tabs:** Inter **Medium (500)**, 14–15px. Primary buttons may use Semibold.
- **Meta and pills** (durations, "2h ago", counters, badge text): Inter **Medium (500)**, 12–13px.
- **Numbers that change** (timecodes "00:02 / 00:15", durations "0:05"): Inter with **tabular figures** (`font-variant-numeric: tabular-nums`) so they don't jitter while playing.

Letter-spacing is neutral everywhere except the hero (tighter). Never use all caps in the UI chrome; all-caps belongs to the video styles, not the studio.

## 4. Component Stylings

* **Buttons:**
  * *Primary:* solid Studio Ink Black, white Inter Medium label, an optional leading icon (plus, sparkle, upload, clipboard), **generously rounded corners (10–12px)**, 40–48px tall. Sidebar "+ Create Project" and the full-width "Copy for Claude Code" are the tallest at 48–52px. Hover lightens the fill to about 85%; pressed, it nudges down 1px.
  * *Outline / secondary:* Pure Surface White fill, a Hairline Mist Grey 1px stroke, Charcoal label, the same rounding ("Add Scene", "Paste script", "Disconnect", "9:16 Portrait"). Hover fills with Quiet Cloud Grey.
  * *Accent:* a Sunflower Yellow fill with an Ink label. Use it sparingly, only for the active state of a segmented toggle ("Describe idea") or a positive recovery action ("Reconnect").
  * *Icon buttons:* 36–40px square, outline style (back arrow in a **circle**, undo/redo pair as a joined group, copy, delete). Icons are lucide, 18–20px, 1.75px stroke.
  * *Pill chips* (duration 30s / 45s / 1m): **pill-shaped**, 32px tall, Quiet Cloud Grey fill when idle, Sunflower Yellow fill with Ink text when selected.
* **Cards/Containers:**
  * *Panels* (the "Prompt / Script" panel, the "2D Motion Style" panel, the "Preview" panel, the editor sections): Pure Surface White, a Hairline Mist Grey 1px border, **softly rounded corners (12–16px)**, 20–24px inner padding. Depth comes from the border; shadows are **whisper-soft or absent** (at most `0 1px 2px rgba(17,24,39,0.04)`).
  * *Style cards* (Home row and Create grid): white, a 1px grey border, 12px corners, an illustration in a 10px-rounded inset frame. On Home the art sits right of the title and description; on Create it sits on top. **Selected:** a 2px Sunflower Yellow border, a Buttercream Tint fill, and a small black circular check badge in the art's top-right corner.
  * *Scene cards:* white, 12px corners, with a 9:16 thumbnail (rounded 8px) on the left, the title "NN · Name — Subtitle", then a row of small outline meta pills (clock + duration, shuffle icon + transition) and a buttercream "Voiceover Ready" pill. **Selected:** a 2px Sunflower Yellow border plus a thicker 4px yellow edge on the left.
  * *Audio clip cards (Voice tab):* white, 12px corners, a 40px black circular play button, the file name in Semibold, the quoted line in Slate Secondary, and a compact waveform pill (grey bars, with the playhead in yellow and the duration inside) next to the voice name with a speaker icon. Copy and delete icons sit top-right in Faint Slate. Selected or playing: a yellow border.
  * *Recents tiles:* full-bleed 9:16-ish thumbnails with **12px corners**, a dark gradient at the bottom carrying a white Semibold title, and two frosted dark pills on top (play icon + duration on the left, eye/clock + relative time on the right) at about 60% black, 12px text.
  * *Hero banner (Home):* a wide white panel, 16px corners. The left side holds the headline and the primary CTA; a thin vertical divider separates a checklist of three items, each with a yellow circular check; the right side bleeds into a sweeping yellow shape and the hero illustration.
  * *Status pills:* **pill-shaped**, Buttercream Tint fill, a Honey Border stroke, Amber Ink 12–13px Medium text, and a 6px Sunflower Yellow dot before the label ("Status: Connected", "Connected").
  * *Connection banner* (Claude Code tab): a full-width Buttercream Tint strip, Honey Border, 12px corners, a yellow dot, a bold title with a one-line description, and outline "Disconnect" plus yellow "Reconnect" buttons on the right.
  * *Command blocks:* either a **dark block** (Terminal Night, 10px corners, Terminal Cream JetBrains Mono at 14px, with a ghost "Copy" button and icon on the right) or a **light well** (#F9FAFB, a grey border, Charcoal mono text, with a separate square outline copy button). Commands are always one line and scroll sideways rather than wrap.
* **Inputs/Forms:**
  * *Text areas and fields:* Pure Surface White, a Hairline Mist Grey 1px stroke, 12px corners, 16px padding, 15px Inter Charcoal text, a character counter bottom-right in Faint Slate ("99/1000"). Focus: the stroke turns Sunflower Yellow with a soft 3px yellow ring at 30% opacity. No coloured backgrounds on inputs.
  * *Segmented toggle* ("Describe idea" / "Paste script"): two pill buttons side by side, the active one Sunflower Yellow with an icon, the inactive one outlined.
  * *Select / dropdown:* an outline pill-ish button (10px corners) with a chevron. The aspect selector is a **static "9:16 Portrait" label**, not a dropdown, because every video is 9:16.
  * *Read-only fields* (Project Brief in the editor): a light well (#F9FAFB) with a grey border and no focus state, plus an "Edit"-style outline button only where editing is actually allowed.
* **Navigation:**
  * *Sidebar:* 240px fixed, white, a hairline right border. At the top, the logo is a 40px Sunflower Yellow rounded tile with a black play glyph, beside "MotionStudio" in Bold 20px. Below it, the full-width black "+ Create Project" button, then the nav items (Home, Projects) at 44px tall with 20px outline icons. **Active item:** a Quiet Cloud Grey rounded fill with a 3px Sunflower Yellow bar on its left edge. At the bottom, the user row: a 36px avatar, name in Semibold, email in Slate 12px, and a chevron opening the account menu (account, **Theme** submenu, sign out). A small ghost **collapse** icon sits at the right end of the logo row. Collapsed, the sidebar becomes a 48px icon rail with tooltips, and an Expand icon sits under the logo tile. Built from shadcn `Sidebar` primitives (`collapsible="icon"`); below 640px it is a slide-out sheet.
  * *Editor tabs* ("Claude Code", "Scenes", "Voice"): an icon plus label, Medium 15px; inactive in Slate Secondary, active in Charcoal with a **3px Sunflower Yellow underline** the width of the tab. Thin vertical dividers between tabs; a hairline under the whole tab bar.
  * *Editor header:* a circular back button, the project title (Bold 20px), and a Faint Slate "Saved" note on the left; on the right, the static "9:16 Portrait" label and the black "Export" button with an upload icon. Undo/redo from the mock-ups is **not** built (Claude Code does the editing).
* **Preview stage:**
  * The right column sits on Soft Paper White with the **dotted grid**. The 9:16 canvas is centred with 16px rounded corners and a soft, wide shadow (`0 12px 32px rgba(17,24,39,0.10)`). This is the only noticeable shadow in the app, because it is the "artboard".
  * *Player bar:* a floating white pill-shaped bar under the canvas with a hairline border. It holds play/pause, the tabular timecode "00:02 / 00:15", a slim scrubber (grey track, yellow progress and a round yellow handle), a volume icon and a fullscreen icon. An optional zoom pill ("− 100% +") may float bottom-right.

## 5. Layout Principles

- **Desktop studio layout.** A 240px sidebar on the left; the content area fills the rest on Soft Paper White. The editor is built for desktop (1280px and wider) and is not a mobile layout.
- **Home:** a top row of four equal style cards (a four-column grid, 16px gaps); a full-width hero banner; then "Recents" with a "See all →" link on the right and a single row of five equal tiles. Sections are spaced 24–32px apart.
- **Create Project:** a two-column split. The left column (about 62%) stacks the "Prompt / Script" panel, the "2D Motion Style" panel (a four-column card grid) and a slim Fish Audio note strip. The right column (about 38%) is a sticky "Preview" panel with the 9:16 sample and a full-width primary "Create Project" button at its foot.
- **Editor:** a fixed header across the top with a hairline below it, then a **two-column split**:
  * the left work column (about 55–60%): white, holding the tab bar, then scrolling content with 24px side padding, and a **sticky footer** for the main action on the Claude Code tab ("Copy for Claude Code")
  * the right preview column (about 40–45%): the dotted stage with the canvas centred vertically and the player bar beneath
* **Spacing rhythm:** a 4px base, mostly multiples of 8: 8px inside pills, 12–16px between related items, 20–24px inside panels, 24–32px between sections. Cards in a list sit 12–16px apart.
* **Alignment:** headings align with panel content on a single left edge. Meta pills sit on one baseline under card titles. Right-aligned actions (copy, delete, drag handle, status pill) align to the panel's inner right padding.
* **One primary action per region.** Each panel or page has at most one solid black button; everything else is outline, ghost or a pill. Yellow marks *state* (selected, active, ready), not *action*, except for the rare accent button.
* **Hierarchy through outline and spacing, not shadow.** Separate layers with Hairline Mist Grey borders and the gap between Soft Paper White and Pure Surface White. Keep shadows to the preview artboard and floating menus.
* **Empty and waiting states** use `components/ui/empty`: a soft grey icon, a Charcoal one-line title ("Waiting for Claude Code"), a Slate one-line hint, and at most one action. They sit centred in the panel with generous padding, so a project that hasn't started still looks calm and intentional.

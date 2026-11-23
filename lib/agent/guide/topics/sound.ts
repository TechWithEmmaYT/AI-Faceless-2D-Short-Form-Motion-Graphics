/** get_guide({ topic: "sound" }) — the voice first; sounds only from the story. */
export const soundTopic = `# Sound

The voice is the soundtrack. Everything else is optional, rare and quiet.

## Story sounds — only when the script names one
"Her phone buzzes" → a buzz. "Someone knocks" → a knock. "The tap runs dry" → a sputter. If the line names no sound, there is none.
- **One real recorded sound** per moment, never a synthesised beep.
- **On its frame**: the sound starts where the picture shows the thing (the phone shakes, the door jolts). A sound off its frame is worse than none.
- **Quiet**: 0.2 to 0.4, always under the voice.
- **A handful per video**, not one per card. Most shots have none.

## Where to find them, in this order
1. The user's own files.
2. Fish Audio's free sound library: search_sound_effects ("phone ring", "door knock") — each result has an audio_url.
3. Openverse, no key: \`https://api.openverse.org/v1/audio/?q=<words>&license_type=commercial\`.
Keep what you download in the workspace: \`~/motionstudio/<projectId>/sound/\` (\`music/\` for the bed). Note each sound you add in progress.md.
Then add_sound: kind "sfx", the sceneId, a short name, source (where it came from), and either url (a public https file; it's copied into the project) or publicId (a file you uploaded with get_upload_target, kind "sound"). at_sec is scene seconds, where the picture shows the thing. trim_start / trim_end keep only the moment inside the file. volume 0.2–0.4 (default 0.3).
To move it, change its volume or trim, or swap the file: update_sound with its sound id (get_project lists them). To drop it: remove_sound.
Never generate_sound_effect without asking: it charges credits.

## Music — only if the user asks
A real recorded track (Openverse or Pixabay Music, downloaded, never hotlinked, never generated in code), about 0.045 under the voice, a 2 s fade in and a 3 s fade out.
add_sound kind "music" with no sceneId; at_sec is video seconds (usually 0); volume 0.01–0.1 (default 0.045). One music bed per project: to change it use update_sound, to drop it remove_sound.

## Never
Risers. Whooshes. Hits, slams or pops on cards and cuts. A sound on every card. A sound with no cause on screen. Calling the sound good — you cannot hear it: give the user five timecodes to check by ear.`

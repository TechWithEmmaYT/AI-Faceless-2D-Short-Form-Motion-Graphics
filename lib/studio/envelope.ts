/**
 * A sound's loudness factor at `local` seconds into a part that plays for `length` seconds:
 * 0→1 over the first `fadeIn` seconds, 1→0 over the last `fadeOut`. Shared by the preview
 * (use-studio-audio) and the export mix (audio-mix), so both fade identically.
 */
export function envelope(local: number, length: number, fadeIn: number, fadeOut: number) {
  const inK = fadeIn > 0 ? Math.min(1, local / fadeIn) : 1;
  const outK = fadeOut > 0 ? Math.min(1, (length - local) / fadeOut) : 1;
  return Math.max(0, Math.min(inK, outK));
}

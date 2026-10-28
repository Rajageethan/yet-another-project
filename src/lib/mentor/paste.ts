/** Start of every paste event message; also identifies paste events stored before they carried meta. */
export const PASTE_EVENT_PREFIX = "The student pasted";

export function pasteEventContent(lines: number) {
  return `${PASTE_EVENT_PREFIX} ${lines} lines of code into the editor at once.`;
}

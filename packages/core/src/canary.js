// Per-session text canary. Embeds a session id into a string as invisible
// zero-width characters, so if the copy is recovered (e.g. the decoy font is
// inverted) and republished, the leaked text can be traced to the session that
// received it. Isomorphic (used by the Worker when building a session payload).
//
// Scheme: a marker (U+2060 ×2), then 32 bits of the id as ZWSP(0)/ZWNJ(1), then
// the marker again, inserted after the first character. Decoy-font encoding passes
// these codepoints through unchanged, and they render with zero width.

const Z0 = "​"; // ZERO WIDTH SPACE  -> bit 0
const Z1 = "‌"; // ZERO WIDTH NON-JOINER -> bit 1
const MARK = "⁠⁠"; // WORD JOINER ×2 -> delimiter
const ZERO_WIDTH = /[​‌⁠]/g;

export function embedTextCanary(text, sid) {
  const bits = [];
  for (let i = 31; i >= 0; i--) bits.push((sid >>> i) & 1);
  const payload = MARK + bits.map((b) => (b ? Z1 : Z0)).join("") + MARK;
  if (!text) return payload;
  // Insert after the first code point so it survives leading-trim and is not at the very edge.
  const first = [...text][0];
  return first + payload + text.slice(first.length);
}

/** @returns {number|null} the embedded session id, or null if none found. */
export function extractTextCanary(text) {
  const m = text.match(/⁠⁠([​‌]{32})⁠⁠/);
  if (!m) return null;
  let sid = 0;
  for (const ch of m[1]) sid = (sid << 1) | (ch === Z1 ? 1 : 0);
  return sid >>> 0;
}

/** Remove any canary/zero-width marks (for displaying recovered text cleanly). */
export const stripCanary = (text) => text.replace(ZERO_WIDTH, "");

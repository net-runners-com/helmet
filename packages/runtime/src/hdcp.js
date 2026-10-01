// HDCP output-protection detection. Uses EME's getStatusForPolicy to ask whether
// the display link is trusted at a given HDCP version — WITHOUT a license server or
// any media playback. It cannot force a black screenshot (only DRM-protected video
// decoded in a secure path does that); what it can do is let you refuse to reveal
// content when the output path is untrusted (e.g. a capture card / mirrored display).
//
//   import { checkHdcp, installHdcpGate } from "@helmet/runtime";
//   const status = await checkHdcp({ minHdcpVersion: "2.2" });  // "usable" | "output-restricted" | ...
//
// Status values (MediaKeyStatus): "usable" = HDCP at/above the version is active;
// "output-restricted"/"output-downscaled" = link not trusted at that level;
// "unknown" = the browser/CDM doesn't support the check.

const CONFIG = [{
  initDataTypes: ["cenc", "keyids", "webm"],
  videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: "" }],
}];

async function getMediaKeys() {
  if (!navigator.requestMediaKeySystemAccess) return null;
  for (const ks of ["com.widevine.alpha", "com.microsoft.playready.recommendation", "org.w3.clearkey"]) {
    try {
      const access = await navigator.requestMediaKeySystemAccess(ks, CONFIG);
      const mk = await access.createMediaKeys();
      if (typeof mk.getStatusForPolicy === "function") return mk;
    } catch { /* try next key system */ }
  }
  return null;
}

/** @returns {Promise<"usable"|"output-restricted"|"output-downscaled"|"unknown"|string>} */
export async function checkHdcp({ minHdcpVersion = "2.2" } = {}) {
  try {
    const mk = await getMediaKeys();
    if (!mk) return "unknown";
    return await mk.getStatusForPolicy({ minHdcpVersion });
  } catch {
    return "unknown";
  }
}

/**
 * Hide/blur a target while the output path is untrusted at the given HDCP version,
 * re-checking when the page becomes visible again (e.g. display changed). Returns a
 * stop() function. When the check is unsupported ("unknown"), the default is to
 * REVEAL (fail-open) so real users aren't locked out; pass hideOnUnknown:true to
 * fail-closed instead.
 */
export function installHdcpGate(target, { minHdcpVersion = "2.2", hideOnUnknown = false, onChange, revealOnTrusted = true } = {}) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return () => {};
  const prevFilter = el.style.filter;
  let stopped = false;

  const apply = (status) => {
    const trusted = status === "usable" || (status === "unknown" && !hideOnUnknown);
    el.style.filter = trusted ? (revealOnTrusted ? prevFilter : el.style.filter) : "blur(14px)";
    el.style.pointerEvents = trusted ? "" : "none";
    el.setAttribute("data-hdcp", status);
    onChange?.(status, trusted);
  };

  const run = async () => { if (!stopped) apply(await checkHdcp({ minHdcpVersion })); };
  run();
  const onVis = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { stopped = true; document.removeEventListener("visibilitychange", onVis); el.style.filter = prevFilter; };
}

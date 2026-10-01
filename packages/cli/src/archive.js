// Evidence preservation via the Internet Archive's Wayback Machine. Capture your
// own site and a suspected clone (plus any supporting pages) into a timestamped,
// third-party snapshot BEFORE the copy is changed or taken down — the dated capture
// is independent evidence of what each site looked like and when. Pure fetch.
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bare = (u) => u.replace(/^https?:\/\//, "");
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function triggerSave(url) {
  // Anonymous Save Page Now is async; this kicks off the capture.
  try { await fetch(`https://web.archive.org/save/${url}`, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(90000) }); } catch {}
}

// Most recent snapshot (closest to now). Returns { timestamp, status, snapshot } or null.
async function latestSnapshot(url) {
  try {
    const r = await fetch(`https://archive.org/wayback/available?url=${bare(url)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const c = (await r.json())?.archived_snapshots?.closest;
    return c ? { timestamp: c.timestamp, status: c.status, snapshot: c.url.replace(/^http:/, "https:") } : null;
  } catch { return null; }
}

/**
 * Archive each URL (Save Page Now) and confirm the snapshot.
 * @param {object} o
 * @param {string[]} o.urls
 * @param {boolean} [o.checkOnly]  only look up the latest snapshot, don't save
 * @param {(line:string)=>void} [o.log]
 * @returns {Promise<Array<{url,status,timestamp?,snapshot?}>>}
 */
export async function archive({ urls, checkOnly = false, log = () => {} }) {
  const out = [];
  for (const url of urls) {
    if (checkOnly) {
      const s = await latestSnapshot(url);
      out.push({ url, archived: !!s, ...(s || {}) });
      log(s ? `  ${url}\n    latest: ${s.timestamp} -> ${s.snapshot}` : `  ${url}\n    (no snapshot yet)`);
      continue;
    }
    log(`  saving: ${url}`);
    await triggerSave(url);
    // SPN is async; poll until a snapshot captured today appears.
    let s = null;
    for (let i = 0; i < 5; i++) {
      await sleep(6000);
      const cur = await latestSnapshot(url);
      if (cur && cur.timestamp.startsWith(today())) { s = cur; break; }
    }
    if (s) { out.push({ url, archived: true, ...s }); log(`    archived: ${s.timestamp} -> ${s.snapshot}`); }
    else { out.push({ url, archived: false, status: "queued" }); log(`    queued (capture is processing; re-check with: helmet archive --check ${url})`); }
    await sleep(2000);
  }
  return out;
}

export function readUrlList(file) {
  return readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
}

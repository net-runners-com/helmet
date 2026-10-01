// Clone / copycat hunter. Runs a keyword list through open web search (DuckDuckGo
// HTML) and note.com, collects candidate sites (excluding big players and your own
// domain), and — with --verify — fetches each candidate and checks it for your
// site's verbatim copy and CSS-module fingerprints, so a rebuilt-but-copied clone
// still scores. Pure fetch, no browser. Social platforms (X / Threads / Instagram)
// need a login and are out of scope here.
import { readFileSync, writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// Big tools, aggregators, infra and social — never clone candidates.
const DENY = /canva\.com|(^|\.)line\.me$|line-scdn|line-sticker|lycorp|my-best\.com|apps\.apple\.com|play\.google|filmora|wondershare|hitpaw|kddi\.com|youtube|amazon|rakuten|google\.|duckduckgo|bing\.com|yahoo\.|wikipedia|adobe\.com|note\.com|pinterest|instagram\.com|facebook|twitter|x\.com|tiktok|microsoft|mozilla|w3\.org|gstatic|cloudflare|jsdelivr/i;

const host = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, timeout = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, redirect: "follow", signal: ac.signal });
    return r.ok ? await r.text() : "";
  } catch { return ""; } finally { clearTimeout(t); }
}

async function ddgSearch(kw) {
  const t = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(kw)}&kl=jp-jp`);
  const out = [];
  for (const m of t.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let href = m[1];
    const um = href.match(/[?&]uddg=([^&]+)/);
    if (um) { try { href = decodeURIComponent(um[1]); } catch {} }
    if (/duckduckgo\.com\/y\.js|ad_domain=/.test(href)) continue; // ads
    out.push({ url: href, title: m[2].replace(/<[^>]+>/g, "").trim().slice(0, 90) });
  }
  return out;
}

async function noteSearch(kw) {
  const t = await getText(`https://note.com/api/v3/searches?context=note&q=${encodeURIComponent(kw.replace(/^#/, ""))}&size=10`, 15000);
  let j; try { j = JSON.parse(t); } catch { return []; }
  const notes = j?.data?.notes?.contents || j?.data?.notes || [];
  return notes.slice(0, 10).map((n) => {
    const user = n?.user?.urlname || "";
    const key = n?.key;
    return { user, title: (n?.name || "").slice(0, 80), url: user && key ? `https://note.com/${user}/n/${key}` : "" };
  });
}

// Distinctive copy + CSS-module fingerprints from your own site, used to verify a
// candidate is actually a copy (not just a same-niche competitor).
export function targetProfile(html) {
  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : ""; };
  const name = pick(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i) || pick(/<title>([^<]+)/i);
  const phrases = new Set();
  const desc = pick(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  if (desc) phrases.add(desc);
  const alt = pick(/<meta[^>]*property="og:image:alt"[^>]*content="([^"]+)"/i);
  if (alt) phrases.add(alt);
  for (const m of html.matchAll(/<h[1-3][^>]*>([^<]{8,80})<\/h[1-3]>/gi)) phrases.add(m[1].trim());
  const fingerprints = [...new Set([...html.matchAll(/([A-Za-z][A-Za-z0-9]+_[A-Za-z0-9]+__[A-Za-z0-9_]{4,})/g)].map((m) => m[1]))].slice(0, 8);
  return { name, phrases: [...phrases].filter((p) => p.length >= 8), fingerprints };
}

function keywordsFromProfile(prof, domain) {
  const kws = new Set();
  if (prof.name) { kws.add(prof.name); kws.add(prof.name.replace(/\s+/g, "")); }
  for (const p of prof.phrases) kws.add(p);
  if (domain) kws.add(domain.split(".")[0]);
  return [...kws];
}

export async function huntKeywords({ target, out }) {
  const html = await getText(target);
  if (!html) throw new Error("could not fetch target " + target);
  const prof = targetProfile(html);
  const kws = keywordsFromProfile(prof, host(target));
  const body = "# auto-generated clone-hunt keywords for " + target + "\n" + kws.join("\n") + "\n";
  if (out) writeFileSync(out, body);
  return { keywords: kws, profile: prof };
}

export async function hunt({ keywordsFile, target, phrasesFile, exclude = [], out, verify, limit = 40 }) {
  const keywords = readFileSync(keywordsFile, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  const own = target ? host(target) : "";
  const excl = new RegExp([...exclude, own].filter(Boolean).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "\\u0000", "i");

  // Verification needles: explicit --phrases ∪ auto-extracted from --target.
  let needles = [];
  let fingerprints = [];
  if (phrasesFile) needles = readFileSync(phrasesFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  if (verify && target) {
    const prof = targetProfile(await getText(target));
    needles = [...new Set([...needles, ...prof.phrases])];
    fingerprints = prof.fingerprints;
  }

  const hits = {};
  const noteHits = [];
  for (const kw of keywords) {
    for (const r of await ddgSearch(kw)) {
      const h = host(r.url);
      if (!h || DENY.test(h) || excl.test(h)) continue;
      (hits[h] ??= { keywords: new Set(), urls: new Set() });
      hits[h].keywords.add(kw);
      hits[h].urls.add(r.url);
    }
    for (const n of await noteSearch(kw)) if (n.url) noteHits.push({ kw, ...n });
    await sleep(250); // be polite
  }

  let ranked = Object.entries(hits).map(([domain, v]) => ({ domain, keywords: [...v.keywords], urls: [...v.urls].slice(0, 3), score: v.keywords.size, verbatim: [], fingerprint: false }));
  ranked.sort((a, b) => b.score - a.score);

  if (verify && (needles.length || fingerprints.length)) {
    for (const c of ranked.slice(0, limit)) {
      const html = await getText("https://" + c.domain + "/");
      if (!html) continue;
      c.verbatim = needles.filter((p) => html.includes(p)).slice(0, 5);
      c.fingerprint = fingerprints.some((f) => html.includes(f));
      c.score += c.verbatim.length * 10 + (c.fingerprint ? 50 : 0);
      await sleep(150);
    }
    ranked.sort((a, b) => b.score - a.score);
  }

  const result = { target: target || null, web: ranked, note: dedupeNotes(noteHits) };
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  return result;
}

function dedupeNotes(list) {
  const seen = new Set();
  return list.filter((n) => (seen.has(n.url) ? false : seen.add(n.url)));
}

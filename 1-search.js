// 1-search.js — finding the pages, and reading them.
//
// WHY THIS DOES NOT USE GEMINI TO SEARCH ANY MORE
// Gemini's Google Search grounding looked like the neat answer — one key, no extra
// service. In practice it is closed on the free tier: grounding works only on the 2.5
// family, and those models are now retired; grounding on the 3.x models is paid-only and
// returns "you exceeded your current quota" on a key that has never been used. Three
// attempts to work around that all failed for the same underlying reason.
//
// So searching and reading are now separate from the model:
//   1. a real search API finds the pages           (Brave or Google, both free tiers)
//   2. this fetches those pages and strips the text
//   3. an ordinary Gemini call reads the reviews out of the text — no grounding, which
//      works fine on the free tier
//
// With no search key at all it still works on SEED_URLS: pages you already know about.
const { BUSINESS, PLACES, GROUPS, SETTINGS } = require("./config");

const KEY = () => SETTINGS.GEMINI_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- search providers
async function braveSearch(q, count = 8) {
  const key = process.env.BRAVE_KEY;
  if (!key) return { error: "no BRAVE_KEY" };
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`,
    { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (!res.ok) return { error: `Brave ${res.status}: ${(await res.text()).slice(0, 120)}` };
  const d = await res.json();
  return { results: (d.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description || "" })) };
}

async function googleCse(q, count = 8) {
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return { error: "no GOOGLE_CSE_KEY / GOOGLE_CSE_ID" };
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${Math.min(count, 10)}`);
  if (!res.ok) return { error: `Google CSE ${res.status}: ${(await res.text()).slice(0, 120)}` };
  const d = await res.json();
  return { results: (d.items || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || "" })) };
}

// whichever is configured; reports plainly when neither is
async function search(q) {
  if (process.env.BRAVE_KEY) return { via: "Brave", ...(await braveSearch(q)) };
  if (process.env.GOOGLE_CSE_KEY) return { via: "Google", ...(await googleCse(q)) };
  return { error: "no search key configured (BRAVE_KEY or GOOGLE_CSE_KEY)" };
}
const searchProvider = () =>
  process.env.BRAVE_KEY ? "Brave Search" : process.env.GOOGLE_CSE_KEY ? "Google Custom Search" : null;

// ---------------------------------------------------------------- reading a page
async function readPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HOF-review-radar/1.0)", Accept: "text/html" },
      redirect: "follow", signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { url, error: `${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ").trim();
    return { url, text };
  } catch (e) { return { url, error: e.message }; }
}

// ---------------------------------------------------------------- the model, no grounding
let MODEL = null;
async function pickModel(log = () => {}) {
  if (MODEL) return MODEL;
  const order = [SETTINGS.ANALYSE_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.0-flash"];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY()}&pageSize=200`);
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || `${res.status}`);
    const usable = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => !/embedding|aqa|imagen|veo|tts/i.test(n));
    for (const want of order) {
      const hit = usable.find((n) => n === want) || usable.find((n) => n.startsWith(want));
      if (hit) { MODEL = hit; log(`  model: ${hit}`); return MODEL; }
    }
    MODEL = usable.find((n) => /flash/i.test(n)) || usable[0];
    log(`  model: ${MODEL}`);
    return MODEL;
  } catch (e) { log(`  could not list models (${e.message}); using ${order[1]}`); MODEL = order[1]; return MODEL; }
}

async function ask(prompt, attempt = 0) {
  if (!KEY()) return { error: "no API key" };
  const model = await pickModel();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY()}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
    });
    const d = await res.json();
    if (!res.ok) {
      const msg = d?.error?.message || `${res.status}`;
      if ((res.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) && attempt < SETTINGS.RETRIES) {
        await sleep(SETTINGS.RETRY_WAIT_MS * (attempt + 1));
        return ask(prompt, attempt + 1);
      }
      return { error: msg };
    }
    const t = (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("\n");
    const m = t.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { error: "no readable answer" };
  } catch (e) { return { error: e.message }; }
}

// ---------------------------------------------------------------- one group
const namesLine = () => BUSINESS.aliases.map((a) => `"${a}"`).join(" OR ");

async function findAt(group) {
  const members = PLACES.filter((p) => group.places.includes(p.id));
  const pages = [];
  const searched = [];

  // pages you already named always get read, so this works with no search key at all
  for (const u of (SETTINGS.SEED_URLS || [])) {
    if (members.some((m) => (u.place || "").toLowerCase() === m.id)) pages.push({ url: u.url, seed: true });
  }

  if (searchProvider()) {
    for (const m of members) {
      const q = `${namesLine()} ${BUSINESS.locations[0]} reviews ${m.query || m.label}`;
      const r = await search(q);
      searched.push({ query: q, via: r.via, error: r.error, n: (r.results || []).length });
      for (const hit of (r.results || []).slice(0, SETTINGS.PAGES_PER_SITE)) {
        if (!pages.some((p) => p.url === hit.url)) pages.push({ ...hit, place: m.label });
      }
    }
  }

  if (!pages.length) {
    const why = searchProvider()
      ? `nothing found for ${group.label}`
      : `no search key set, and no seed URLs for ${group.label}`;
    return { place: group, found: false, note: why, searched };
  }

  // read the pages, then have the model pull the reviews out of the text
  const read = [];
  for (const p of pages.slice(0, SETTINGS.PAGES_PER_GROUP)) {
    const r = await readPage(p.url);
    if (r.text && r.text.length > 400) read.push({ url: p.url, place: p.place || "", text: r.text.slice(0, 9000) });
  }
  if (!read.length) return { place: group, found: false, note: "the pages found could not be read", searched };

  const blob = read.map((r, i) => `--- PAGE ${i + 1} (${r.url}) ---\n${r.text}`).join("\n\n").slice(0, 26000);
  const parsed = await ask(`These are pages that may contain customer reviews of an immigration consultancy called ${BUSINESS.name} (also known as ${BUSINESS.aliases.join(", ")}).

Pull out ONLY genuine reviews or first-hand accounts written by clients or staff. Ignore the company's own marketing, navigation text, adverts, and reviews that are clearly about a different business.

If a page has no real review content, ignore it. Do not invent examples.

${blob}

Reply ONLY JSON:
{"found": true|false,
 "reviews": [
  {"rating":"<1-5 or empty>","when":"<when written, or empty>",
   "text":"<what they said, max 60 words>","sentiment":"positive"|"negative"|"mixed",
   "site":"<which site, e.g. Google, Trustpilot, Reddit>","url":"<the page>"}
 ],
 "note":"<anything about coverage, max 20 words>"}`);

  if (parsed.error) return { place: group, error: parsed.error, searched, pagesRead: read.length };
  return { place: group, ...parsed, searched, pagesRead: read.length };
}

module.exports = { findAt, search, searchProvider, readPage, pickModel, ask };

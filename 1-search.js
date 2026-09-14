// 1-search.js — finds the reviews.
//
// Uses Gemini with Google Search grounding, so there is no second service to pay for or
// maintain, and every answer comes back with the pages it came from. Each place is
// searched separately: a business with 200 Google reviews and 3 on Trustpilot should not
// have Trustpilot buried, because a bad Trustpilot page is what a prospect often sees.
const { BUSINESS, PLACES, GROUPS, SETTINGS } = require("./config");
const KEY = () => SETTINGS.GEMINI_KEY;

// Model names get retired — gemini-2.5-flash vanished and every search failed with
// "no longer available". So rather than hardcoding one, the API is asked which models
// exist and which support search grounding, and the best available is used. The result
// is cached for the run.
let PICKED = null;
async function pickModel(log = console.log) {
  if (PICKED) return PICKED;
  const preferred = [SETTINGS.SEARCH_MODEL, "gemini-flash-latest", "gemini-pro-latest",
                     "gemini-2.0-flash", "gemini-flash-lite-latest"];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY()}&pageSize=200`);
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || `${res.status}`);
    const usable = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => !/embedding|aqa|imagen|veo|tts/i.test(n));

    // the first preference that actually exists
    for (const want of preferred) {
      const hit = usable.find((n) => n === want) || usable.find((n) => n.startsWith(want));
      if (hit) { PICKED = hit; log(`  using model: ${hit}`); return PICKED; }
    }
    // otherwise any flash model, then anything at all
    PICKED = usable.find((n) => /flash/i.test(n)) || usable[0];
    if (PICKED) { log(`  no preferred model available, using: ${PICKED}`); return PICKED; }
    throw new Error("the key has no usable models");
  } catch (e) {
    log(`  could not list models (${e.message}); falling back to ${preferred[1]}`);
    PICKED = preferred[1];
    return PICKED;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grounded(prompt, model, attempt = 0) {
  if (!KEY()) return { error: "no API key" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY()}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message || `${res.status}` };
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text).filter(Boolean).join("\n");
    // the pages the answer was actually grounded in
    const sources = (cand?.groundingMetadata?.groundingChunks || [])
      .map((c) => c.web?.uri && { title: c.web.title || c.web.uri, url: c.web.uri })
      .filter(Boolean);
    return { text, sources };
  } catch (e) { return { error: e.message }; }
}

const namesLine = () => BUSINESS.aliases.map((a) => `"${a}"`).join(", ");

async function findAt(group) {
  const model = await pickModel();
  const members = PLACES.filter((p) => group.places.includes(p.id));
  const where = members.map((p) => `${p.label} (${p.hint})`).join("; ");

  const prompt = `Search the public web for customer reviews and complaints about an immigration consultancy.

Business names to search for: ${namesLine()}
Locations: ${BUSINESS.locations.join(", ")}
Where to look: ${where}

Find ACTUAL reviews or first-hand accounts written by clients or staff. Do not include the company's own marketing, its website copy, press releases, or directory listings with no review text.

For each review found, give:
- the rating if one is shown (out of 5)
- roughly when it was written, if shown
- what the person actually said, in their words where possible
- the page it is on

If you find nothing real at this place, say so plainly rather than inventing examples.

Reply ONLY JSON:
{"found": true|false,
 "overallRating": "<the average shown on that site, or empty>",
 "reviewCount": "<the total shown on that site, or empty>",
 "reviews": [
   {"rating": "<1-5 or empty>", "when": "<e.g. 2 months ago, or empty>",
    "text": "<what they said, max 60 words>", "sentiment": "positive"|"negative"|"mixed",
    "url": "<the page>"}
 ],
 "note": "<anything important about coverage, max 20 words>"}`;

  let r = await grounded(prompt, model);
  // some models reject the search tool rather than the request; try the next one before
  // reporting the whole place as unsearchable
  if (r.error && /tool|google_search|not supported|INVALID_ARGUMENT/i.test(r.error)) {
    PICKED = null;
    const alt = await pickModel(() => {});
    if (alt && alt !== model) r = await grounded(prompt, alt);
  }
  if (r.error) return { place: group, error: r.error, quota: r.quota };
  const m = String(r.text || "").match(/\{[\s\S]*\}/);
  if (!m) return { place: group, error: "no readable answer", raw: String(r.text || "").slice(0, 200) };
  try {
    const parsed = JSON.parse(m[0]);
    return { place: group, ...parsed, sources: r.sources || [] };
  } catch (e) { return { place: group, error: `could not parse the answer: ${e.message}` }; }
}

module.exports = { findAt, grounded, pickModel };

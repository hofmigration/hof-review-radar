// 1-search.js — finds the reviews.
//
// Uses Gemini with Google Search grounding, so there is no second service to pay for or
// maintain, and every answer comes back with the pages it came from. Each place is
// searched separately: a business with 200 Google reviews and 3 on Trustpilot should not
// have Trustpilot buried, because a bad Trustpilot page is what a prospect often sees.
const { BUSINESS, SETTINGS } = require("./config");

async function grounded(prompt, model) {
  if (!process.env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_KEY}`, {
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

async function findAt(place) {
  const prompt = `Search the public web for customer reviews and complaints about an immigration consultancy.

Business names to search for: ${namesLine()}
Locations: ${BUSINESS.locations.join(", ")}
Where to look: ${place.hint}

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

  const r = await grounded(prompt, SETTINGS.SEARCH_MODEL);
  if (r.error) return { place, error: r.error };
  const m = String(r.text || "").match(/\{[\s\S]*\}/);
  if (!m) return { place, error: "no readable answer", raw: String(r.text || "").slice(0, 200) };
  try {
    const parsed = JSON.parse(m[0]);
    return { place, ...parsed, sources: r.sources || [] };
  } catch (e) { return { place, error: `could not parse the answer: ${e.message}` }; }
}

module.exports = { findAt, grounded };

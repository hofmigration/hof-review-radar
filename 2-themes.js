// 2-themes.js — turns a pile of reviews into the factors behind them.
//
// The question is not "what is our rating" — that is on the sites already. It is WHAT
// people praise and WHAT they complain about, because only the second kind is fixable.
// So every theme carries a count, real quotes, and where it was said.
const { BUSINESS, SETTINGS } = require("./config");

async function ask(prompt, model) {
  if (!process.env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
    });
    const d = await res.json();
    if (!res.ok) return { error: d?.error?.message || `${res.status}` };
    const t = (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("\n");
    const m = t.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { error: "no readable answer" };
  } catch (e) { return { error: e.message }; }
}

function collect(results) {
  const reviews = [];
  for (const r of results) {
    if (!r || r.error || !Array.isArray(r.reviews)) continue;
    for (const rev of r.reviews) {
      if (!rev || !rev.text) continue;
      reviews.push({ ...rev, place: r.place.label, placeId: r.place.id });
    }
  }
  return reviews;
}

async function findThemes(reviews) {
  if (!reviews.length) return { error: "no reviews to analyse" };

  const block = reviews.map((r, i) =>
    `${i + 1}. [${r.place}] [${r.sentiment || "?"}] ${r.rating ? `${r.rating}/5 ` : ""}${r.when ? `(${r.when}) ` : ""}${r.text}`
  ).join("\n");

  const prompt = `You are analysing customer reviews of ${BUSINESS.name}, an ${BUSINESS.sector}. Work out WHY people are happy and WHY people are unhappy, so the business knows what to keep doing and what to fix.

Group the reviews into FACTORS — the specific thing being praised or criticised, not a vague label. "The consultant explained the process clearly" is a factor. "Good service" is not.

A factor needs at least ${SETTINGS.MIN_REVIEWS_FOR_THEME} reviews mentioning it. Anything mentioned once goes in "oneOffs" instead, because a single voice is not a pattern.

Be even-handed. Do not soften the negatives or pad the positives. If most reviews are positive, say so; if the negatives cluster around one thing, say that plainly.

REVIEWS:
${block.slice(0, 24000)}

Reply ONLY JSON:
{
 "summary": "<what the reviews say overall, 2 sentences, honest>",
 "positive": [
   {"factor": "<the specific thing praised, max 8 words>",
    "count": <how many reviews>,
    "why": "<what people actually say about it, 1 sentence>",
    "quotes": ["<up to ${SETTINGS.QUOTES_PER_THEME} short real quotes>"],
    "places": ["<which sites>"]}
 ],
 "negative": [
   {"factor": "<the specific thing criticised, max 8 words>",
    "count": <how many reviews>,
    "why": "<what people actually say, 1 sentence>",
    "quotes": ["<up to ${SETTINGS.QUOTES_PER_THEME} short real quotes>"],
    "places": ["<which sites>"],
    "fixable": "<the one change that would most reduce this complaint, 1 sentence>"}
 ],
 "oneOffs": ["<single mentions worth knowing, max 6>"],
 "watchFor": "<the thing most likely to become a bigger problem, 1 sentence>"
}`;

  return ask(prompt, SETTINGS.ANALYSE_MODEL);
}

// counts by sentiment and by place, straight from the data rather than from the AI
function tally(reviews) {
  const bySentiment = { positive: 0, negative: 0, mixed: 0, unknown: 0 };
  const byPlace = {};
  let rated = 0, ratingSum = 0;
  for (const r of reviews) {
    const s = String(r.sentiment || "").toLowerCase();
    bySentiment[["positive","negative","mixed"].includes(s) ? s : "unknown"]++;
    byPlace[r.place] = (byPlace[r.place] || 0) + 1;
    const n = parseFloat(r.rating);
    if (Number.isFinite(n) && n >= 1 && n <= 5) { rated++; ratingSum += n; }
  }
  return { total: reviews.length, bySentiment, byPlace,
    averageRating: rated ? +(ratingSum / rated).toFixed(2) : null, rated };
}

module.exports = { collect, findThemes, tally };

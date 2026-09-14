// radar.js — the run.
//
// Searches each place for reviews of the business, works out WHY people are happy and
// WHY they are unhappy, and emails it. Read-only: nothing is posted or replied to.
const { BUSINESS, PLACES, SETTINGS } = require("./config");
const { findAt } = require("./1-search");
const { collect, findThemes, tally } = require("./2-themes");
const { buildReport, sendReport } = require("./3-report");

async function main() {
  console.log(`=== Review radar — ${BUSINESS.name} — ${new Date().toISOString()} ===  DRY_RUN=${SETTINGS.DRY_RUN}`);
  if (!process.env.GEMINI_KEY) { console.log(`!! No GEMINI_KEY — nothing can be searched. Add the secret.`); process.exit(1); }
  if (!process.env.RESEND_KEY) console.log(`!! No RESEND_KEY — the report cannot be emailed.`);
  console.log(`Report goes to: ${SETTINGS.REPORT_TO}`);
  console.log(SETTINGS.DRY_RUN ? `DRY RUN: the report is written to the artifact, not emailed.` : `LIVE: the report will be emailed.`);

  const places = SETTINGS.MAX_PLACES ? PLACES.slice(0, SETTINGS.MAX_PLACES) : PLACES;
  console.log(`\nSearching ${places.length} places...`);

  const results = [];
  for (const place of places) {
    const r = await findAt(place);
    results.push(r);
    if (r.error) console.log(`  ?  ${place.label.padEnd(22)} ${r.error}`);
    else if (r.found === false) console.log(`  -  ${place.label.padEnd(22)} nothing found${r.note ? ` (${r.note})` : ""}`);
    else console.log(`  ok ${place.label.padEnd(22)} ${(r.reviews || []).length} review(s)${r.overallRating ? `, rated ${r.overallRating}` : ""}${r.reviewCount ? ` of ${r.reviewCount} shown` : ""}`);
  }

  const reviews = collect(results);
  const counts = tally(reviews);
  console.log(`\n${counts.total} review(s) collected | positive ${counts.bySentiment.positive} · negative ${counts.bySentiment.negative} · mixed ${counts.bySentiment.mixed}`);
  if (counts.averageRating !== null) console.log(`Average of the ${counts.rated} rated reviews: ${counts.averageRating}`);

  let themes = {};
  if (reviews.length) {
    console.log(`\nWorking out the factors...`);
    themes = await findThemes(reviews);
    if (themes.error) console.log(`  could not analyse: ${themes.error}`);
  } else {
    console.log(`\nNo reviews found, so there is nothing to analyse. The report will say so rather than inventing themes.`);
  }

  if (themes.summary) console.log(`\nIN SHORT: ${themes.summary}`);
  for (const [label, list] of [["WHY PEOPLE ARE UNHAPPY", themes.negative], ["WHY PEOPLE ARE HAPPY", themes.positive]]) {
    if (!(list || []).length) continue;
    console.log(`\n${label}:`);
    for (const f of list) {
      console.log(`  ${String(f.count).padStart(3)}x  ${f.factor}`);
      console.log(`        ${f.why}`);
      if (f.fixable) console.log(`        FIX: ${f.fixable}`);
    }
  }
  if (themes.watchFor) console.log(`\nWATCH: ${themes.watchFor}`);

  const html = buildReport({ themes, counts, results, dryRun: SETTINGS.DRY_RUN });
  require("fs").writeFileSync("review-radar.html", html);
  console.log(`\nWrote review-radar.html (download it from this run's Artifacts).`);

  if (SETTINGS.DRY_RUN) { console.log(`DRY RUN: not emailed.`); return; }
  const neg = (themes.negative || []).length;
  const ok = await sendReport(
    neg ? `Reviews — ${neg} thing(s) people complain about` : `Reviews — ${counts.total} read, no repeated complaints`, html);
  if (ok) console.log(`Sent to ${SETTINGS.REPORT_TO}`);
  else { console.log(`\n!! THE REPORT WAS NOT SENT. The findings are above and in the artifact.`); process.exitCode = 1; }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });

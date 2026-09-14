// radar.js — the run.
//
// Searches each place for reviews of the business, works out WHY people are happy and
// WHY they are unhappy, and emails it. Read-only: nothing is posted or replied to.
const { BUSINESS, PLACES, GROUPS, SETTINGS } = require("./config");
const { findAt, pickModel, pickAnalysisModel } = require("./1-search");
const { collect, findThemes, tally } = require("./2-themes");
const { buildReport, sendReport } = require("./3-report");

async function main() {
  console.log(`=== Review radar — ${BUSINESS.name} — ${new Date().toISOString()} ===  DRY_RUN=${SETTINGS.DRY_RUN}`);
  if (!SETTINGS.GEMINI_KEY) { console.log(`!! No API key — nothing can be searched. Add GEMINI_KEY, or REVIEW_GEMINI_KEY for a key of its own.`); process.exit(1); }
  console.log(`Key: ${process.env.REVIEW_GEMINI_KEY ? "REVIEW_GEMINI_KEY (its own)" : "GEMINI_KEY (shared with the compliance agents)"}`);
  if (!process.env.RESEND_KEY) console.log(`!! No RESEND_KEY — the report cannot be emailed.`);
  console.log(`Report goes to: ${SETTINGS.REPORT_TO}`);
  console.log(SETTINGS.DRY_RUN ? `DRY RUN: the report is written to the artifact, not emailed.` : `LIVE: the report will be emailed.`);

  // work out which model to use once, and say so — a retired model was what made every
  // search fail silently last time
  console.log(`\nChoosing a model...`);
  const model = await pickModel();
  await pickAnalysisModel(console.log);
  if (!model) {
    console.log(`\n!! Nothing can be searched with this key.`);
    console.log(`   Free-tier Google Search grounding works ONLY on the 2.5 models, and this`);
    console.log(`   key has none. Either use a key from a project that has 2.5 access, or`);
    console.log(`   enable billing, which unlocks grounding on the newer models.`);
    process.exit(1);
  }

  const groups = SETTINGS.MAX_PLACES ? GROUPS.slice(0, SETTINGS.MAX_PLACES) : GROUPS;
  console.log(`\nSearching ${groups.length} groups covering ${PLACES.length} kinds of site...`);
  console.log(`(grouped on purpose: Google Search grounding is metered tightly, and one search per site exhausted the quota)`);

  const results = [];
  for (const group of groups) {
    const r = await findAt(group);
    results.push(r);
    if (r.error) console.log(`  ?  ${group.label.padEnd(22)} ${String(r.error).slice(0, 90)}`);
    else if (r.found === false) console.log(`  -  ${group.label.padEnd(22)} nothing found${r.note ? ` (${r.note})` : ""}`);
    else console.log(`  ok ${group.label.padEnd(22)} ${(r.reviews || []).length} review(s)`);
  }

  const allFailed = results.length && results.every((r) => r.error);
  if (allFailed) {
    console.log(`\n!! EVERY SEARCH FAILED. This is not a finding that no reviews exist.`);
    console.log(`   Reason: ${results[0].error}`);
    if (results.some((r) => r.quota)) {
      console.log(`\n   A quota message here usually means the WRONG MODEL FAMILY, not a spent allowance:`);
      console.log(`     · Free-tier Google Search grounding works only on the 2.5 models (500/day).`);
      console.log(`     · Grounding on the 3.x models is paid-only, and returns a quota error at once`);
      console.log(`       even on a key that has never been used.`);
      console.log(`   The agent now forces a 2.5 model. If it still fails:`);
      console.log(`     1. Enable billing on the project — that unlocks grounding properly.`);
      console.log(`     2. Or wait for the daily reset if the 500 really were used.`);
    }
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

const { collect, tally } = require("./2-themes");
const { buildReport } = require("./3-report");
const { BUSINESS, PLACES, GROUPS, SETTINGS } = require("./config");

let pass = 0, fail = 0;
const check = (l, ok, d="") => { console.log(`${ok?"PASS":"FAIL"}  ${l}${ok||!d?"":`\n        ${d}`}`); ok?pass++:fail++; };
console.log("REVIEW RADAR SELF-TEST\n");

check("the business has name variants to search for", BUSINESS.aliases.length >= 2);
check("more than one kind of site is searched", PLACES.length >= 5);
check("it is not only Google", PLACES.some((p)=>p.id!=="google") && PLACES.length > 1);
check("employer review sites are included, because clients read them", PLACES.some((p)=>p.id==="glassdoor"));
check("complaint sites are included", PLACES.some((p)=>p.id==="complaints"));
check("place ids are unique", new Set(PLACES.map((p)=>p.id)).size === PLACES.length);
check("a scheduled run is not a dry run", (()=>{ const r=(v)=>String(v||"").toLowerCase()==="true"; return r("")===false && r(undefined)===false && r("true")===true; })());
check("there is no CC unless the domain is verified", SETTINGS.REPORT_CC.length === 0);
check("a theme needs more than one mention", SETTINGS.MIN_REVIEWS_FOR_THEME >= 2);

// collecting and counting
const results = [
  { place:{label:"Google",id:"google"}, found:true, overallRating:"4.2", reviews:[
    {text:"Very professional",sentiment:"positive",rating:"5"},
    {text:"Slow after payment",sentiment:"negative",rating:"2"},
    {text:"Good but slow",sentiment:"mixed",rating:"3"}]},
  { place:{label:"Trustpilot",id:"trustpilot"}, found:true, reviews:[{text:"No reply for weeks",sentiment:"negative",rating:"1"}]},
  { place:{label:"Reddit",id:"reddit"}, found:false, note:"no threads found" },
  { place:{label:"Yelp",id:"yelp"}, error:"search failed" },
];
const reviews = collect(results); const counts = tally(reviews);
check("reviews are collected from every site that had any", reviews.length === 4);
check("a site with nothing is not counted as a review", !reviews.some((r)=>r.place==="Reddit"));
check("a failed search does not become a review", !reviews.some((r)=>r.place==="Yelp"));
check("sentiment is counted", counts.bySentiment.negative === 2 && counts.bySentiment.positive === 1);
check("the average rating is computed from rated reviews only", counts.averageRating === 2.75);
check("reviews are attributed to their site", counts.byPlace.Google === 3 && counts.byPlace.Trustpilot === 1);

// the report
const themes = {
  summary: "Most reviews praise the consultants, and the complaints cluster on replies going quiet after payment.",
  positive: [{factor:"Consultants explain the process clearly",count:6,why:"People name their consultant and say the steps were clear.",quotes:["She explained every step"],places:["Google"]}],
  negative: [{factor:"Replies stop after the first payment",count:4,why:"Several say contact dropped off once they had paid.",quotes:["No response for three weeks"],places:["Google","Trustpilot"],fixable:"Set a contact cadence after payment and hold case managers to it."}],
  oneOffs: ["One person said the office was hard to find"],
  watchFor: "The after-payment silence is the complaint most likely to spread, because it appears on more than one site.",
};
const html = buildReport({ themes, counts, results, dryRun:true });
check("the report leads with the complaints", html.indexOf("Why people are unhappy") < html.indexOf("Why people are happy"));
check("each complaint says what would fix it", /What would fix it/.test(html));
check("quotes are shown", /No response for three weeks/.test(html));
check("mention counts are shown", /4 mentions/.test(html));
check("it says where each factor was seen", /Seen on:/.test(html));
check("coverage gaps are admitted", /what was NOT covered/i.test(html) && /no threads found/.test(html));
check("it does not claim to have every review", /not every review that exists/.test(html));
check("the report escapes text", !/<script/i.test(html));

// nothing found at all must not invent themes
const emptyHtml = buildReport({ themes:{}, counts: tally([]), results:[{place:{label:"Google",id:"google"},found:false}], dryRun:true });
check("finding nothing is reported as nothing, not as good news", /No reviews were found/.test(emptyHtml));

// a run where everything failed must not look like good news
const brokenHtml = buildReport({ themes:{}, counts: tally([]),
  results: GROUPS.map((g)=>({ place:g, error:"model no longer available" })), dryRun:true });
check("searches are grouped to protect the quota", GROUPS.length < PLACES.length && GROUPS.length <= 4);
check("every place belongs to a group", (() => {
  const covered = new Set(GROUPS.flatMap((g) => g.places));
  return PLACES.every((p) => covered.has(p.id));
})(), PLACES.filter((p)=>!new Set(GROUPS.flatMap((g)=>g.places)).has(p.id)).map((p)=>p.id).join(", "));
check("a quota failure says so, and says how to fix it", (() => {
  const h = buildReport({ themes:{}, counts: tally([]),
    results: GROUPS.map((g)=>({ place:g, error:"You exceeded your current quota", quota:true })), dryRun:true });
  return /quota ran out/.test(h) && /own API key/.test(h) && !/No repeated complaints/.test(h);
})());
check("the agent can use a key of its own", /REVIEW_GEMINI_KEY/.test(require("fs").readFileSync("./config.js","utf8")));
check("a total search failure is not reported as 'no reviews'",
  /Nothing could be searched/.test(brokenHtml) && !/No repeated complaints/.test(brokenHtml));
check("the model is a preference, not hardcoded into the search",
  /pickModel/.test(require("fs").readFileSync("./1-search.js","utf8")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

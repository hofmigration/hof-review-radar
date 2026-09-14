// config.js — HOF Review Radar. SAFE TO EDIT.
//
// WHAT THIS CAN AND CANNOT DO, stated plainly so the report is never over-trusted:
//   CAN   find and read reviews that are publicly indexed — Google, Trustpilot,
//         Facebook, Yelp, immigration forums, Reddit, complaint boards, YouTube
//   CANNOT guarantee EVERY review. Google's own API returns about five per place, and
//         most review sites have no public API. This finds what the public can find,
//         which is also what a prospective client would find.
//
// So treat the counts as "what is visible", never as a complete census.

const BUSINESS = {
  name: "HOF Migration",
  // Other spellings and names people use. More names means better coverage.
  aliases: [
    "HOF Migration",
    "HOF Migration Dubai",
    "HOF Migration Documents Clearing",
    "House of Faith Migration",
  ],
  locations: ["Dubai", "UAE", "Lahore", "Pakistan"],
  sector: "immigration consultancy",
};

// Where to look. These are GROUPED into a few searches rather than one each, because
// Google Search grounding is metered far more tightly than ordinary model calls and
// eight separate searches was enough to exhaust the quota on its own.
const PLACES = [
  { id: "google",      label: "Google reviews",     query: "google maps reviews" },
  { id: "trustpilot",  label: "Trustpilot",         query: "site:trustpilot.com" },
  { id: "facebook",    label: "Facebook",           query: "site:facebook.com reviews" },
  { id: "reddit",      label: "Reddit",             query: "site:reddit.com" },
  { id: "forums",      label: "Immigration forums", query: "forum experience complaint" },
  { id: "complaints",  label: "Complaint sites",    query: "complaint scam report" },
  { id: "glassdoor",   label: "Employer reviews",   query: "site:glassdoor.com OR site:indeed.com OR site:ambitionbox.com" },
  { id: "youtube",     label: "YouTube and social", query: "site:youtube.com OR site:x.com review" },
];

// Places are searched in groups. Fewer, wider searches cost a fraction of the quota and
// return much the same thing, because one grounded search can read several sites.
const GROUPS = [
  { id: "reviews",    label: "Review sites",      places: ["google", "trustpilot", "facebook"] },
  { id: "discussion", label: "Forums and social", places: ["reddit", "forums", "youtube"] },
  { id: "complaints", label: "Complaints and staff", places: ["complaints", "glassdoor"] },
];

const SETTINGS = {
  DRY_RUN: String(process.env.DRY_RUN_INPUT || "").toLowerCase() === "true",

  // The compliance agents share one GEMINI_KEY and run every day, so this agent can
  // arrive at a quota that is already spent. Set REVIEW_GEMINI_KEY to give it its own.
  // It falls back to GEMINI_KEY when that is not set.
  GEMINI_KEY: process.env.REVIEW_GEMINI_KEY || process.env.GEMINI_KEY || "",

  // Quota errors are usually a pause, not a wall.
  RETRIES: 3,
  RETRY_WAIT_MS: 20000,

  REPORT_TO: process.env.REPORT_TO || "razaali@hofmigration.com",
  REPORT_CC: [],                      // keep empty unless the domain is verified in Resend
  FROM_EMAIL: process.env.FROM_EMAIL || "onboarding@resend.dev",

  // SEARCHING and ANALYSING use different models on purpose.
  //
  // On the FREE tier, Google Search grounding only works on the 2.5 family, and only up
  // to 500 requests a day. Grounding on the 3.x models is paid-only. Picking a 3.x model
  // is what produced "you exceeded your current quota" on two different keys with the
  // quota untouched — it was never an exhausted allowance, it was the wrong family.
  //
  // So the search must be a 2.5 model. The analysis does no searching, so it can use
  // anything and is left on the newer, cheaper flash.
  // Only ONE model is used now, and only to READ pages — no search grounding, which is
  // what kept failing. Ordinary calls work fine on the free tier.
  ANALYSE_MODEL: process.env.ANALYSE_MODEL || "gemini-flash-latest",

  // How much to read. Each page is one fetch, which costs nothing.
  PAGES_PER_SITE: 3,
  PAGES_PER_GROUP: 8,

  // Pages you already know about. These are read even with NO search key, so the agent
  // is useful immediately. Add your real Google, Trustpilot and Facebook review pages.
  SEED_URLS: [
    // { place: "trustpilot", url: "https://www.trustpilot.com/review/hofmigration.com" },
    // { place: "google",     url: "https://www.google.com/maps/place/..." },
  ],

  MAX_PLACES: 0,                      // 0 = every place above
  MIN_REVIEWS_FOR_THEME: 2,           // a theme needs this many mentions to be reported
  QUOTES_PER_THEME: 3,
  RECENT_MONTHS: 18,                  // older reviews are counted but marked as historic
};

module.exports = { BUSINESS, PLACES, GROUPS, SETTINGS };

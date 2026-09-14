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
  { id: "google",      label: "Google reviews",        hint: "Google Maps and Google Business Profile reviews" },
  { id: "trustpilot",  label: "Trustpilot",            hint: "trustpilot.com" },
  { id: "facebook",    label: "Facebook",              hint: "facebook.com page reviews and recommendations" },
  { id: "reddit",      label: "Reddit",                hint: "reddit.com threads and comments" },
  { id: "forums",      label: "Immigration forums",    hint: "expat and immigration forums, Canadavisa, Pakistani and UAE expat forums" },
  { id: "complaints",  label: "Complaint sites",       hint: "complaint boards, scam-report sites, consumer forums" },
  { id: "glassdoor",   label: "Employer reviews",      hint: "Glassdoor, Indeed and AmbitionBox — staff reviews, which clients read too" },
  { id: "youtube",     label: "YouTube and social",    hint: "YouTube comments, TikTok, Instagram and X posts about the company" },
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
  SEARCH_MODEL: process.env.SEARCH_MODEL || "gemini-2.5-flash",
  SEARCH_MODEL_FAMILY: /2\.5/,      // free-tier grounding requires this
  ANALYSE_MODEL: process.env.ANALYSE_MODEL || "gemini-flash-latest",

  MAX_PLACES: 0,                      // 0 = every place above
  MIN_REVIEWS_FOR_THEME: 2,           // a theme needs this many mentions to be reported
  QUOTES_PER_THEME: 3,
  RECENT_MONTHS: 18,                  // older reviews are counted but marked as historic
};

module.exports = { BUSINESS, PLACES, GROUPS, SETTINGS };

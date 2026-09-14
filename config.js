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

// Where to look. Each becomes its own grounded search, so one weak site does not
// drown out the others.
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

const SETTINGS = {
  DRY_RUN: String(process.env.DRY_RUN_INPUT || "").toLowerCase() === "true",

  REPORT_TO: process.env.REPORT_TO || "razaali@hofmigration.com",
  REPORT_CC: [],                      // keep empty unless the domain is verified in Resend
  FROM_EMAIL: process.env.FROM_EMAIL || "onboarding@resend.dev",

  // A PREFERENCE, not a requirement. Model names get retired — gemini-2.5-flash was
  // withdrawn and every search failed — so the agent asks the API which models exist and
  // uses the best available. Leave this alone unless you have a reason.
  SEARCH_MODEL: process.env.SEARCH_MODEL || "gemini-flash-latest",
  ANALYSE_MODEL: process.env.ANALYSE_MODEL || "gemini-flash-latest",

  MAX_PLACES: 0,                      // 0 = every place above
  MIN_REVIEWS_FOR_THEME: 2,           // a theme needs this many mentions to be reported
  QUOTES_PER_THEME: 3,
  RECENT_MONTHS: 18,                  // older reviews are counted but marked as historic
};

module.exports = { BUSINESS, PLACES, SETTINGS };

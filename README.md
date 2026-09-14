# Review Radar

Finds what people say about HOF Migration across the public web, works out **why** they
are happy and **why** they are unhappy, and emails it monthly.

The point is not the star rating — the sites already show that. It is the **factors**:
the specific things being praised and criticised, because only the second kind is fixable.

---

## What it can and cannot do

**It finds what a prospective client would find.** Google, Trustpilot, Facebook, Reddit,
immigration forums, complaint boards, employer review sites and social posts.

**It cannot promise every review.** Google's own API returns about five per business, and
most review sites have no public feed. So the counts mean *"what is visible"*, never
*"how many exist"*. The report says this in its own coverage section rather than letting
the numbers imply more than they should.

**It never posts anything.** No replies, no reporting reviews, no engagement. Read-only.

## What the email says

A complaint appears as a card with the count, real quotes, where it was seen, and the one
change that would most reduce it:

> **Replies stop after the first payment** — 4 mentions
> Several say contact dropped off once they had paid.
> *"No response for three weeks"*
> **What would fix it:** Set a contact cadence after payment and hold case managers to it.

Complaints come **first**, then what people praise, then anything worth watching, then
single mentions — kept separate, because one voice is not a pattern.

## Why employer reviews are included

Glassdoor, Indeed and AmbitionBox are in the search list on purpose. Prospective clients
read them, and staff reviews often name the same operational problems clients feel, some
months earlier.

## Running it

Monthly, on the 1st at 10:00 AM PKT. Or Actions → Review Radar → Run workflow, with a
dry run that prints everything and emails nobody. The report is saved as an artifact
every run.

## Secrets

| Secret | What it does |
|---|---|
| `GEMINI_KEY` | reads the reviews out of the pages. Ordinary calls, no search |
| `REVIEW_GEMINI_KEY` | optional — a key of its own, so the daily compliance agents cannot spend the quota first |
| `BRAVE_KEY` **or** `GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID` | finds the pages |
| `RESEND_KEY` | sends the report |

### Why not Gemini's own web search

It was the first design and it does not work on a free account. Google Search grounding
is restricted to the Gemini **2.5** family on the free tier, those models are now retired,
and grounding on the current models is **paid-only** — it returns *"you exceeded your
current quota"* on a key that has never been used. Three attempts to work around it failed
for that same reason.

So searching and reading are now separate:

1. **Brave** or **Google Custom Search** finds the pages — both have real free tiers
2. the agent fetches those pages itself
3. an ordinary Gemini call reads the reviews out of the text

Ordinary Gemini calls are not restricted this way, which is why this holds up.

### Getting a search key

**Brave** — brave.com/search/api, free tier of 2,000 searches a month. This agent uses
about 8 a run, so a monthly schedule never comes close. Simplest option.

**Google Custom Search** — free 100 a day. Needs an API key *and* a search engine ID from
programmablesearchengine.google.com, set to search the whole web.

### With no search key at all

It still runs. Put the pages you already know into `SEED_URLS` in `config.js` — your
Google listing, your Trustpilot page — and it reads those directly. Fewer sources, but
useful on day one and free of any search service.

## Tuning (`config.js`)

`BUSINESS.aliases` — every name people use. More names means better coverage; add
misspellings people actually type.
`PLACES` — where to look. Add a site by adding one line.
`MIN_REVIEWS_FOR_THEME` — how many mentions make a pattern. Two by default.
`SEARCH_MODEL` — must be a model that supports Google Search grounding.

## Changing the rules

Every rule is a check in `selftest.js` — it reports `33 passed, 0 failed` and runs before
each search. Two of those checks exist specifically to stop the report flattering you:
finding nothing must be reported as nothing rather than as good news, and the report must
never claim to have every review.

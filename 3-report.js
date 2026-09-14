// 3-report.js — the email.
const { SETTINGS, BUSINESS } = require("./config");

const C = { navy:"#16205e", royal:"#1f2f8f", ink:"#1f2937", body:"#3f4a5a", soft:"#868e9b",
  line:"#e6e9f1", panel:"#f7f9fc", good:"#1e7a4d", goodbg:"#e9f6ee",
  bad:"#c0392b", badbg:"#fdecea", warn:"#b06a10", warnbg:"#fff5e8" };
const F = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const heading = (t, accent) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 12px"><tr>
  <td style="border-left:4px solid ${accent};padding:0 0 0 10px;font:700 15px/1.3 ${F};color:${C.navy}">${esc(t)}</td></tr></table>`;
const para = (h,size=14,col=C.body) => `<div style="font:400 ${size}px/1.65 ${F};color:${col};margin:0 0 12px">${h}</div>`;

function stats(cells) {
  const w = Math.floor(100/cells.length);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px"><tr>
  ${cells.map((c,i)=>`<td width="${w}%" align="center" style="background:${c.bg};border:1px solid ${c.bg};border-radius:6px;padding:13px 6px">
    <div style="font:700 24px/1 ${F};color:${c.fg}">${esc(c.value)}</div>
    <div style="font:600 10px/1.3 ${F};letter-spacing:.06em;text-transform:uppercase;color:${c.fg};opacity:.85;margin-top:5px">${esc(c.label)}</div>
  </td>${i===cells.length-1?"":'<td width="8"></td>'}`).join("")}</tr></table>`;
}

// one factor: what it is, how often, what people said, and for negatives what to change
function factorCard(f, kind) {
  const positive = kind === "positive";
  const fg = positive ? C.good : C.bad, bg = positive ? C.goodbg : C.badbg;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${bg};border-left:4px solid ${fg};border-radius:6px;background:#fff">
  <tr><td style="padding:13px 16px">
    <table role="presentation" width="100%"><tr>
      <td style="font:700 15px/1.4 ${F};color:${C.ink}">${esc(f.factor)}</td>
      <td align="right" style="white-space:nowrap"><span style="background:${fg};color:#fff;font:700 11px/1 ${F};padding:5px 9px;border-radius:20px">${esc(f.count)} mention${f.count==1?"":"s"}</span></td>
    </tr></table>
    <div style="font:400 13.5px/1.6 ${F};color:${C.body};margin-top:8px">${esc(f.why)}</div>
    ${(f.quotes||[]).slice(0,3).map((q)=>`<div style="font:400 12.5px/1.6 ${F};color:${C.soft};margin-top:7px;padding:8px 11px;background:${C.panel};border-radius:5px">&ldquo;${esc(q)}&rdquo;</div>`).join("")}
    ${f.fixable ? `<div style="font:400 13px/1.6 ${F};color:${fg};margin-top:10px;padding-top:9px;border-top:1px solid ${bg}"><strong>What would fix it:</strong> ${esc(f.fixable)}</div>` : ""}
    ${(f.places||[]).length ? `<div style="font:400 11.5px/1.5 ${F};color:${C.soft};margin-top:8px">Seen on: ${esc(f.places.join(", "))}</div>` : ""}
  </td></tr></table>`;
}

const table = (headers, rows) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:6px">
  <tr>${headers.map((h,i)=>`<td ${i?'align="right"':''} style="background:${C.panel};padding:8px 12px;font:700 11px/1.3 ${F};letter-spacing:.05em;text-transform:uppercase;color:${C.navy}">${esc(h)}</td>`).join("")}</tr>
  ${rows.map((r,ri)=>`<tr>${r.map((c,i)=>`<td ${i?'align="right"':''} style="padding:8px 12px;border-top:1px solid ${C.line};font:400 13px/1.5 ${F};color:${i?C.ink:C.body};${ri%2?`background:${C.panel};`:''}">${esc(c)}</td>`).join("")}</tr>`).join("")}
</table>`;

function buildReport({ themes, counts, results, dryRun }) {
  const t = themes || {};
  const pos = t.positive || [], neg = t.negative || [];
  const failed = results.filter((r) => r.error);
  const empty = results.filter((r) => !r.error && r.found === false);

  const allFailed = results.length > 0 && failed.length === results.length;
  const quotaHit = results.some((r) => r.quota);
  const banner = allFailed && quotaHit
    ? { bg: C.badbg, fg: C.bad, text: `<strong>Nothing could be searched — the API quota ran out.</strong> This is not a finding that no reviews exist. Give this agent its own API key, or enable billing: web search grounding has a small free allowance.` }
    : allFailed
    ? { bg: C.badbg, fg: C.bad, text: `<strong>Nothing could be searched.</strong> Every site failed, so this is NOT a finding that no reviews exist — see the reason below.` }
    : neg.length
    ? { bg: C.badbg, fg: C.bad, text: `<strong>${neg.length} thing${neg.length>1?"s":""} people complain about.</strong> Each one below says what would fix it.` }
    : counts.total
      ? { bg: C.goodbg, fg: C.good, text: `<strong>No repeated complaints found.</strong> ${counts.total} reviews read across the public web.` }
      : { bg: C.warnbg, fg: C.warn, text: `<strong>No reviews were found this time.</strong> That may mean little is published, or the searches came back empty — see the coverage note below.` };

  const body = `
${dryRun ? para(`<span style="color:${C.warn};font-weight:600">Dry run.</span> Not emailed to anyone else.`, 13) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>
<td style="background:${banner.bg};border-left:4px solid ${banner.fg};padding:13px 16px;font:400 14.5px/1.6 ${F};color:${banner.fg}">${banner.text}</td></tr></table>

${stats([
  { value: String(counts.total), label: "reviews read", fg: C.navy, bg: C.panel },
  { value: counts.averageRating !== null ? String(counts.averageRating) : "—", label: "average rating", fg: C.navy, bg: C.panel },
  { value: String(counts.bySentiment.positive), label: "positive", fg: C.good, bg: C.goodbg },
  { value: String(counts.bySentiment.negative), label: "negative", fg: C.bad, bg: C.badbg },
])}

${t.summary ? para(`<strong style="color:${C.ink}">In short.</strong> ${esc(t.summary)}`, 14.5) : ""}

${neg.length ? heading("Why people are unhappy", C.bad) + neg.map((f)=>factorCard(f,"negative")).join("") : ""}
${pos.length ? heading("Why people are happy", C.good) + pos.map((f)=>factorCard(f,"positive")).join("") : ""}

${t.watchFor ? heading("Worth watching", C.warn) +
  `<div style="background:${C.warnbg};border-left:4px solid ${C.warn};padding:13px 16px;font:400 14px/1.6 ${F};color:${C.warn};border-radius:0 6px 6px 0">${esc(t.watchFor)}</div>` : ""}

${(t.oneOffs||[]).length ? heading("Said once — not yet a pattern", C.soft) +
  para(`One person is not a trend, but these are worth knowing.`, 13, C.soft) +
  `<ul style="margin:0;padding-left:20px;font:400 13px/1.8 ${F};color:${C.body}">${t.oneOffs.map((o)=>`<li>${esc(o)}</li>`).join("")}</ul>` : ""}

${heading("Where these came from", C.royal)}
${table(["Site","Reviews found"], Object.entries(counts.byPlace).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,String(v)]))}

${(failed.length || empty.length) ? heading("Coverage — what was NOT covered", C.warn) +
  para(`This is what a prospective client could find publicly. It is not every review that exists: Google's own API returns about five per business, and most review sites have no public feed.`, 13, C.soft) +
  table(["Site","Result"], [
    ...empty.map((r)=>[r.place.label, r.note || "nothing found"]),
    ...failed.map((r)=>[r.place.label, `could not search: ${String(r.error).slice(0,60)}`]),
  ]) : ""}
`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:26px 12px;margin:0">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="660" style="width:660px;max-width:660px;background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background-color:${C.navy};background-image:linear-gradient(120deg,${C.navy},${C.royal});padding:22px 26px">
    <div style="font:700 21px/1.25 ${F};color:#fff">What people say about ${esc(BUSINESS.name)}</div>
    <div style="font:400 12.5px/1.5 ${F};color:#aab0d4;margin-top:5px">${new Date().toISOString().slice(0,10)} &middot; ${counts.total} reviews across the public web</div>
  </td></tr>
  <tr><td style="padding:22px 26px 26px">${body}</td></tr>
  <tr><td style="background:${C.panel};border-top:1px solid ${C.line};padding:16px 26px;font:400 11.5px/1.6 ${F};color:${C.soft}">
    <strong style="color:${C.body}">Ali Raza</strong> &middot; Compliance &middot; HOF Migration<br>
    Read-only. Nothing is posted, replied to or changed on any review site by this agent.
  </td></tr>
</table></td></tr></table>`;
}

async function sendReport(subject, html) {
  if (!process.env.RESEND_KEY) { console.log("No RESEND_KEY set."); return false; }
  const body = { from: SETTINGS.FROM_EMAIL, to: [SETTINGS.REPORT_TO], subject, html };
  if (SETTINGS.REPORT_CC.length) body.cc = SETTINGS.REPORT_CC;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0,300);
    console.log(`Report failed: ${res.status} ${t}`);
    if (res.status === 403 && SETTINGS.FROM_EMAIL.endsWith("resend.dev"))
      console.log(`  The built-in sender only reaches the address the Resend account was registered with.`);
    return false;
  }
  return true;
}

module.exports = { buildReport, sendReport };

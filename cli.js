#!/usr/bin/env node
/**
 * CharityVerify CLI
 *
 * Look up trust grades, verdicts, and analysis for 138,000+ Canadian charities.
 * Outputs JSON to stdout — designed for AI tools, scripts, and pipelines.
 *
 * Usage:
 *   npx charityverify search "Red Cross"
 *   npx charityverify lookup 119219814RR0001
 *   npx charityverify verdict 119219814RR0001
 *   npx charityverify check 119219814RR0001
 *   npx charityverify compare 119219814RR0001 131709110RR0001
 *   npx charityverify financials 119219814RR0001
 *   npx charityverify top
 *   npx charityverify top --province ON --limit 5
 *
 * Set CHARITYVERIFY_API_KEY for full analysis (paid tier).
 */

const API_BASE = "https://charity-check-api.fly.dev";
const SITE_BASE = "https://charityverify.ca";
const API_KEY = process.env.CHARITYVERIFY_API_KEY || null;

// ─── Helpers ─────────────────────────────────────────────────────────

async function apiFetch(path, params = {}) {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const headers = { Accept: "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;

  const resp = await fetch(url.toString(), { headers });
  if (!resp.ok) {
    const text = await resp.text();
    error(`API ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function error(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function attribution(bn) {
  return {
    source: "CharityVerify.ca",
    url: `${SITE_BASE}/charity/${bn}`,
    data_basis: "Canada Revenue Agency public filings",
  };
}

const GRADE_DESC = {
  "A+": "Highest trust — strong governance, financials, and compliance",
  A: "Strong trust — well-run with minor areas to note",
  B: "Good fundamentals with some areas to watch",
  C: "Mixed profile — some areas need improvement",
  D: "Below average — several areas of concern",
  F: "Significant issues identified",
  NR: "Not Rated — insufficient data",
};

function formatCharity(data) {
  const t = data.trust_score || {};
  const c = data.charity || data;
  const narr = t.narratives || {};

  const result = {
    name: c.legal_name || "Unknown",
    business_number: c.business_number || data.business_number,
    grade: t.trust_grade || "NR",
    grade_meaning: GRADE_DESC[t.trust_grade] || "Unknown",
    location: [c.city, c.province].filter(Boolean).join(", ") || null,
    status: c.current_status || null,
    category: c.charity_type || null,
  };

  if (narr.bottom_line) result.verdict = narr.bottom_line;
  if (narr.overall) result.summary = narr.overall;
  if (t.legitimacy_score != null) result.legitimacy_score = t.legitimacy_score;
  if (t.effectiveness_score != null) result.effectiveness_score = t.effectiveness_score;

  // Premium fields (with API key)
  if (narr.analysis) result.analysis = narr.analysis;
  if (narr.flags) result.flag_details = narr.flags;
  if (narr.scores) result.score_details = narr.scores;
  if (t.flags && t.flags.length > 0) {
    result.flag_count = t.flags.length;
    result.flags = t.flags.map((f) => ({
      code: f.code,
      severity: f.severity,
      category: f.category,
    }));
  }

  result.attribution = attribution(result.business_number);
  return result;
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function positionalArgs(args) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) i++; // skip flag value
    } else {
      result.push(args[i]);
    }
  }
  return result;
}

// ─── Commands ────────────────────────────────────────────────────────

async function cmdLookup(args) {
  const bn = positionalArgs(args)[0];
  if (!bn) error("Usage: charityverify lookup <business_number>");
  const data = await apiFetch(`/v1/charity/${bn}`);
  out(formatCharity(data));
}

async function cmdSearch(args) {
  const pos = positionalArgs(args);
  const query = pos.join(" ");
  if (!query) error("Usage: charityverify search <query>");
  const flags = parseFlags(args);
  const params = { q: query, limit: flags.limit || 10 };
  if (flags.province) params.province = flags.province;
  if (flags["min-grade"]) params.min_grade = flags["min-grade"];

  const data = await apiFetch("/v1/search", params);
  const results = (data.results || data || []).map((item) => ({
    name: item.legal_name,
    business_number: item.business_number,
    grade: item.trust_grade || "NR",
    grade_meaning: GRADE_DESC[item.trust_grade] || "Unknown",
    location: [item.city, item.province].filter(Boolean).join(", ") || null,
    url: `${SITE_BASE}/charity/${item.business_number}`,
  }));

  out({ query, result_count: results.length, results, attribution: { source: "CharityVerify.ca" } });
}

async function cmdVerdict(args) {
  const bn = positionalArgs(args)[0];
  if (!bn) error("Usage: charityverify verdict <business_number>");
  const data = await apiFetch(`/v1/charity/${bn}`);
  const t = data.trust_score || {};
  const narr = t.narratives || {};
  const c = data.charity || data;

  out({
    name: c.legal_name || "Unknown",
    business_number: bn,
    grade: t.trust_grade || "NR",
    grade_meaning: GRADE_DESC[t.trust_grade] || "Unknown",
    verdict: narr.bottom_line || narr.overall || "No verdict available",
    summary: narr.overall || null,
    attribution: attribution(bn),
  });
}

async function cmdCheck(args) {
  const bn = positionalArgs(args)[0];
  if (!bn) error("Usage: charityverify check <business_number>");
  const data = await apiFetch(`/v1/charity/${bn}`);
  const t = data.trust_score || {};
  const narr = t.narratives || {};
  const c = data.charity || data;
  const flags = t.flags || [];
  const grade = t.trust_grade || "NR";

  let assessment;
  if (grade === "NR") assessment = "Insufficient data — exercise due diligence";
  else if (["A+", "A"].includes(grade)) assessment = "Appears trustworthy based on available data";
  else if (grade === "B") assessment = "Generally trustworthy with minor areas to note";
  else if (grade === "C") assessment = "Mixed signals — review before donating";
  else assessment = "Concerns identified — careful review recommended";

  out({
    name: c.legal_name || "Unknown",
    business_number: bn,
    grade,
    assessment,
    flag_count: flags.length,
    critical_flags: flags.filter((f) => f.severity === "critical").length,
    verdict: narr.bottom_line || narr.overall || null,
    registered: c.current_status === "Registered",
    attribution: attribution(bn),
  });
}

async function cmdCompare(args) {
  const bns = positionalArgs(args);
  if (bns.length < 2) error("Usage: charityverify compare <BN1> <BN2> [BN3...]");
  if (bns.length > 5) error("Compare up to 5 charities at a time");

  const results = await Promise.all(
    bns.map(async (bn) => {
      try {
        const data = await apiFetch(`/v1/charity/${bn}`);
        return formatCharity(data);
      } catch {
        return { business_number: bn, error: "Not found" };
      }
    })
  );

  out({
    comparison: results,
    count: results.filter((r) => !r.error).length,
    attribution: { source: "CharityVerify.ca" },
  });
}

async function cmdFinancials(args) {
  const bn = positionalArgs(args)[0];
  if (!bn) error("Usage: charityverify financials <business_number>");
  const data = await apiFetch(`/v1/charity/${bn}/financials`);
  out({ business_number: bn, financials: data.financials || data, attribution: attribution(bn) });
}

async function cmdTop(args) {
  const flags = parseFlags(args);
  const params = {};
  if (flags.province) params.province = flags.province;
  if (flags.limit) params.limit = flags.limit;
  if (flags.category) params.category = flags.category;

  const data = await apiFetch("/v1/top-charities", params);
  const charities = (data.charities || data || []).map((item) => ({
    name: item.legal_name,
    business_number: item.business_number,
    grade: item.trust_grade || "NR",
    location: [item.city, item.province].filter(Boolean).join(", ") || null,
    url: `${SITE_BASE}/charity/${item.business_number}`,
  }));

  out({ count: charities.length, charities, attribution: { source: "CharityVerify.ca" } });
}

// ─── Help ────────────────────────────────────────────────────────────

function showHelp() {
  process.stdout.write(`CharityVerify CLI — Trust grades for 138,000+ Canadian charities

Commands:
  search <query>              Search charities by name
    --province ON             Filter by province
    --min-grade B             Minimum grade (A+, A, B, C, D, F)
    --limit 10                Max results

  lookup <BN>                 Full charity profile by business number
  verdict <BN>               Donor verdict (quick summary)
  check <BN>                 Legitimacy check (grade + flags)
  financials <BN>            Financial history
  compare <BN> <BN> [...]    Side-by-side comparison (2-5)
  top                        Top-rated charities
    --province ON             Filter by province
    --limit 20                Max results

Output: JSON to stdout. Set CHARITYVERIFY_API_KEY for full analysis.

Examples:
  charityverify search "food bank" --province ON
  charityverify lookup 119219814RR0001
  charityverify check 119219814RR0001
  charityverify compare 119219814RR0001 131709110RR0001

More info: https://charityverify.ca/docs
`);
}

// ─── Main ────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

const commands = {
  lookup: cmdLookup,
  search: cmdSearch,
  verdict: cmdVerdict,
  check: cmdCheck,
  compare: cmdCompare,
  financials: cmdFinancials,
  top: cmdTop,
  help: showHelp,
  "--help": showHelp,
  "-h": showHelp,
};

if (!command || !commands[command]) {
  if (command) process.stderr.write(`Unknown command: ${command}\n\n`);
  showHelp();
  process.exit(command ? 1 : 0);
}

const fn = commands[command];
if (fn.constructor.name === "AsyncFunction") {
  fn(args).catch((err) => error(err.message));
} else {
  fn(args);
}

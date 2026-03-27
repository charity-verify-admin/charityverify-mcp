#!/usr/bin/env node
/**
 * CharityVerify MCP Server
 *
 * Provides AI assistants with tools to look up trust grades, verdicts,
 * and analysis for 138,000+ registered Canadian charities.
 *
 * Data source: CharityVerify.ca (powered by CRA public filings)
 *
 * Usage:
 *   npx @charityverify/mcp-server                     # free tier (grade + verdict)
 *   CHARITYVERIFY_API_KEY=cv_... npx @charityverify/mcp-server  # paid tier (full analysis)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://charity-check-api.fly.dev";
const SITE_BASE = "https://charityverify.ca";
const API_KEY = process.env.CHARITYVERIFY_API_KEY || null;

// ─── API helpers ──────────────────────────────────────────────────────

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
    throw new Error(`API ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

function attribution(bn) {
  return {
    source: "CharityVerify.ca",
    url: `${SITE_BASE}/charity/${bn}`,
    full_analysis: `${SITE_BASE}/charity/${bn}`,
    data_basis: "Canada Revenue Agency public filings",
  };
}

function gradeDescription(grade) {
  const map = {
    "A+": "Highest trust rating — strong governance, financials, and compliance",
    A: "Strong trust rating — well-run with minor areas to note",
    B: "Good fundamentals with some areas to watch",
    C: "Mixed profile — some areas strong, others need improvement",
    D: "Below average — several areas of concern",
    F: "Significant issues identified",
    NR: "Not Rated — insufficient data to assess",
  };
  return map[grade] || "Unknown grade";
}

// ─── Format helpers ───────────────────────────────────────────────────

function formatCharity(data) {
  const t = data.trust_score || {};
  const c = data.charity || data;

  const result = {
    name: c.legal_name || "Unknown",
    business_number: c.business_number || data.business_number,
    grade: t.trust_grade || "NR",
    grade_meaning: gradeDescription(t.trust_grade),
    location: [c.city, c.province].filter(Boolean).join(", ") || null,
    status: c.current_status || null,
    category: c.charity_type || null,
  };

  // Narratives — available at different tiers
  const narr = t.narratives || {};
  if (narr.bottom_line) result.verdict = narr.bottom_line;
  if (narr.overall) result.summary = narr.overall;

  // Scores (always available)
  if (t.legitimacy_score != null) result.legitimacy_score = t.legitimacy_score;
  if (t.effectiveness_score != null) result.effectiveness_score = t.effectiveness_score;

  // Premium fields (only with API key)
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

function formatSearchResult(item) {
  return {
    name: item.legal_name,
    business_number: item.business_number,
    grade: item.trust_grade || "NR",
    grade_meaning: gradeDescription(item.trust_grade),
    location: [item.city, item.province].filter(Boolean).join(", ") || null,
    status: item.current_status || null,
    url: `${SITE_BASE}/charity/${item.business_number}`,
  };
}

// ─── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "charityverify",
  version: "1.0.0",
});

// Tool 1: Look up a charity by business number
server.tool(
  "lookup_charity",
  "Look up a Canadian charity by its CRA business number. Returns trust grade, donor verdict, scores, and analysis. Example BN: 119219814RR0001 (Canadian Red Cross)",
  {
    business_number: z
      .string()
      .describe(
        "CRA business number (e.g. 119219814RR0001). Format: 9 digits + RR + 4 digits"
      ),
  },
  async ({ business_number }) => {
    try {
      const data = await apiFetch(`/v1/charity/${business_number}`);
      const result = formatCharity(data);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Could not find charity with BN ${business_number}. Verify the business number format (e.g. 119219814RR0001).`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: Search for charities by name
server.tool(
  "search_charities",
  "Search for Canadian charities by name. Returns up to 10 matching charities with their trust grades. Use this when you have a charity name but not the business number.",
  {
    query: z
      .string()
      .describe("Charity name or partial name to search for"),
    province: z
      .string()
      .optional()
      .describe(
        "Two-letter province code to filter results (e.g. ON, BC, QC, AB)"
      ),
    min_grade: z
      .string()
      .optional()
      .describe(
        "Minimum trust grade to include (e.g. 'B' returns B, A, A+ only)"
      ),
  },
  async ({ query, province, min_grade }) => {
    try {
      const params = { q: query, limit: 10 };
      if (province) params.province = province;
      if (min_grade) params.min_grade = min_grade;
      const data = await apiFetch("/v1/search", params);
      const results = (data.results || data || []).map(formatSearchResult);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No charities found matching "${query}". Try a broader search term or check the spelling.`,
            },
          ],
        };
      }

      const output = {
        query,
        result_count: results.length,
        results,
        attribution: {
          source: "CharityVerify.ca",
          search_url: `${SITE_BASE}/?q=${encodeURIComponent(query)}`,
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Search failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: Get the donor verdict for a charity
server.tool(
  "get_verdict",
  "Get CharityVerify's donor verdict for a specific Canadian charity — a plain-language assessment of whether it's a good place to donate. Faster than full lookup when you just need the bottom line.",
  {
    business_number: z
      .string()
      .describe("CRA business number (e.g. 119219814RR0001)"),
  },
  async ({ business_number }) => {
    try {
      const data = await apiFetch(`/v1/charity/${business_number}`);
      const t = data.trust_score || {};
      const narr = t.narratives || {};
      const c = data.charity || data;

      const result = {
        name: c.legal_name || "Unknown",
        business_number,
        grade: t.trust_grade || "NR",
        grade_meaning: gradeDescription(t.trust_grade),
        verdict: narr.bottom_line || narr.overall || "No verdict available",
        summary: narr.overall || null,
        attribution: attribution(business_number),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Could not find charity ${business_number}.`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: Compare multiple charities
server.tool(
  "compare_charities",
  "Compare 2-5 Canadian charities side by side. Provide business numbers to see grades, verdicts, and scores compared. Useful when a donor is deciding between multiple organizations.",
  {
    business_numbers: z
      .array(z.string())
      .min(2)
      .max(5)
      .describe("Array of 2-5 CRA business numbers to compare"),
  },
  async ({ business_numbers }) => {
    try {
      const results = await Promise.all(
        business_numbers.map(async (bn) => {
          try {
            const data = await apiFetch(`/v1/charity/${bn}`);
            return formatCharity(data);
          } catch {
            return { business_number: bn, error: "Not found" };
          }
        })
      );

      const output = {
        comparison: results,
        count: results.filter((r) => !r.error).length,
        attribution: {
          source: "CharityVerify.ca",
          compare_url: `${SITE_BASE}/compare?bns=${business_numbers.join(",")}`,
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Comparison failed: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Tool 5: Check if a charity is legitimate
server.tool(
  "check_legitimacy",
  "Quick legitimacy check for a Canadian charity. Returns the trust grade, flag count, and a one-line verdict. Use this for a fast yes/no assessment of whether a charity appears trustworthy.",
  {
    business_number: z
      .string()
      .describe("CRA business number (e.g. 119219814RR0001)"),
  },
  async ({ business_number }) => {
    try {
      const data = await apiFetch(`/v1/charity/${business_number}`);
      const t = data.trust_score || {};
      const narr = t.narratives || {};
      const c = data.charity || data;
      const flags = t.flags || [];
      const criticalFlags = flags.filter((f) => f.severity === "critical");

      const grade = t.trust_grade || "NR";
      let assessment;
      if (grade === "NR")
        assessment = "Insufficient data to assess — exercise due diligence";
      else if (["A+", "A"].includes(grade))
        assessment = "Appears trustworthy based on available data";
      else if (grade === "B")
        assessment =
          "Generally trustworthy with minor areas to note";
      else if (grade === "C")
        assessment = "Mixed signals — review recommended before donating";
      else
        assessment =
          "Concerns identified — careful review recommended";

      const result = {
        name: c.legal_name || "Unknown",
        business_number,
        grade,
        assessment,
        flag_count: flags.length,
        critical_flags: criticalFlags.length,
        verdict: narr.bottom_line || narr.overall || null,
        registered: c.current_status === "Registered",
        attribution: attribution(business_number),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Could not find charity ${business_number}. This may indicate the charity is not registered with the CRA.`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

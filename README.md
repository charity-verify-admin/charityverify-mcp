# charityverify-mcp

MCP server + CLI for [CharityVerify](https://charityverify.ca) — trust grades, donor verdicts, and analysis for 138,000+ registered Canadian charities.

## CLI

JSON output to stdout — works with any AI tool, script, or pipeline.

```bash
npx charityverify search "food bank" --province ON
npx charityverify lookup 119219814RR0001
npx charityverify verdict 119219814RR0001
npx charityverify check 119219814RR0001
npx charityverify compare 119219814RR0001 131709110RR0001
npx charityverify financials 119219814RR0001
npx charityverify top --limit 5
```

### Commands

| Command | Description |
|---------|-------------|
| `search <query>` | Search by name. Flags: `--province`, `--min-grade`, `--limit` |
| `lookup <BN>` | Full charity profile by business number |
| `verdict <BN>` | Donor verdict — plain-language assessment |
| `check <BN>` | Legitimacy check — grade, flags, registered status |
| `compare <BN> <BN> [...]` | Side-by-side comparison (2-5 charities) |
| `financials <BN>` | Financial history |
| `top` | Top-rated charities. Flags: `--province`, `--limit` |

## MCP Server

For AI assistants that support [Model Context Protocol](https://modelcontextprotocol.io).

```bash
npx charityverify-mcp
```

### Add to Claude Code

```json
{
  "mcpServers": {
    "charityverify": {
      "command": "npx",
      "args": ["charityverify-mcp"]
    }
  }
}
```

### Add to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "charityverify": {
      "command": "npx",
      "args": ["charityverify-mcp"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `lookup_charity` | Look up a charity by CRA business number |
| `search_charities` | Search charities by name with optional filters |
| `get_verdict` | Donor verdict for a charity |
| `compare_charities` | Compare 2-5 charities side by side |
| `check_legitimacy` | Quick legitimacy check |

## Free vs. Paid

**Without an API key** (default): grade, verdict, basic info, and scores.

**With an API key**: full Opus-generated analysis, flag details, and 20-dimension score narratives. Get a key at [charityverify.ca/pricing](https://charityverify.ca/pricing).

```bash
# CLI
CHARITYVERIFY_API_KEY=cv_your_key npx charityverify lookup 119219814RR0001

# MCP
{
  "mcpServers": {
    "charityverify": {
      "command": "npx",
      "args": ["charityverify-mcp"],
      "env": { "CHARITYVERIFY_API_KEY": "cv_your_key" }
    }
  }
}
```

## Data

All assessments based on Canada Revenue Agency (CRA) public filings. CharityVerify scores 20+ indicators across legitimacy, effectiveness, and compliance to produce trust grades from A+ to F.

- 138,000+ registered Canadian charities
- 457,000+ directors mapped
- 15 years of financial history

## Links

- [CharityVerify](https://charityverify.ca)
- [API Documentation](https://charityverify.ca/docs)
- [Scoring Methodology](https://charityverify.ca/scoring)

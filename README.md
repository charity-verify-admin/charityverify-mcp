# charityverify-mcp

MCP server for [CharityVerify](https://charityverify.ca) — look up trust grades, donor verdicts, and analysis for 138,000+ registered Canadian charities.

## Quick Start

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

## Tools

| Tool | Description |
|------|-------------|
| `lookup_charity` | Look up a charity by CRA business number. Returns grade, verdict, scores, and analysis. |
| `search_charities` | Search charities by name. Optional province and minimum grade filters. |
| `get_verdict` | Get the donor verdict for a charity — a plain-language assessment of whether it's a good place to donate. |
| `compare_charities` | Compare 2-5 charities side by side with grades, verdicts, and scores. |
| `check_legitimacy` | Quick legitimacy check — grade, flag count, and one-line assessment. |

## Example

Ask your AI assistant:

- "Is the Canadian Red Cross trustworthy?"
- "Compare the Red Cross and Salvation Army"
- "Find food banks in Ontario with an A grade"

## Free vs. Paid

**Without an API key** (default): grade, verdict, basic info, and scores for any charity.

**With an API key**: full Opus-generated analysis, flag details, and 20-dimension score narratives. Get a key at [charityverify.ca/pricing](https://charityverify.ca/pricing).

```json
{
  "mcpServers": {
    "charityverify": {
      "command": "npx",
      "args": ["charityverify-mcp"],
      "env": {
        "CHARITYVERIFY_API_KEY": "cv_your_key_here"
      }
    }
  }
}
```

## Data

All assessments are based on Canada Revenue Agency (CRA) public filings. CharityVerify scores 20+ indicators across legitimacy, effectiveness, and compliance dimensions to produce trust grades from A+ to F.

- 138,000+ registered Canadian charities
- 457,000+ directors mapped
- 15 years of financial history

## Links

- [CharityVerify](https://charityverify.ca)
- [API Documentation](https://charityverify.ca/docs)
- [Scoring Methodology](https://charityverify.ca/scoring)

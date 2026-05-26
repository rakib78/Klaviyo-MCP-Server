# Klaviyo MCP Server

[![MCPize](https://mcpize.com/badge/@rkbzddev/klaviyo-mcp)](https://mcpize.com/mcp/klaviyo-mcp)

**Email marketing ops for Claude** — control Klaviyo profiles, campaigns, flows, lists, segments, metrics, and templates through natural language.

Built by [Md Rakibul Islam](https://mrakibulislam.com) · [mrakibulislam.com/mcp-tools/klaviyo](https://mrakibulislam.com/mcp-tools/klaviyo)

---

## Connect via MCPize

Use this MCP server instantly with no local installation:

```bash
npx -y mcpize connect @rkbzddev/klaviyo-mcp --client claude
```

Or connect at: **https://mcpize.com/mcp/klaviyo-mcp**

---

## What it does

Connect Claude to your Klaviyo account and ask things like:

- *"Show me all campaigns scheduled for this week"*
- *"What's the open rate and revenue for my Black Friday campaign?"*
- *"Find customers with churn probability above 70%"*
- *"Pause the Welcome Series flow"*
- *"Track a 'Subscription Renewed' event for this customer"*
- *"List all segments and find the one targeting VIP buyers"*

## Tools (17 total)

### Profiles
| Tool | Description |
|---|---|
| `klaviyo_search_profiles` | Search by email, phone, or custom filter |
| `klaviyo_get_profile` | Full profile with CLV and churn probability |
| `klaviyo_update_profile` | Update contact details and custom properties |

### Campaigns
| Tool | Description |
|---|---|
| `klaviyo_list_campaigns` | List with status filter (draft/scheduled/sent) |
| `klaviyo_get_campaign` | Full campaign details and send strategy |
| `klaviyo_get_campaign_report` | Opens, clicks, revenue, conversion stats |

### Flows
| Tool | Description |
|---|---|
| `klaviyo_list_flows` | List automation flows by status |
| `klaviyo_get_flow` | Full flow details and trigger type |
| `klaviyo_update_flow_status` | Pause, resume, or draft a flow |
| `klaviyo_get_flow_report` | Performance stats per flow |

### Lists & Segments
| Tool | Description |
|---|---|
| `klaviyo_list_lists` | All subscriber lists |
| `klaviyo_get_list` | Single list details |
| `klaviyo_create_list` | Create a new list |
| `klaviyo_add_profiles_to_list` | Subscribe profiles to a list |
| `klaviyo_list_segments` | All segments with processing status |
| `klaviyo_get_segment` | Single segment details |

### Metrics & Events
| Tool | Description |
|---|---|
| `klaviyo_list_metrics` | All tracked metrics and their IDs |
| `klaviyo_get_metric_aggregate` | Time-series data for any metric |
| `klaviyo_get_profile_events` | Event history for a profile |
| `klaviyo_create_event` | Track custom events to trigger flows |

### Templates
| Tool | Description |
|---|---|
| `klaviyo_list_templates` | All email templates |
| `klaviyo_get_template` | Template with HTML preview |

---

## Setup

### 1. Get your Klaviyo API Key

Klaviyo → Settings → API Keys → Create Private API Key

Minimum scopes required:
- Profiles: Read + Write
- Campaigns: Read
- Flows: Read + Write
- Lists: Read + Write
- Segments: Read
- Metrics: Read
- Events: Read + Write
- Templates: Read

### 2. Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "klaviyo": {
      "command": "npx",
      "args": ["klaviyo-mcp-server"],
      "env": {
        "KLAVIYO_API_KEY": "pk_your_private_key_here"
      }
    }
  }
}
```

### 3. Or run via Docker

```bash
docker run -e KLAVIYO_API_KEY=pk_your_key -e TRANSPORT=http -p 3000:3000 klaviyo-mcp-server
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `KLAVIYO_API_KEY` | ✅ Yes | Klaviyo private API key |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

---

## License

MIT
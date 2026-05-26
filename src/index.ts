#!/usr/bin/env node

/**
 * Klaviyo MCP Server
 *
 * Email marketing ops for Claude — profiles, campaigns, flows,
 * lists, segments, metrics, events, and templates.
 *
 * Required env var:
 *   KLAVIYO_API_KEY — Private API key from Klaviyo → Settings → API Keys
 *
 * Optional:
 *   TRANSPORT=http   — Run as HTTP server (default: stdio)
 *   PORT=3000        — HTTP port (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { clientFromEnv, KlaviyoClient } from "./services/klaviyo-client.js";
import { registerProfileTools } from "./tools/profiles.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerFlowTools } from "./tools/flows.js";
import { registerListSegmentTools } from "./tools/lists-segments.js";
import { registerMetricEventTools } from "./tools/metrics-events.js";
import { registerTemplateTools } from "./tools/templates.js";

// ─── Server init ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "klaviyo-mcp-server",
  version: "1.0.0",
});

// Lazy client — validated at call time so missing key gives a helpful error
function getClient(): KlaviyoClient {
  return clientFromEnv();
}

// ─── Register all tools ───────────────────────────────────────────────────────

registerProfileTools(server, getClient);
registerCampaignTools(server, getClient);
registerFlowTools(server, getClient);
registerListSegmentTools(server, getClient);
registerMetricEventTools(server, getClient);
registerTemplateTools(server, getClient);

// ─── Transport ────────────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Klaviyo MCP server running on stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "klaviyo-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.error(`Klaviyo MCP server running on http://localhost:${port}/mcp`);
  });
}

const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
  runHTTP().catch((err) => { console.error("Fatal:", err); process.exit(1); });
} else {
  runStdio().catch((err) => { console.error("Fatal:", err); process.exit(1); });
}

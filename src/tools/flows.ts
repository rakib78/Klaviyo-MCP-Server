import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type { KlaviyoListResponse, KlaviyoSingleResponse, FlowAttributes } from "../types.js";
import { formatList, formatDate, kv, truncate } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatFlow(f: { type: string; id: string; attributes: FlowAttributes }): string {
  const a = f.attributes;
  return [
    `### ${a.name} (${f.id})`,
    kv("Status", a.status),
    kv("Archived", a.archived ? "Yes" : "No"),
    kv("Trigger Type", a.trigger_type),
    kv("Created", formatDate(a.created)),
    kv("Updated", formatDate(a.updated)),
  ].filter(Boolean).join("\n");
}

export function registerFlowTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── List flows ─────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_flows",
    {
      title: "List Flows",
      description: `List Klaviyo automation flows with optional status filtering.

Use for: auditing active flows, finding flows to pause/resume, reviewing trigger types.

Args:
  - status (string, optional): "draft" | "manual" | "live"
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: Flow list with name, status, trigger type, timestamps.`,
      inputSchema: z.object({
        status: z.enum(["draft", "manual", "live"]).optional().describe("Flow status filter"),
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ status, page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<FlowAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<FlowAttributes>>(cursor);
      } else {
        const params: Record<string, string | number | boolean | undefined> = {
          "page[size]": page_size,
          "fields[flow]": "name,status,archived,trigger_type,created,updated",
        };
        if (status) params["filter"] = `equals(status,"${status}")`;
        data = await client.get<KlaviyoListResponse<FlowAttributes>>("/flows/", params);
      }
      const text = formatList(data.data, formatFlow, "flows", data.links?.next);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Get flow ───────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_flow",
    {
      title: "Get Flow",
      description: `Fetch full details of a single flow by ID.

Args:
  - flow_id (string): Klaviyo flow ID

Returns: Flow name, status, trigger type, created/updated timestamps.`,
      inputSchema: z.object({
        flow_id: z.string().min(1).describe("Klaviyo flow ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ flow_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<FlowAttributes>>(`/flows/${flow_id}/`);
      return { content: [{ type: "text", text: formatFlow(data.data) }] };
    }
  );

  // ── Update flow status ─────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_update_flow_status",
    {
      title: "Update Flow Status",
      description: `Change the status of a Klaviyo flow (pause, resume, or set to draft).

Use for: pausing a broken flow, resuming a flow after fixing, archiving old flows.

Args:
  - flow_id (string): Klaviyo flow ID
  - status (string): Target status — "draft" | "manual" | "live"

Returns: Confirmation with updated flow details.

⚠️ Setting to "live" resumes sending to new entrants. Use with care.`,
      inputSchema: z.object({
        flow_id: z.string().min(1).describe("Klaviyo flow ID"),
        status: z.enum(["draft", "manual", "live"]).describe("Target flow status"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ flow_id, status }) => {
      const client = getClient();
      const data = await client.patch<KlaviyoSingleResponse<FlowAttributes>>(
        `/flows/${flow_id}/`,
        { data: { type: "flow", id: flow_id, attributes: { status } } }
      );
      return { content: [{ type: "text", text: `✅ Flow status updated to "${status}".\n\n${formatFlow(data.data)}` }] };
    }
  );

  // ── Get flow report ────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_flow_report",
    {
      title: "Get Flow Performance Report",
      description: `Get performance statistics for a flow: recipients, opens, clicks, revenue.

Args:
  - flow_id (string): Klaviyo flow ID
  - conversion_metric_id (string, optional): Metric ID for revenue attribution
  - timeframe (string, optional): "last_30_days" | "last_90_days" | "last_365_days" (default: "last_30_days")

Returns: Delivered, open rate, click rate, revenue, conversions per flow message.`,
      inputSchema: z.object({
        flow_id: z.string().min(1).describe("Klaviyo flow ID"),
        conversion_metric_id: z.string().optional().describe("Metric ID for revenue attribution"),
        timeframe: z.enum(["last_30_days", "last_90_days", "last_365_days"])
          .default("last_30_days").describe("Reporting window"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ flow_id, conversion_metric_id, timeframe }) => {
      const client = getClient();
      const body = {
        data: {
          type: "flow-values-report",
          attributes: {
            timeframe: { key: timeframe },
            conversion_metric_id: conversion_metric_id ?? "",
            filter: `equals(flow_id,"${flow_id}")`,
            statistics: [
              "delivered_count", "open_count", "open_rate",
              "click_count", "click_rate",
              "unsubscribed_count", "bounce_count",
              "conversion_count", "conversion_value", "revenue_per_recipient",
            ],
          },
        },
      };
      const data = await client.post<{ data: { attributes: Record<string, unknown> } }>(
        "/flow-values-reports/", body
      );
      const stats = data?.data?.attributes ?? {};
      const lines = [
        `## Flow Performance Report (${timeframe})`,
        `**Flow ID:** ${flow_id}`,
        "",
        ...Object.entries(stats).map(([k, v]) => kv(k.replace(/_/g, " "), v)),
      ];
      return { content: [{ type: "text", text: truncate(lines.filter(Boolean).join("\n")) }] };
    }
  );
}

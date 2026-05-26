import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type { KlaviyoListResponse, KlaviyoSingleResponse, CampaignAttributes } from "../types.js";
import { formatList, formatDate, kv, truncate } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatCampaign(c: { type: string; id: string; attributes: CampaignAttributes }): string {
  const a = c.attributes;
  return [
    `### ${a.name} (${c.id})`,
    kv("Status", a.status),
    kv("Archived", a.archived ? "Yes" : "No"),
    kv("Scheduled", formatDate(a.scheduled_at)),
    kv("Send Time", formatDate(a.send_time)),
    kv("Smart Sending", a.send_options?.use_smart_sending ? "Enabled" : "Disabled"),
    kv("Send Strategy", a.send_strategy?.method),
    kv("Created", formatDate(a.created_at)),
    kv("Updated", formatDate(a.updated_at)),
  ].filter(Boolean).join("\n");
}

export function registerCampaignTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── List campaigns ─────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_campaigns",
    {
      title: "List Campaigns",
      description: `List Klaviyo email campaigns with status filtering.

Use for: reviewing campaign pipeline, checking what's scheduled or sent, auditing campaign library.

Args:
  - status (string, optional): Filter by status — "draft" | "scheduled" | "sending" | "sent" | "cancelled"
  - archived (boolean, optional): Include archived campaigns (default false)
  - page_size (number, optional): Results per page 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor from previous response

Returns: Campaign list with name, status, schedule, send strategy.`,
      inputSchema: z.object({
        status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional()
          .describe("Campaign status filter"),
        archived: z.boolean().default(false).describe("Include archived campaigns"),
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional().describe("Pagination cursor"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ status, archived, page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<CampaignAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<CampaignAttributes>>(cursor);
      } else {
        const filters: string[] = [];
        if (status) filters.push(`equals(status,"${status}")`);
        if (!archived) filters.push(`equals(archived,false)`);
        const params: Record<string, string | number | boolean | undefined> = {
          "page[size]": page_size,
          "fields[campaign]": "name,status,archived,audiences,send_options,send_strategy,tracking_options,created_at,scheduled_at,updated_at,send_time",
        };
        if (filters.length) params["filter"] = filters.length === 1 ? filters[0] : `and(${filters.join(",")})`;
        data = await client.get<KlaviyoListResponse<CampaignAttributes>>("/campaigns/", params);
      }
      const text = formatList(data.data, formatCampaign, "campaigns", data.links?.next);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Get campaign ───────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_campaign",
    {
      title: "Get Campaign",
      description: `Fetch full details for a single campaign by ID.

Args:
  - campaign_id (string): Klaviyo campaign ID

Returns: Campaign name, status, audiences, send strategy, schedule, tracking options.`,
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("Klaviyo campaign ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ campaign_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<CampaignAttributes>>(`/campaigns/${campaign_id}/`);
      return { content: [{ type: "text", text: formatCampaign(data.data) }] };
    }
  );

  // ── Get campaign reporting ─────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_campaign_report",
    {
      title: "Get Campaign Performance Report",
      description: `Get performance statistics for a campaign: opens, clicks, revenue, conversion rates.

Args:
  - campaign_id (string): Klaviyo campaign ID
  - conversion_metric_id (string, optional): Metric ID to use for revenue attribution (get from klaviyo_list_metrics)

Returns: Delivered, opens, clicks, revenue, unsubscribes, bounce rates.`,
      inputSchema: z.object({
        campaign_id: z.string().min(1).describe("Klaviyo campaign ID"),
        conversion_metric_id: z.string().optional()
          .describe("Metric ID for conversion attribution (use klaviyo_list_metrics to find 'Placed Order' metric ID)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ campaign_id, conversion_metric_id }) => {
      const client = getClient();
      const body: Record<string, unknown> = {
        data: {
          type: "campaign-values-report",
          attributes: {
            timeframe: { key: "last_365_days" },
            conversion_metric_id: conversion_metric_id ?? "",
            filter: `equals(campaign_id,"${campaign_id}")`,
            statistics: [
              "delivered_count", "open_count", "open_rate",
              "click_count", "click_rate", "click_to_open_rate",
              "unsubscribed_count", "bounce_count",
              "revenue_per_recipient", "conversion_count", "conversion_value",
            ],
          },
        },
      };
      const data = await client.post<{ data: { attributes: Record<string, unknown> } }>(
        "/campaign-values-reports/", body
      );
      const stats = data?.data?.attributes ?? {};
      const lines = [
        `## Campaign Performance Report`,
        `**Campaign ID:** ${campaign_id}`,
        "",
        ...Object.entries(stats).map(([k, v]) => kv(k.replace(/_/g, " "), v)),
      ];
      return { content: [{ type: "text", text: truncate(lines.filter(Boolean).join("\n")) }] };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type {
  KlaviyoListResponse, KlaviyoSingleResponse,
  MetricAttributes, EventAttributes
} from "../types.js";
import { formatList, formatDate, kv, truncate } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatMetric(m: { type: string; id: string; attributes: MetricAttributes }): string {
  const a = m.attributes;
  return [
    `### ${a.name} (${m.id})`,
    kv("Integration", a.integration?.name),
    kv("Category", a.integration?.category),
    kv("Created", formatDate(a.created)),
  ].filter(Boolean).join("\n");
}

function formatEvent(e: { type: string; id: string; attributes: EventAttributes }): string {
  const a = e.attributes;
  return [
    `### Event ${e.id}`,
    kv("Timestamp", formatDate(a.timestamp)),
    kv("Properties", JSON.stringify(a.event_properties, null, 2)),
  ].filter(Boolean).join("\n");
}

export function registerMetricEventTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── List metrics ───────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_metrics",
    {
      title: "List Metrics",
      description: `List all tracked metrics in your Klaviyo account (e.g. Placed Order, Opened Email, Subscribed to List).

Use this first to find the metric_id needed for reporting tools like klaviyo_get_campaign_report and klaviyo_get_flow_report.

Args:
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: Metric name, ID, integration source, category.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<MetricAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<MetricAttributes>>(cursor);
      } else {
        data = await client.get<KlaviyoListResponse<MetricAttributes>>("/metrics/", {
          "page[size]": page_size,
          "fields[metric]": "name,created,updated,integration",
        });
      }
      return { content: [{ type: "text", text: formatList(data.data, formatMetric, "metrics", data.links?.next) }] };
    }
  );

  // ── Get metric aggregate ───────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_metric_aggregate",
    {
      title: "Get Metric Aggregate",
      description: `Query aggregate statistics for any metric over a time period.

Use for: tracking revenue trends, monitoring email engagement over time, measuring conversion volume.

Args:
  - metric_id (string): Metric ID from klaviyo_list_metrics
  - measurement (string): "count" | "sum_value" | "unique" (default: "count")
  - interval (string): "hour" | "day" | "week" | "month" (default: "day")
  - start_date (string): ISO date e.g. "2024-01-01"
  - end_date (string): ISO date e.g. "2024-12-31"

Returns: Time series of metric values over the requested period.`,
      inputSchema: z.object({
        metric_id: z.string().min(1).describe("Metric ID from klaviyo_list_metrics"),
        measurement: z.enum(["count", "sum_value", "unique"]).default("count")
          .describe("Aggregation method"),
        interval: z.enum(["hour", "day", "week", "month"]).default("day"),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date YYYY-MM-DD"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date YYYY-MM-DD"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ metric_id, measurement, interval, start_date, end_date }) => {
      const client = getClient();
      const body = {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id,
            measurements: [measurement],
            interval,
            filter: [
              `greater-or-equal(datetime,${start_date}T00:00:00+00:00)`,
              `less-than(datetime,${end_date}T23:59:59+00:00)`,
            ],
            timezone: "UTC",
          },
        },
      };
      const data = await client.post<{ data: { attributes: { dates: string[]; data: unknown[] } } }>(
        "/metric-aggregates/", body
      );
      const attrs = data?.data?.attributes;
      if (!attrs?.dates?.length) {
        return { content: [{ type: "text", text: "No data found for the specified period." }] };
      }
      const rows = attrs.dates.map((date, i) => `${date}: ${JSON.stringify((attrs.data as unknown[][])?.[0]?.[i] ?? 0)}`);
      const text = [
        `## Metric Aggregate: ${measurement} by ${interval}`,
        `**Metric ID:** ${metric_id}`,
        `**Period:** ${start_date} → ${end_date}`,
        "",
        ...rows,
      ].join("\n");
      return { content: [{ type: "text", text: truncate(text) }] };
    }
  );

  // ── List profile events ────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_profile_events",
    {
      title: "Get Profile Events",
      description: `Retrieve event history for a specific profile (e.g. orders placed, emails opened, flows entered).

Args:
  - profile_id (string): Klaviyo profile ID
  - metric_id (string, optional): Filter to a specific metric ID (use klaviyo_list_metrics)
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: Event history with timestamps and properties.`,
      inputSchema: z.object({
        profile_id: z.string().min(1).describe("Klaviyo profile ID"),
        metric_id: z.string().optional().describe("Filter by metric ID"),
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ profile_id, metric_id, page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<EventAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<EventAttributes>>(cursor);
      } else {
        const filters = [`equals(profile_id,"${profile_id}")`];
        if (metric_id) filters.push(`equals(metric_id,"${metric_id}")`);
        data = await client.get<KlaviyoListResponse<EventAttributes>>("/events/", {
          "page[size]": page_size,
          "fields[event]": "timestamp,event_properties,datetime,uuid",
          "filter": filters.length === 1 ? filters[0] : `and(${filters.join(",")})`,
          "sort": "-timestamp",
        });
      }
      return { content: [{ type: "text", text: formatList(data.data, formatEvent, "events", data.links?.next) }] };
    }
  );

  // ── Create event ───────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_create_event",
    {
      title: "Create Event",
      description: `Track a custom event for a profile (e.g. "Support Ticket Resolved", "Subscription Renewed").

Use for: triggering flows from external systems, tracking lifecycle events, powering custom segments.

Args:
  - metric_name (string): Event name e.g. "Support Ticket Resolved"
  - email (string): Profile email address
  - properties (object, optional): Event properties e.g. {"ticket_id": "123", "resolution_time": 4.5}
  - value (number, optional): Monetary value of the event for revenue attribution

Returns: Confirmation of event created.`,
      inputSchema: z.object({
        metric_name: z.string().min(1).max(100).describe("Event/metric name"),
        email: z.string().email().describe("Profile email address"),
        properties: z.record(z.unknown()).optional().describe("Custom event properties"),
        value: z.number().optional().describe("Monetary value for revenue attribution"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ metric_name, email, properties, value }) => {
      const client = getClient();
      const eventProps: Record<string, unknown> = { ...(properties ?? {}) };
      if (value !== undefined) eventProps["$value"] = value;

      await client.post("/events/", {
        data: {
          type: "event",
          attributes: {
            metric: { data: { type: "metric", attributes: { name: metric_name } } },
            profile: { data: { type: "profile", attributes: { email } } },
            properties: eventProps,
            time: new Date().toISOString(),
          },
        },
      });
      return { content: [{ type: "text", text: `✅ Event "${metric_name}" tracked for ${email}.` }] };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type { KlaviyoListResponse, KlaviyoSingleResponse, ProfileAttributes } from "../types.js";
import { formatList, formatDate, kv, truncate } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatProfile(p: { type: string; id: string; attributes: ProfileAttributes }): string {
  const a = p.attributes;
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
  const clv = a.predictive_analytics?.total_clv;
  const churn = a.predictive_analytics?.churn_probability;
  return [
    `### ${name} (${p.id})`,
    kv("Email", a.email),
    kv("Phone", a.phone_number),
    kv("Organization", a.organization),
    kv("Title", a.title),
    kv("Location", [a.location?.city, a.location?.country].filter(Boolean).join(", ")),
    kv("Email Consent", a.subscriptions?.email?.marketing?.consent),
    kv("SMS Consent", a.subscriptions?.sms?.marketing?.consent),
    clv !== undefined ? kv("Predicted CLV", `$${Number(clv).toFixed(2)}`) : "",
    churn !== undefined ? kv("Churn Probability", `${(Number(churn) * 100).toFixed(1)}%`) : "",
    kv("Created", formatDate(a.created)),
    kv("Updated", formatDate(a.updated)),
  ].filter(Boolean).join("\n");
}

export function registerProfileTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── Search / list profiles ─────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_search_profiles",
    {
      title: "Search Profiles",
      description: `Search for Klaviyo profiles by email, phone number, or custom filter.

Use for: finding a customer record, checking consent status, previewing predictive analytics (CLV, churn probability).

Args:
  - email (string, optional): Exact email to look up
  - filter (string, optional): Klaviyo filter syntax e.g. "greater-than(properties.total_orders,5)"
  - page_size (number, optional): Results per page, 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor from previous response

Returns: Profile list with email, consent status, CLV, churn probability, location.`,
      inputSchema: z.object({
        email: z.string().email().optional().describe("Exact email address to look up"),
        filter: z.string().optional().describe("Klaviyo filter string e.g. 'greater-than(properties.total_orders,5)'"),
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
        cursor: z.string().optional().describe("Pagination cursor from previous response links.next"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ email, filter, page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<ProfileAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<ProfileAttributes>>(cursor);
      } else {
        const params: Record<string, string | number | boolean | undefined> = {
          "page[size]": page_size,
          "fields[profile]": "email,phone_number,first_name,last_name,organization,title,location,subscriptions,predictive_analytics,created,updated",
        };
        if (email) params["filter"] = `equals(email,"${email}")`;
        else if (filter) params["filter"] = filter;
        data = await client.get<KlaviyoListResponse<ProfileAttributes>>("/profiles/", params);
      }
      const text = formatList(data.data, formatProfile, "profiles", data.links?.next);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Get single profile ─────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_profile",
    {
      title: "Get Profile",
      description: `Fetch full details for a single Klaviyo profile by ID, including predictive analytics.

Args:
  - profile_id (string): Klaviyo profile ID (e.g. "01GDDKASAP8TKDDA2GRZDSVP4H")

Returns: Full profile with all fields, consent status, predicted CLV, churn risk.`,
      inputSchema: z.object({
        profile_id: z.string().min(1).describe("Klaviyo profile ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ profile_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<ProfileAttributes>>(
        `/profiles/${profile_id}/`,
        { "fields[profile]": "email,phone_number,first_name,last_name,organization,title,location,subscriptions,predictive_analytics,properties,created,updated" }
      );
      return { content: [{ type: "text", text: formatProfile(data.data) }] };
    }
  );

  // ── Update profile ─────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_update_profile",
    {
      title: "Update Profile",
      description: `Update a Klaviyo profile's properties or contact details.

Use for: enriching profile data, updating custom properties for segmentation, changing contact info.

Args:
  - profile_id (string): Klaviyo profile ID
  - first_name / last_name / phone_number / title / organization (string, optional): Contact fields
  - properties (object, optional): Custom properties to set e.g. {"loyalty_tier": "gold", "total_orders": 12}

Returns: Updated profile summary.`,
      inputSchema: z.object({
        profile_id: z.string().min(1).describe("Klaviyo profile ID"),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        phone_number: z.string().optional().describe("E.164 format e.g. +16175551212"),
        title: z.string().optional(),
        organization: z.string().optional(),
        properties: z.record(z.unknown()).optional().describe("Custom profile properties"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ profile_id, first_name, last_name, phone_number, title, organization, properties }) => {
      const client = getClient();
      const attrs: Record<string, unknown> = {};
      if (first_name !== undefined) attrs.first_name = first_name;
      if (last_name !== undefined) attrs.last_name = last_name;
      if (phone_number !== undefined) attrs.phone_number = phone_number;
      if (title !== undefined) attrs.title = title;
      if (organization !== undefined) attrs.organization = organization;
      if (properties) attrs.properties = properties;

      const data = await client.patch<KlaviyoSingleResponse<ProfileAttributes>>(
        `/profiles/${profile_id}/`,
        { data: { type: "profile", id: profile_id, attributes: attrs } }
      );
      return { content: [{ type: "text", text: `✅ Profile updated.\n\n${formatProfile(data.data)}` }] };
    }
  );
}

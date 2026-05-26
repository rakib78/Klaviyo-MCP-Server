import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type {
  KlaviyoListResponse, KlaviyoSingleResponse,
  ListAttributes, SegmentAttributes
} from "../types.js";
import { formatList, formatDate, kv } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatListItem(l: { type: string; id: string; attributes: ListAttributes }): string {
  const a = l.attributes;
  return [
    `### ${a.name} (${l.id})`,
    kv("Opt-in Process", a.opt_in_process),
    kv("Created", formatDate(a.created)),
    kv("Updated", formatDate(a.updated)),
  ].filter(Boolean).join("\n");
}

function formatSegment(s: { type: string; id: string; attributes: SegmentAttributes }): string {
  const a = s.attributes;
  return [
    `### ${a.name} (${s.id})`,
    kv("Active", a.is_active ? "Yes" : "No"),
    kv("Processing", a.is_processing ? "Yes" : "No"),
    kv("Starred", a.is_starred ? "Yes" : "No"),
    kv("Created", formatDate(a.created)),
    kv("Updated", formatDate(a.updated)),
  ].filter(Boolean).join("\n");
}

export function registerListSegmentTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── List lists ─────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_lists",
    {
      title: "List All Lists",
      description: `Retrieve all email/SMS lists in your Klaviyo account.

Use for: finding list IDs for campaign audiences, auditing subscriber lists, checking opt-in process type.

Args:
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: List name, ID, opt-in process, created/updated timestamps.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<ListAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<ListAttributes>>(cursor);
      } else {
        data = await client.get<KlaviyoListResponse<ListAttributes>>("/lists/", {
          "page[size]": page_size,
          "fields[list]": "name,opt_in_process,created,updated",
        });
      }
      return { content: [{ type: "text", text: formatList(data.data, formatListItem, "lists", data.links?.next) }] };
    }
  );

  // ── Get list ───────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_list",
    {
      title: "Get List",
      description: `Get details for a specific list by ID.

Args:
  - list_id (string): Klaviyo list ID

Returns: List name, opt-in process, timestamps.`,
      inputSchema: z.object({
        list_id: z.string().min(1).describe("Klaviyo list ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ list_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<ListAttributes>>(`/lists/${list_id}/`);
      return { content: [{ type: "text", text: formatListItem(data.data) }] };
    }
  );

  // ── Create list ────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_create_list",
    {
      title: "Create List",
      description: `Create a new Klaviyo email/SMS subscriber list.

Args:
  - name (string): List name (must be unique in account)

Returns: New list ID and details.`,
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe("List name"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name }) => {
      const client = getClient();
      const data = await client.post<KlaviyoSingleResponse<ListAttributes>>(
        "/lists/",
        { data: { type: "list", attributes: { name } } }
      );
      return { content: [{ type: "text", text: `✅ List created.\n\n${formatListItem(data.data)}` }] };
    }
  );

  // ── Add profiles to list ───────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_add_profiles_to_list",
    {
      title: "Add Profiles to List",
      description: `Subscribe one or more profiles to a Klaviyo list.

Use for: adding customers after import, subscribing new signups, migrating profiles between lists.

Args:
  - list_id (string): Klaviyo list ID
  - profile_ids (string[]): Array of Klaviyo profile IDs to add (max 1000)

Returns: Confirmation of profiles added.`,
      inputSchema: z.object({
        list_id: z.string().min(1).describe("Klaviyo list ID"),
        profile_ids: z.array(z.string()).min(1).max(1000).describe("Profile IDs to add"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ list_id, profile_ids }) => {
      const client = getClient();
      await client.post(
        `/lists/${list_id}/relationships/profiles/`,
        { data: profile_ids.map(id => ({ type: "profile", id })) }
      );
      return { content: [{ type: "text", text: `✅ ${profile_ids.length} profile(s) added to list ${list_id}.` }] };
    }
  );

  // ── List segments ──────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_segments",
    {
      title: "List All Segments",
      description: `Retrieve all segments in your Klaviyo account.

Use for: finding segment IDs for targeting, auditing segment library, checking processing status.

Args:
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: Segment name, ID, active/processing status, timestamps.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<SegmentAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<SegmentAttributes>>(cursor);
      } else {
        data = await client.get<KlaviyoListResponse<SegmentAttributes>>("/segments/", {
          "page[size]": page_size,
          "fields[segment]": "name,is_active,is_processing,is_starred,created,updated",
        });
      }
      return { content: [{ type: "text", text: formatList(data.data, formatSegment, "segments", data.links?.next) }] };
    }
  );

  // ── Get segment ────────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_segment",
    {
      title: "Get Segment",
      description: `Get details for a specific segment by ID.

Args:
  - segment_id (string): Klaviyo segment ID

Returns: Segment name, active status, processing flag, timestamps.`,
      inputSchema: z.object({
        segment_id: z.string().min(1).describe("Klaviyo segment ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ segment_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<SegmentAttributes>>(`/segments/${segment_id}/`);
      return { content: [{ type: "text", text: formatSegment(data.data) }] };
    }
  );
}

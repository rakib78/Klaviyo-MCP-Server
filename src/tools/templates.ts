import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KlaviyoClient } from "../services/klaviyo-client.js";
import type { KlaviyoListResponse, KlaviyoSingleResponse, TemplateAttributes } from "../types.js";
import { formatList, formatDate, kv, truncate } from "../services/formatter.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

function formatTemplate(t: { type: string; id: string; attributes: TemplateAttributes }): string {
  const a = t.attributes;
  return [
    `### ${a.name} (${t.id})`,
    kv("Editor Type", a.editor_type),
    kv("Created", formatDate(a.created)),
    kv("Updated", formatDate(a.updated)),
  ].filter(Boolean).join("\n");
}

export function registerTemplateTools(server: McpServer, getClient: () => KlaviyoClient): void {

  // ── List templates ─────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_list_templates",
    {
      title: "List Templates",
      description: `List email templates in your Klaviyo account.

Args:
  - page_size (number, optional): 1–100 (default ${DEFAULT_PAGE_SIZE})
  - cursor (string, optional): Pagination cursor

Returns: Template name, ID, editor type, timestamps.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
        cursor: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ page_size, cursor }) => {
      const client = getClient();
      let data: KlaviyoListResponse<TemplateAttributes>;
      if (cursor) {
        data = await client.getByUrl<KlaviyoListResponse<TemplateAttributes>>(cursor);
      } else {
        data = await client.get<KlaviyoListResponse<TemplateAttributes>>("/templates/", {
          "page[size]": page_size,
          "fields[template]": "name,editor_type,created,updated",
        });
      }
      return { content: [{ type: "text", text: formatList(data.data, formatTemplate, "templates", data.links?.next) }] };
    }
  );

  // ── Get template ───────────────────────────────────────────────────────────
  server.registerTool(
    "klaviyo_get_template",
    {
      title: "Get Template",
      description: `Fetch a template by ID including its HTML content.

Args:
  - template_id (string): Klaviyo template ID

Returns: Template name, editor type, HTML and text content.`,
      inputSchema: z.object({
        template_id: z.string().min(1).describe("Klaviyo template ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ template_id }) => {
      const client = getClient();
      const data = await client.get<KlaviyoSingleResponse<TemplateAttributes>>(`/templates/${template_id}/`);
      const a = data.data.attributes;
      const lines = [
        formatTemplate(data.data),
        a.html ? `\n**HTML Preview (first 2000 chars):**\n\`\`\`html\n${a.html.slice(0, 2000)}\n\`\`\`` : "",
      ];
      return { content: [{ type: "text", text: truncate(lines.filter(Boolean).join("\n")) }] };
    }
  );
}

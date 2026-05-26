import { CHARACTER_LIMIT } from "../constants.js";
import type { KlaviyoResource, KlaviyoAttributes } from "../types.js";

export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + `\n\n[Output truncated at ${CHARACTER_LIMIT} characters]`;
}

export function formatList<T extends KlaviyoAttributes>(
  items: KlaviyoResource<T>[],
  formatter: (item: KlaviyoResource<T>) => string,
  label: string,
  nextCursor?: string | null
): string {
  if (!items.length) return `No ${label} found.`;
  const lines = items.map(formatter).join("\n\n---\n\n");
  const footer = nextCursor
    ? `\n\n📄 More results available. Use cursor: \`${nextCursor}\``
    : "";
  return truncate(lines + footer);
}

export function kv(label: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return `**${label}:** ${value}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NZ", { timeZone: "UTC" }) + " UTC";
}

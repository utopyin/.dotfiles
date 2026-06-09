// tool-registrar.ts - MCP content transformation
// NOTE: Tools are NOT registered with Pi - only the unified `mcp` proxy tool is registered.
// This keeps the LLM context small (1 tool instead of 100s).
import type { McpContent, ContentBlock } from "./types.js";
/**
 * Transform MCP content types to Pi content blocks.
 */
export const transformMcpContent = (content: McpContent[]): ContentBlock[] => 
    content.map(c => {
        if (c.type === "text") {
            return { text: c.text ?? "", type: "text" as const };
        }
        if (c.type === "image") {
            return {
                data: c.data ?? "",
                mimeType: c.mimeType ?? "image/png",
                type: "image" as const,
            };
        }
        if (c.type === "resource") {
            const resourceUri = c.resource?.uri ?? "(no URI)";
            const resourceContent = c.resource?.text ?? (c.resource ? JSON.stringify(c.resource) : "(no content)");
            return {
                text: `[Resource: ${resourceUri}]\n${resourceContent}`,
                type: "text" as const,
            };
        }
        if (c.type === "resource_link") {
            const linkName = c.name ?? c.uri ?? "unknown";
            const linkUri = c.uri ?? "(no URI)";
            return {
                text: `[Resource Link: ${linkName}]\nURI: ${linkUri}`,
                type: "text" as const,
            };
        }
        if (c.type === "audio") {
            return {
                text: `[Audio content: ${c.mimeType ?? "audio/*"}]`,
                type: "text" as const,
            };
        }
        return { text: JSON.stringify(c), type: "text" as const };
    })
;

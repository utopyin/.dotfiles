// resource-tools.ts - MCP resource name utilities
export const resourceNameToToolName = (name: string): string => {
    let result = name
        .replaceAll(/[^a-zA-Z0-9]/gu, "_")
        .replaceAll(/_+/gu, "_")
        // Remove leading underscores.
        .replace(/^_+/u, "")
        // Remove trailing underscores.
        .replace(/_+$/u, "")
        .toLowerCase();
    // Ensure we have a valid name
    if (!result || /^\d/u.test(result)) {
        result = `resource${result ? `_${  result}` : ""}`;
    }
    return result;
};

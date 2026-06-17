import { platform } from "node:os";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const openUrl = async (
  pi: ExtensionAPI,
  url: string,
  browser?: string
): Promise<void> => {
  const os = platform();
  let result;
  if (os === "darwin") {
    result = browser
      ? await pi.exec("open", ["-a", browser, url])
      : await pi.exec("open", [url]);
  } else if (os === "win32") {
    result = browser
      ? await pi.exec("cmd", ["/c", "start", "", browser, url])
      : await pi.exec("cmd", ["/c", "start", "", url]);
  } else {
    result = browser
      ? await pi.exec(browser, [url])
      : await pi.exec("xdg-open", [url]);
  }
  if (result.code !== 0) {
    throw new Error(
      result.stderr || `Failed to open browser (exit code ${result.code})`
    );
  }
};
export const parallelLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
};
export const getConfigPathFromArgv = (): string | undefined => {
  const idx = process.argv.indexOf("--mcp-config");
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
};
export const truncateAtWord = (text: string, target: number): string => {
  if (!text || text.length <= target) {
    return text;
  }
  const truncated = text.slice(0, target);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > target * 0.6) {
    return `${truncated.slice(0, lastSpace)}...`;
  }
  return `${truncated}...`;
};
/**
 * Extract the adapter-owned UI stream mode from tool metadata.
 */
export const extractToolUiStreamMode = (
  toolMeta: Record<string, unknown> | undefined
): "eager" | "stream-first" | undefined => {
  const uiMeta = toolMeta?.ui;
  if (!uiMeta || typeof uiMeta !== "object") {
    return undefined;
  }
  const streamMode = (uiMeta as Record<string, unknown>)[
    "pi-mcp-adapter.streamMode"
  ];
  if (streamMode === "eager" || streamMode === "stream-first") {
    return streamMode;
  }
  return undefined;
};

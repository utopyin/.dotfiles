import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWebFetchTool } from "./webfetch.ts";
import { createWebSearchTool } from "./websearch.ts";

const webToolsExtension = (pi: ExtensionAPI): void => {
	pi.registerTool(createWebFetchTool());
	pi.registerTool(createWebSearchTool());
};

export default webToolsExtension;

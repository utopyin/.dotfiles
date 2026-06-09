import type {
	SearchDepth,
	SearchProviderName,
	WebFetchFormat,
	WebToolsSettings,
} from "./types.ts";

const FETCH_DEFAULT_FORMAT_VALUES = [
	"markdown",
	"text",
	"html",
] as const satisfies readonly WebFetchFormat[];
const SEARCH_DEFAULT_DEPTH_VALUES = [
	"auto",
	"fast",
	"deep",
] as const satisfies readonly SearchDepth[];
const SEARCH_PROVIDER_VALUES = ["exa"] as const satisfies readonly SearchProviderName[];

const DEFAULTS = {
	fetchBlockPrivateHosts: true,
	fetchDefaultFormat: "markdown",
	fetchFallbackUserAgent: "opencode",
	fetchMaxRedirects: 5,
	fetchMaxResponseMB: 5,
	fetchTimeoutSeconds: 30,
	searchDefaultDepth: "auto",
	searchDefaultMaxResults: 8,
	searchEnabled: true,
	searchEndpoint: "https://m.mulroy.dev/m/e",
	searchProvider: "exa",
	searchTimeoutSeconds: 25,
} as const;

export const parseOnOff = (
	value: string | undefined,
	fallback: boolean,
): boolean => {
	if (value) {
		const normalized = value.trim().toLowerCase();
		if (normalized === "on") {
			return true;
		}
		if (normalized === "off") {
			return false;
		}
	}
	return fallback;
};

export const parseIntegerSetting = (
	value: string | undefined,
	fallback: number,
	options: { max?: number; min?: number } = {},
): number => {
	const parsed = Number.parseInt(value?.trim() ?? "", 10);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	if (options.min !== undefined && parsed < options.min) {
		return fallback;
	}
	if (options.max !== undefined && parsed > options.max) {
		return fallback;
	}
	return parsed;
};

export const parseEnumSetting = <T extends string>(
	value: string | undefined,
	allowed: readonly T[],
	fallback: T,
): T => {
	if (value) {
		const normalized = value.trim() as T;
		return allowed.includes(normalized) ? normalized : fallback;
	}
	return fallback;
};

export const getWebToolsSettings = (): WebToolsSettings => {
	const fetchDefaultFormat = parseEnumSetting(
		undefined,
		FETCH_DEFAULT_FORMAT_VALUES,
		DEFAULTS.fetchDefaultFormat,
	);
	const searchDefaultDepth = parseEnumSetting(
		undefined,
		SEARCH_DEFAULT_DEPTH_VALUES,
		DEFAULTS.searchDefaultDepth,
	);
	const searchProvider = parseEnumSetting(
		undefined,
		SEARCH_PROVIDER_VALUES,
		DEFAULTS.searchProvider,
	);

	return {
		fetch: {
			blockPrivateHosts: DEFAULTS.fetchBlockPrivateHosts,
			defaultFormat: fetchDefaultFormat,
			fallbackUserAgent: DEFAULTS.fetchFallbackUserAgent,
			maxRedirects: DEFAULTS.fetchMaxRedirects,
			maxResponseBytes: DEFAULTS.fetchMaxResponseMB * 1024 * 1024,
			timeoutSeconds: DEFAULTS.fetchTimeoutSeconds,
		},
		search: {
			defaultDepth: searchDefaultDepth,
			defaultMaxResults: DEFAULTS.searchDefaultMaxResults,
			enabled: DEFAULTS.searchEnabled,
			endpoint: DEFAULTS.searchEndpoint,
			provider: searchProvider,
			timeoutSeconds: DEFAULTS.searchTimeoutSeconds,
		},
	};
};

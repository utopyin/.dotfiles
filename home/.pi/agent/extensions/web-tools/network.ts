import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ContentKind, ParsedContentType } from "./types.ts";

const HTML_MIME_TYPES = new Set(["application/xhtml+xml", "text/html"]);
const RASTER_IMAGE_MIME_TYPES = new Set([
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
]);
const TEXT_MIME_TYPES = new Set([
	"application/atom+xml",
	"application/ecmascript",
	"application/javascript",
	"application/json",
	"application/ld+json",
	"application/rss+xml",
	"application/x-javascript",
	"application/xml",
	"image/svg+xml",
]);

export interface ComposedSignal {
	cleanup: () => void;
	signal: AbortSignal;
}

export interface FetchWithRedirectsOptions {
	blockPrivateHosts: boolean;
	headers: Record<string, string>;
	maxRedirects: number;
	signal?: AbortSignal;
}

export interface FetchWithRedirectsResult {
	finalUrl: URL;
	response: Response;
}

export interface ReadBodyResult {
	buffer: Buffer;
	bytes: number;
}

export const createOperationSignal = (
	timeoutMs: number,
	outerSignal?: AbortSignal,
): ComposedSignal => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort(
			new Error(`Operation timed out after ${Math.ceil(timeoutMs / 1000)}s`),
		);
	}, timeoutMs);
	const signal = outerSignal
		? AbortSignal.any([outerSignal, controller.signal])
		: controller.signal;
	return {
		cleanup: () => clearTimeout(timeoutId),
		signal,
	};
};

export const isAbortError = (error: unknown): boolean =>
	error instanceof Error && error.name === "AbortError";

export const normalizeAndValidateUrl = (rawUrl: string): URL => {
	const trimmed = rawUrl.trim();
	if (trimmed.length === 0) {
		throw new Error("URL cannot be empty");
	}
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return parseHttpUrl(trimmed);
	}
	throw new Error("URL must start with http:// or https://");
};

export const fetchWithRedirects = async (
	initialUrl: URL,
	options: FetchWithRedirectsOptions,
): Promise<FetchWithRedirectsResult> => {
	let currentUrl = initialUrl;
	let redirects = 0;

	while (true) {
		if (options.blockPrivateHosts) {
			await assertPublicUrl(currentUrl);
		}

		const response = await fetch(currentUrl, {
			headers: options.headers,
			method: "GET",
			redirect: "manual",
			signal: options.signal,
		});

		if (isRedirectStatus(response.status)) {
			await response.body?.cancel().catch(ignoreCancelError);
			const location = response.headers.get("location");
			if (location === null) {
				throw new Error(
					`Redirect response from ${currentUrl.toString()} was missing a Location header`,
				);
			}
			if (redirects >= options.maxRedirects) {
				throw new Error(
					`Too many redirects while fetching ${initialUrl.toString()}`,
				);
			}
			currentUrl = resolveRedirectUrl(location, currentUrl);
			redirects += 1;
			continue;
		}

		return { finalUrl: currentUrl, response };
	}
};

export const readBodyWithLimit = async (
	response: Response,
	maxBytes: number,
	signal?: AbortSignal,
): Promise<ReadBodyResult> => {
	if (response.body === null) {
		return { buffer: Buffer.alloc(0), bytes: 0 };
	}

	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let bytes = 0;

	try {
		while (true) {
			if (signal?.aborted) {
				await reader.cancel(signal.reason).catch(ignoreCancelError);
				throw signal.reason instanceof Error
					? signal.reason
					: new Error("Operation cancelled");
			}

			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value === undefined) {
				continue;
			}

			bytes += value.byteLength;
			if (bytes > maxBytes) {
				await reader.cancel().catch(ignoreCancelError);
				throw new Error(
					`Response too large (exceeds ${Math.floor(maxBytes / (1024 * 1024))}MB limit)`,
				);
			}

			chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
		}
	} finally {
		reader.releaseLock();
	}

	return {
		buffer: Buffer.concat(chunks),
		bytes,
	};
};

export const parseContentType = (
	contentTypeHeader: null | string | undefined,
): ParsedContentType => {
	const contentType = contentTypeHeader?.trim() ?? "";
	const [mimePart = ""] = contentType.split(";");
	const mime = mimePart.trim().toLowerCase();
	const charsetMatch = contentType.match(/charset\s*=\s*['"]?([^;'"]+)/iu);
	const charset = charsetMatch?.[1]?.trim().toLowerCase();
	const base = {
		contentType,
		kind: classifyMimeType(mime),
		mime,
	};
	return charset ? { ...base, charset } : base;
};

export const classifyMimeType = (mime: string): ContentKind => {
	const normalized = mime.trim().toLowerCase();
	if (normalized.length === 0) {
		return "binary";
	}
	if (HTML_MIME_TYPES.has(normalized)) {
		return "html";
	}
	if (RASTER_IMAGE_MIME_TYPES.has(normalized)) {
		return "raster-image";
	}
	if (normalized === "image/svg+xml") {
		return "svg";
	}
	if (normalized.startsWith("text/")) {
		return normalized === "text/html" ? "html" : "text";
	}
	if (isKnownTextMime(normalized)) {
		return "text";
	}
	return "binary";
};

export const decodeTextBuffer = (
	buffer: Buffer,
	charset?: string,
): { decoder: string; text: string } => {
	const normalizedCharset = normalizeCharset(charset);
	if (normalizedCharset) {
		try {
			return {
				decoder: normalizedCharset,
				text: new TextDecoder(normalizedCharset).decode(buffer),
			};
		} catch {
			// Fall back to utf-8 below.
		}
	}
	return {
		decoder: "utf-8",
		text: new TextDecoder("utf-8").decode(buffer),
	};
};

export const normalizeCharset = (charset: string | undefined): string | undefined => {
	if (charset === undefined) {
		return undefined;
	}
	const normalized = charset.trim().toLowerCase();
	if (normalized.length === 0) {
		return undefined;
	}
	if (normalized === "utf-8") {
		return "utf-8";
	}
	return normalized;
};

export const isPrivateOrLocalIp = (input: string): boolean => {
	const ip = stripIpv6Brackets(input).toLowerCase();
	if (ip.length === 0) {
		return false;
	}
	if (ip.startsWith("::ffff:")) {
		return isPrivateOrLocalIp(ip.slice(7));
	}

	const version = isIP(ip);
	if (version === 4) {
		return isPrivateIpv4(ip);
	}
	if (version === 6) {
		return isPrivateIpv6(ip);
	}
	return false;
};

const parseHttpUrl = (trimmed: string): URL => {
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch (error) {
		throw new Error(`Invalid URL: ${trimmed}`, { cause: error });
	}
	if (url.protocol === "http:" || url.protocol === "https:") {
		return url;
	}
	throw new Error("Only http:// and https:// URLs are supported");
};

const resolveRedirectUrl = (location: string, currentUrl: URL): URL => {
	const nextUrl = new URL(location, currentUrl);
	if (nextUrl.protocol === "http:" || nextUrl.protocol === "https:") {
		return nextUrl;
	}
	throw new Error(`Redirected to unsupported protocol: ${nextUrl.protocol}`);
};

const assertPublicUrl = async (url: URL): Promise<void> => {
	const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
	if (isBlockedHostname(hostname) || isPrivateOrLocalIp(hostname)) {
		throw new Error(`Blocked private or local host: ${url.toString()}`);
	}

	try {
		const records = await lookup(hostname, { all: true, verbatim: true });
		for (const record of records) {
			if (isPrivateOrLocalIp(record.address)) {
				throw new Error(
					`Blocked private or local IP address: ${url.toString()}`,
				);
			}
		}
	} catch (error) {
		if (isBlockedPrivateAddressError(error)) {
			throw error;
		}
		// If DNS resolution fails, let the later fetch surface the real connectivity error.
	}
};

const ignoreCancelError = (error: unknown): void => {
	void error;
};

const isRedirectStatus = (status: number): boolean =>
	status === 301 ||
	status === 302 ||
	status === 303 ||
	status === 307 ||
	status === 308;

const isBlockedHostname = (hostname: string): boolean =>
	hostname === "localhost" || hostname.endsWith(".localhost");

const stripIpv6Brackets = (hostname: string): string =>
	hostname.replace(/^\[/u, "").replace(/\]$/u, "");

const isKnownTextMime = (mime: string): boolean =>
	TEXT_MIME_TYPES.has(mime) || mime.endsWith("+json") || mime.endsWith("+xml");

const isBlockedPrivateAddressError = (error: unknown): error is Error =>
	error instanceof Error &&
	error.message.startsWith("Blocked private or local IP address:");

const isPrivateIpv4 = (ip: string): boolean => {
	const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
	const first = octets[0] ?? 0;
	const second = octets[1] ?? 0;
	if (first === 10 || first === 127 || first === 0) {
		return true;
	}
	if (first === 169 && second === 254) {
		return true;
	}
	if (first === 192 && second === 168) {
		return true;
	}
	if (first === 172 && second >= 16 && second <= 31) {
		return true;
	}
	return first === 100 && second >= 64 && second <= 127;
};

const isPrivateIpv6 = (ip: string): boolean => {
	if (ip === "::" || ip === "::1") {
		return true;
	}
	if (ip.startsWith("fc") || ip.startsWith("fd")) {
		return true;
	}
	return /^fe[89ab]/u.test(ip);
};

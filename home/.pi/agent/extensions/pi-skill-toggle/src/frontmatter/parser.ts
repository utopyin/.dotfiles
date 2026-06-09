import type { FrontmatterDocument } from "../types.ts";

export interface FrontmatterCodec {
	parse(raw: string): FrontmatterDocument;
}

const emptyDocument = (
	raw: string,
	lineEnding: "\n" | "\r\n",
): FrontmatterDocument => ({
	bodyText: raw,
	contentStart: 0,
	fields: {},
	frontmatterEnd: 0,
	frontmatterStart: 0,
	frontmatterText: "",
	hasFrontmatter: false,
	lineEnding,
	raw,
});

const parseYamlLikeFields = (
	frontmatterText: string,
): Record<string, unknown> => {
	const fields: Record<string, unknown> = {};
	for (const rawLine of frontmatterText.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/u.exec(rawLine);
		if (!match) {
			continue;
		}
		const [_, key, rawValue] = match;
		if (!key) {
			continue;
		}
		fields[key] = parseScalar(rawValue ?? "");
	}
	return fields;
};

const parseScalar = (raw: string): unknown => {
	const value = raw.trim();
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	if (value === "null" || value === "~") {
		return null;
	}
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
};

const parseFrontmatter = (raw: string): FrontmatterDocument => {
	const lineEnding: "\n" | "\r\n" = raw.includes("\r\n") ? "\r\n" : "\n";
	const opening = /^---[ \t]*(\r?\n)/u.exec(raw);
	if (!opening) {
		return emptyDocument(raw, lineEnding);
	}

	const frontmatterStart = opening[0].length;
	const rest = raw.slice(frontmatterStart);
	const closing = /^---[ \t]*(?:\r?\n|$)/mu.exec(rest);
	if (!closing || closing.index === undefined) {
		return emptyDocument(raw, lineEnding);
	}

	const frontmatterEnd = frontmatterStart + closing.index;
	const contentStart = frontmatterEnd + closing[0].length;
	const frontmatterText = raw.slice(frontmatterStart, frontmatterEnd);

	return {
		bodyText: raw.slice(contentStart),
		contentStart,
		fields: parseYamlLikeFields(frontmatterText),
		frontmatterEnd,
		frontmatterStart,
		frontmatterText,
		hasFrontmatter: true,
		lineEnding,
		raw,
	};
};

export class SimpleFrontmatterCodec implements FrontmatterCodec {
	parse = parseFrontmatter;
}

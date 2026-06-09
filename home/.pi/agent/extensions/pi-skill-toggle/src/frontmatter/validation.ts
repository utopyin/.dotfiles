import { basename, dirname } from "node:path";
import type { FrontmatterDocument, SkillDiagnostic } from "../types.ts";

export const deriveSkillMetadata = (
	filePath: string,
	doc: FrontmatterDocument,
): {
	description: string;
	diagnostics: SkillDiagnostic[];
	name: string;
} => {
	const diagnostics: SkillDiagnostic[] = [];
	const parentDirName = basename(dirname(filePath));
	const name = stringField(doc.fields.name) || parentDirName;
	const description = stringField(doc.fields.description);

	if (!doc.hasFrontmatter) {
		diagnostics.push({
			message: "Missing YAML front matter",
			severity: "warning",
		});
	}
	if (!description) {
		diagnostics.push({
			message: "Missing required description; Pi will not load this skill",
			severity: "error",
		});
	}
	if (name !== parentDirName && basename(filePath) === "SKILL.md") {
		diagnostics.push({
			message: `Name does not match parent directory (${parentDirName})`,
			severity: "warning",
		});
	}

	return { description: description || "", diagnostics, name };
};

export const getDisableModelInvocation = (
	doc: FrontmatterDocument,
): boolean => doc.fields["disable-model-invocation"] === true;

const stringField = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

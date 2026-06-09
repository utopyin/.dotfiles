import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillSource } from "../types.ts";

export interface SkillRoot {
	path: string;
	source: SkillSource;
}

const expandHome = (input: string): string => {
	if (input === "~") {
		return homedir();
	}
	if (input.startsWith("~/")) {
		return join(homedir(), input.slice(2));
	}
	return input;
};

export const getAgentDir = (): string => {
	const configured = process.env.PI_CODING_AGENT_DIR?.trim();
	if (configured) {
		return expandHome(configured);
	}
	return join(homedir(), ".pi", "agent");
};

export const getSkillRoots = (cwd: string): SkillRoot[] => {
	const resolvedCwd = resolve(cwd);
	const agentSkillsRoot = join(getAgentDir(), "skills");
	const projectSkillsRoot = resolve(resolvedCwd, ".pi", "skills");
	const legacyProjectSkillsRoot = resolve(resolvedCwd, ".agents", "skills");
	const roots: SkillRoot[] = [
		{
			path: agentSkillsRoot,
			source: { kind: "user", root: agentSkillsRoot },
		},
		{
			path: projectSkillsRoot,
			source: { kind: "project", root: projectSkillsRoot },
		},
		// Pi's current loader focuses on .pi/skills, but README-era installs may still
		// have .agents/skills. Include it as a local editable convenience.
		{
			path: legacyProjectSkillsRoot,
			source: { kind: "project-legacy", root: legacyProjectSkillsRoot },
		},
	];

	const seen = new Set<string>();
	return roots.filter((root) => {
		const key = resolve(root.path);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
};

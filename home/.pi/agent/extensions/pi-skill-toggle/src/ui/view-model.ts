import type { SkillInvocationMode, SkillRecord } from "../types.ts";

export const modeLabel = (mode: SkillInvocationMode): string =>
  mode === "manual-only" ? "Manual-only" : "Agent-invocable";

export const toggleMode = (mode: SkillInvocationMode): SkillInvocationMode =>
  mode === "manual-only" ? "agent-invocable" : "manual-only";

export const skillSearchText = (skill: SkillRecord): string =>
  [
    skill.name,
    skill.description,
    skill.filePath,
    skill.source.kind,
    modeLabel(skill.mode),
  ]
    .join(" ")
    .toLowerCase();

export const filterSkills = (
  skills: SkillRecord[],
  query: string
): SkillRecord[] => {
  const tokens = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) {
    return skills;
  }
  return skills.filter((skill) => {
    const haystack = skillSearchText(skill);
    return tokens.every((token) => haystack.includes(token));
  });
};

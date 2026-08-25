import { getDisableModelInvocation } from "../frontmatter/validation.ts";
import type { FrontmatterDocument, SkillInvocationMode } from "../types.ts";

export const classifyInvocationMode = (
  doc: FrontmatterDocument
): SkillInvocationMode =>
  getDisableModelInvocation(doc) ? "manual-only" : "agent-invocable";

export const formatSourceKind = (kind: string): string => {
  switch (kind) {
    case "user": {
      return "User";
    }
    case "project": {
      return "Project";
    }
    case "project-legacy": {
      return "Project legacy";
    }
    default: {
      return "Unknown";
    }
  }
};

import { describe, expect, it } from "vitest";

import { dependencyAuditFailureDetail } from "./Workspace.ts";

describe(dependencyAuditFailureDetail, () => {
  it("distinguishes an unavailable advisory service from an advisory", () => {
    expect(
      dependencyAuditFailureDetail("error: DNSResolveFailed fetching package")
    ).toBe("audit unavailable: could not reach the npm advisory service");
  });

  it("reports an actionable high-severity advisory", () => {
    expect(dependencyAuditFailureDetail("1 vulnerability (high)")).toBe(
      "high-severity advisory found; run bun audit --audit-level=high"
    );
  });
});

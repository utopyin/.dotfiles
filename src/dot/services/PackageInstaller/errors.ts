import * as Data from "effect/Data";

export class PackageInstallerConfigurationError extends Data.TaggedError(
  "PackageInstallerConfigurationError"
)<{
  readonly detail: string;
  readonly manager: string;
}> {
  override get message(): string {
    return `${this.manager} package installer is not configured: ${this.detail}`;
  }
}

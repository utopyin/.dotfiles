import * as Data from "effect/Data";

export class HyprlandConfigError extends Data.TaggedError(
  "HyprlandConfigError"
)<{
  readonly errors: string;
}> {
  override get message(): string {
    return `Hyprland configuration is invalid:\n${this.errors}`;
  }
}

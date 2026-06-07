import * as Data from "effect/Data";

export class CommandExecutionError extends Data.TaggedError(
  "CommandExecutionError"
)<{
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode?: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    const rendered = [this.command, ...this.args].join(" ");
    const parts = [`Command failed: ${rendered}`];

    if (this.exitCode !== undefined) {
      parts.push(`exit code: ${this.exitCode}`);
    }

    if (this.stderr.length > 0) {
      parts.push(`stderr:\n${this.stderr}`);
    }

    if (this.stdout.length > 0) {
      parts.push(`stdout:\n${this.stdout}`);
    }

    return parts.join("\n");
  }
}

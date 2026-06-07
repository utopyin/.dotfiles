import * as Data from "effect/Data";

export class SecretManagerError extends Data.TaggedError("SecretManagerError")<{
  readonly operation: string;
  readonly provider: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.provider} ${this.operation} failed: ${this.reason}`;
  }
}

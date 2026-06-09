import * as Data from "effect/Data";

export class SecretNameError extends Data.TaggedError("SecretNameError")<{
  readonly name: string;
}> {
  override get message(): string {
    return `Secret name must be a shell env var name like SOME_API_KEY: ${this.name}`;
  }
}

export class SecretValueError extends Data.TaggedError("SecretValueError")<{
  readonly reason: "empty";
}> {
  override get message(): string {
    return this.reason === "empty"
      ? "Secret value cannot be empty"
      : this.reason;
  }
}

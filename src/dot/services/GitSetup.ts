import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { DotfilesConfig } from "../Config.ts";
import { CommandExecutor } from "./CommandExecutor/index.ts";

export interface GitIdentity {
  readonly email: string;
  readonly name: string;
}

export interface GitSetupStatus {
  readonly autoSetupRemoteConfigured: boolean;
  readonly emailConfigured: boolean;
  readonly githubAuthenticated: boolean;
  readonly githubCredentialHelperConfigured: boolean;
  readonly nameConfigured: boolean;
  readonly signingConfigured: boolean;
  readonly signingKeyAvailable: boolean;
}

export class GitHubIdentityError extends Data.TaggedError(
  "GitHubIdentityError"
)<{
  readonly reason: string;
}> {
  override get message(): string {
    return `Could not derive Git identity from GitHub: ${this.reason}`;
  }
}

export const parseGitHubIdentity = Effect.fn("GitSetup.parseGitHubIdentity")(
  function* (output: string) {
    const user = yield* Effect.try({
      catch: (cause) =>
        new GitHubIdentityError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => JSON.parse(output) as Record<string, unknown>,
    });

    const login = typeof user.login === "string" ? user.login.trim() : "";
    const id =
      typeof user.id === "number" || typeof user.id === "string"
        ? String(user.id).trim()
        : "";
    if (login.length === 0 || id.length === 0) {
      return yield* new GitHubIdentityError({
        reason: "the response did not contain a login and numeric id",
      });
    }

    const publicName = typeof user.name === "string" ? user.name.trim() : "";
    const publicEmail = typeof user.email === "string" ? user.email.trim() : "";

    return {
      email:
        publicEmail.length > 0
          ? publicEmail
          : `${id}+${login}@users.noreply.github.com`,
      name: publicName.length > 0 ? publicName : login,
    } satisfies GitIdentity;
  }
);

export const renderGitIdentityConfig = (identity: GitIdentity) => `[user]
\tname = ${JSON.stringify(identity.name)}
\temail = ${JSON.stringify(identity.email)}
`;

export class GitSetup extends Context.Service<GitSetup>()("dot/GitSetup", {
  make: Effect.gen(function* () {
    const command = yield* CommandExecutor;
    const config = yield* DotfilesConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return {
      configureIdentity: Effect.fn("GitSetup.configureIdentity")(function* () {
        const output = yield* command.runText("gh", ["api", "user"]).pipe(
          Effect.mapError(
            () =>
              new GitHubIdentityError({
                reason: "run gh auth login, then rerun dot init",
              })
          )
        );
        const identity = yield* parseGitHubIdentity(output);
        yield* fs.makeDirectory(path.dirname(config.gitIdentityConfigPath), {
          recursive: true,
        });
        yield* fs.writeFileString(
          config.gitIdentityConfigPath,
          renderGitIdentityConfig(identity)
        );
        yield* fs.chmod(config.gitIdentityConfigPath, 0o600);
      }),

      status: Effect.fn("GitSetup.status")(function* () {
        const [
          name,
          email,
          signingFormat,
          signCommits,
          keyCommand,
          key,
          credentialHelper,
          autoSetupRemote,
          githubAuthenticated,
        ] = yield* Effect.all([
          readGitConfig("user.name"),
          readGitConfig("user.email"),
          readGitConfig("gpg.format"),
          readGitConfig("commit.gpgSign"),
          readGitConfig("gpg.ssh.defaultKeyCommand"),
          command
            .runText(config.gitSshSigningKeyCommandPath)
            .pipe(Effect.option),
          readGitConfig("credential.https://github.com.helper"),
          readGitConfig("push.autoSetupRemote"),
          command
            .run("gh", ["auth", "status", "--hostname", "github.com"])
            .pipe(
              Effect.as(true),
              Effect.catchCause(() => Effect.succeed(false))
            ),
        ]).pipe(Effect.provideService(CommandExecutor, command));

        return {
          autoSetupRemoteConfigured: optionEquals(autoSetupRemote, "true"),
          emailConfigured: optionHasText(email),
          githubAuthenticated,
          githubCredentialHelperConfigured: optionIncludes(
            credentialHelper,
            "gh auth git-credential"
          ),
          nameConfigured: optionHasText(name),
          signingConfigured:
            optionEquals(signingFormat, "ssh") &&
            optionEquals(signCommits, "true") &&
            optionHasText(keyCommand),
          signingKeyAvailable: optionHasText(key),
        } satisfies GitSetupStatus;
      }),
    } as const;
  }),
}) {
  static readonly Live = Layer.effect(this, this.make);
}

const readGitConfig = Effect.fn("GitSetup.readGitConfig")(function* (
  key: string
) {
  const command = yield* CommandExecutor;
  return yield* command
    .runText("git", ["config", "--global", "--includes", "--get", key])
    .pipe(Effect.option);
});

const optionHasText = (value: Option.Option<string>) =>
  Option.isSome(value) && value.value.trim().length > 0;

const optionEquals = (value: Option.Option<string>, expected: string) =>
  Option.isSome(value) && value.value.trim().toLowerCase() === expected;

const optionIncludes = (value: Option.Option<string>, expected: string) =>
  Option.isSome(value) && value.value.includes(expected);

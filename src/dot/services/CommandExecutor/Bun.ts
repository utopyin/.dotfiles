import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { CommandExecutionError } from "./errors.ts";
import type { CommandExecutorShape, CommandResult } from "./types.ts";

export const makeBunCommandExecutor = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const run = Effect.fn("CommandExecutor.run")(function* (
    command: string,
    args: readonly string[] = [],
    options: { readonly cwd?: string } = {}
  ) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const process = ChildProcess.make(command, args, {
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          stderr: "pipe",
          stdout: "pipe",
        });
        const handle = yield* spawner.spawn(process).pipe(
          Effect.mapError(
            (cause) =>
              new CommandExecutionError({
                args,
                cause,
                command,
                stderr: "",
                stdout: "",
              })
          )
        );
        const [stdout, stderr] = yield* Effect.all([
          collectStream(handle.stdout),
          collectStream(handle.stderr),
        ]);
        const exitCode = Number(
          yield* handle.exitCode.pipe(
            Effect.mapError(
              (cause) =>
                new CommandExecutionError({
                  args,
                  cause,
                  command,
                  stderr,
                  stdout,
                })
            )
          )
        );
        const result: CommandResult = {
          args,
          command,
          exitCode,
          stderr,
          stdout,
        };
        if (exitCode !== 0) {
          return yield* new CommandExecutionError({
            args,
            command,
            exitCode,
            stderr,
            stdout,
          });
        }
        return result;
      })
    );
  });

  const runText = Effect.fn("CommandExecutor.runText")(function* (
    command: string,
    args: readonly string[] = [],
    options: { readonly cwd?: string } = {}
  ) {
    const result = yield* run(command, args, options);
    return result.stdout.trimEnd();
  });

  const runInteractive = Effect.fn("CommandExecutor.runInteractive")(function* (
    command: string,
    args: readonly string[] = [],
    options: { readonly cwd?: string } = {}
  ) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const process = ChildProcess.make(command, args, {
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          stderr: "inherit",
          stdin: "inherit",
          stdout: "inherit",
        });
        const handle = yield* spawner.spawn(process).pipe(
          Effect.mapError(
            (cause) =>
              new CommandExecutionError({
                args,
                cause,
                command,
                stderr: "",
                stdout: "",
              })
          )
        );
        const exitCode = Number(
          yield* handle.exitCode.pipe(
            Effect.mapError(
              (cause) =>
                new CommandExecutionError({
                  args,
                  cause,
                  command,
                  stderr: "",
                  stdout: "",
                })
            )
          )
        );
        if (exitCode !== 0) {
          return yield* new CommandExecutionError({
            args,
            command,
            exitCode,
            stderr: "",
            stdout: "",
          });
        }
      })
    );
  });

  const exists = Effect.fn("CommandExecutor.exists")(function* (
    command: string
  ) {
    return yield* run("/bin/sh", [
      "-lc",
      `command -v ${JSON.stringify(command)} >/dev/null 2>&1`,
    ]).pipe(
      Effect.as(true),
      Effect.catchCause(() => Effect.succeed(false))
    );
  });

  return {
    exists,
    run,
    runInteractive,
    runText,
  } satisfies CommandExecutorShape;
});

const collectStream = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.orElseSucceed(() => "")
  );

import {
  mkdtemp,
  mkdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, describe, expect, it } from "vitest";

import { CommandExecutor } from "../CommandExecutor/index.ts";
import type {
  CommandExecutorShape,
  CommandResult,
} from "../CommandExecutor/types.ts";
import { PlatformInfo } from "../PlatformInfo.ts";
import { makeStowConfigLinker } from "./Stow.ts";

const temporaryDirectories: string[] = [];

describe("StowConfigLinker", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true }))
    );
  });

  it("keeps live Hyprland module links present while applying config", async () => {
    const root = await mkdtemp(join(tmpdir(), "dot-stow-test-"));
    temporaryDirectories.push(root);
    const dotfilesDir = join(root, "repo");
    const homeDir = join(root, "home");
    const sourceHyprDir = join(dotfilesDir, "home", "linux", ".config", "hypr");
    const targetHyprDir = join(homeDir, ".config", "hypr");
    await mkdir(join(dotfilesDir, "home", "common"), { recursive: true });
    await mkdir(sourceHyprDir, { recursive: true });
    await mkdir(targetHyprDir, { recursive: true });

    for (const fileName of [
      "autostart.lua",
      "bindings.lua",
      "input.lua",
      "monitors.lua",
    ]) {
      const sourcePath = join(sourceHyprDir, fileName);
      const targetPath = join(targetHyprDir, fileName);
      await writeFile(sourcePath, "-- valid\n");
      await symlink(relative(dirname(targetPath), sourcePath), targetPath);
    }

    const calls: CommandResult[] = [];
    const command = makeCommandExecutor(calls);
    await Effect.runPromise(
      Effect.gen(function* () {
        const linker = yield* makeStowConfigLinker;
        yield* linker.linkHome(dotfilesDir, homeDir);
      }).pipe(
        Effect.provideService(CommandExecutor, command),
        Effect.provideService(PlatformInfo, {
          architecture: "x64",
          distroId: "omarchy",
          distroLike: ["arch"],
          os: "linux",
        }),
        Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))
      )
    );

    for (const fileName of [
      "autostart.lua",
      "bindings.lua",
      "input.lua",
      "monitors.lua",
    ]) {
      const sourcePath = join(sourceHyprDir, fileName);
      const targetPath = join(targetHyprDir, fileName);
      await expect(readlink(targetPath)).resolves.toBe(
        relative(dirname(targetPath), sourcePath)
      );
    }

    const stowCall = calls.find((call) => call.command === "stow");
    expect(stowCall?.args).toContain(
      "\\.config/hypr/(autostart|bindings|input|monitors)\\.lua$"
    );
  });
});

const makeCommandExecutor = (calls: CommandResult[]): CommandExecutorShape => ({
  exists: () => Effect.succeed(false),
  run: (command, args = []) => {
    const result = {
      args,
      command,
      exitCode: 0,
      stderr: "",
      stdout: "",
    } satisfies CommandResult;
    calls.push(result);
    return Effect.succeed(result);
  },
  runInteractive: () => Effect.void,
  runText: () => Effect.succeed(""),
});

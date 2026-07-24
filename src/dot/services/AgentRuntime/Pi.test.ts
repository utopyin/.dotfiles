import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, describe, expect, test } from "vitest";

import {
  discoverExtensionPackageDirs,
  linkExtensionNodeModules,
} from "./Pi.ts";

const tempDirs: string[] = [];

describe("Pi extension package discovery", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((tempDir) => rm(tempDir, { force: true, recursive: true }))
    );
  });

  test("finds tracked and live dirs for Stow-linked extensions", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dot-pi-extensions-"));
    tempDirs.push(tempDir);

    const trackedPackageDir = join(tempDir, "tracked", "web-tools");
    const liveExtensionsDir = join(tempDir, "live");
    const livePackageDir = join(liveExtensionsDir, "web-tools");
    await mkdir(trackedPackageDir, { recursive: true });
    await mkdir(livePackageDir, { recursive: true });
    await writeFile(join(liveExtensionsDir, ".DS_Store"), "");
    await writeFile(
      join(trackedPackageDir, "package.json"),
      JSON.stringify({ dependencies: { "html-to-text": "^9.0.5" } })
    );
    await symlink(
      join(trackedPackageDir, "package.json"),
      join(livePackageDir, "package.json")
    );

    const packageDirs = await Effect.runPromise(
      discoverExtensionPackageDirs(liveExtensionsDir).pipe(
        Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))
      )
    );

    const installDir = await realpath(trackedPackageDir);
    const canonicalLivePackageDir = await realpath(livePackageDir);
    expect(packageDirs).toStrictEqual([
      { installDir, liveDir: canonicalLivePackageDir },
    ]);

    await mkdir(join(installDir, "node_modules"));
    await writeFile(join(installDir, "node_modules", "dependency.js"), "");
    await mkdir(join(livePackageDir, "node_modules"));
    await writeFile(join(livePackageDir, "node_modules", "stale.js"), "");

    await Effect.runPromise(
      linkExtensionNodeModules({
        installDir,
        liveDir: canonicalLivePackageDir,
      }).pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)))
    );

    const linkedNodeModules = await realpath(
      join(livePackageDir, "node_modules")
    );
    const installedNodeModules = await realpath(
      join(installDir, "node_modules")
    );
    expect(linkedNodeModules).toBe(installedNodeModules);
  });
});

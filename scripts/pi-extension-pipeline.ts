#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";

const enabledExtensionFiles = [
  "home/.pi/agent/extensions/git-interceptor.ts",
  "home/.pi/agent/extensions/git-status-widget.ts",
  "home/.pi/agent/extensions/openai-codex-fast-mode.ts",
  "home/.pi/agent/extensions/plannotator-last-shortcut.ts",
  "home/.pi/agent/extensions/whimsical.ts",
  "home/.pi/agent/extensions/yeet.ts",
  "home/.pi/agent/extensions/zsh-user-bash.ts",
] as const;

const pendingExtensionGroups = [
  "home/.pi/agent/extensions/pi-cloak/index.ts",
  "home/.pi/agent/extensions/pi-mcp/src/**/*.ts",
  "home/.pi/agent/extensions/pi-skill-toggle/src/**/*.ts",
  "home/.pi/agent/extensions/todos/index.ts",
] as const;

type Mode = "check" | "fix";

const [_bunExecutable, _scriptPath, mode] = process.argv;

if (mode !== "check" && mode !== "fix") {
  console.error("Usage: bun run scripts/pi-extension-pipeline.ts <check|fix>");
  process.exit(2);
}

const run = async (command: string[], options?: { stdin?: string }) => {
  const proc = Bun.spawn(command, {
    stderr: "pipe",
    stdin: options?.stdin ? "pipe" : "ignore",
    stdout: "pipe",
  });

  if (options?.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout };
};

const formatFile = async (file: string, pipelineMode: Mode) => {
  const original = await readFile(file, "utf-8");
  const result = await run(["bunx", "oxfmt", "--stdin-filepath", file], {
    stdin: original,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `oxfmt failed for ${file}\n${result.stdout}${result.stderr}`.trimEnd()
    );
  }

  if (result.stdout === original) {
    return false;
  }

  if (pipelineMode === "fix") {
    await writeFile(file, result.stdout, "utf-8");
    console.log(`formatted ${file}`);
    return true;
  }

  console.error(`format mismatch: ${file}`);
  return true;
};

let hasFormatMismatches = false;
for (const file of enabledExtensionFiles) {
  const changed = await formatFile(file, mode);
  hasFormatMismatches ||= changed;
}

if (mode === "check" && hasFormatMismatches) {
  console.error(
    "Run `bun run fix:pi-extensions` to format enabled Pi extensions."
  );
  process.exit(1);
}

const lintResult = await run([
  "bunx",
  "oxlint",
  "--no-ignore",
  ...enabledExtensionFiles,
]);

if (lintResult.stdout) {
  process.stdout.write(lintResult.stdout);
}
if (lintResult.stderr) {
  process.stderr.write(lintResult.stderr);
}
if (lintResult.exitCode !== 0) {
  process.exit(lintResult.exitCode);
}

if (pendingExtensionGroups.length > 0) {
  console.log(
    [
      "Pi extension pipeline enabled for strict lint/format targets.",
      "Pending strict enablement:",
      ...pendingExtensionGroups.map((entry) => `  - ${entry}`),
    ].join("\n")
  );
}

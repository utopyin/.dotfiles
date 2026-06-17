import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const UPDATE_INTERVAL_MS = 2000;
const WIDGET_ID = "git-status-widget";

const countUnstagedFiles = (statusOutput: string) => {
  if (statusOutput.length === 0) {
    return 0;
  }

  let count = 0;
  for (const line of statusOutput.split("\n")) {
    if (line.startsWith("??") || line[1] !== " ") {
      count += 1;
    }
  }
  return count;
};

const getBranch = async (cwd: string) => {
  const branch = await runGit(["branch", "--show-current"], cwd);
  if (branch.length > 0) {
    return branch;
  }

  const head = await runGit(["rev-parse", "--short", "HEAD"], cwd);
  return head.length > 0 ? `detached@${head}` : "unknown";
};

const getUnstagedCount = async (cwd: string) => {
  const status = await runGit(
    ["status", "--porcelain", "--untracked-files=normal"],
    cwd
  );
  return countUnstagedFiles(status);
};

const runGit = async (args: string[], cwd: string) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1_048_576,
    timeout: 2000,
  });
  return stdout.trimEnd();
};

const updateWidget = async (ctx: ExtensionContext) => {
  if (!ctx.hasUI) {
    return;
  }

  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], ctx.cwd);
    const [branch, unstagedCount] = await Promise.all([
      getBranch(ctx.cwd),
      getUnstagedCount(ctx.cwd),
    ]);

    const fileLabel = unstagedCount === 1 ? "file" : "files";
    ctx.ui.setWidget(WIDGET_ID, [
      ` ${branch} · ${unstagedCount} unstaged ${fileLabel}`,
    ]);
  } catch {
    ctx.ui.setWidget(WIDGET_ID, undefined);
  }
};

export default function gitStatusWidget(pi: ExtensionAPI) {
  let interval: NodeJS.Timeout | undefined;

  pi.on("session_start", async (_event, ctx) => {
    if (interval) {
      clearInterval(interval);
    }

    await updateWidget(ctx);
    interval = setInterval(() => {
      void updateWidget(ctx);
    }, UPDATE_INTERVAL_MS);
  });

  pi.on("input", async (_event, ctx) => {
    await updateWidget(ctx);
    return { action: "continue" };
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    await updateWidget(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
    if (ctx.hasUI) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
    }
  });
}

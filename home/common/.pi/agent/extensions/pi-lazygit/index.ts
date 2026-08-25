import { spawn } from "node:child_process";
import { once } from "node:events";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

const runFullscreenProcess = async (
  command: string,
  args: readonly string[],
  tui: TUI
): Promise<void> => {
  tui.stop();
  process.stdout.write("\u001B[2J\u001B[H");

  try {
    const child = spawn(command, [...args], {
      env: process.env,
      stdio: "inherit",
    });
    await once(child, "close");
  } finally {
    tui.start();
    tui.requestRender(true);
  }
};

const openLazygit = async (ctx: ExtensionContext): Promise<void> => {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("lazygit requires TUI mode", "error");
    return;
  }

  await ctx.ui.custom((tui, _theme, _keybindings, done) => {
    void (async () => {
      try {
        await runFullscreenProcess("lazygit", [], tui);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to start lazygit: ${message}`, "error");
      }
      done(null);
    })();

    return {
      invalidate: () => false,
      render: () => [],
    };
  });
};

export default function lazygit(pi: ExtensionAPI) {
  pi.registerCommand("lazygit", {
    description: "Open lazygit fullscreen",
    handler: async (_args, ctx) => {
      await openLazygit(ctx);
    },
  });

  pi.registerShortcut("alt+l", {
    description: "Open lazygit",
    handler: openLazygit,
  });
}

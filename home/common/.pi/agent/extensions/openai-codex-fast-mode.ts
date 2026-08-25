import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const SERVICE_TIER = "priority";
const STATUS_KEY = "openai-codex-fast-mode";

const updateStatus = (
  ctx: ExtensionContext,
  enabled: boolean,
  provider = ctx.model?.provider
) => {
  if (provider !== "openai-codex") {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }

  const color = enabled ? "accent" : "dim";
  const state = enabled ? "ON" : "OFF";
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color, `Priority: ${state}`));
};

export default function openaiCodexFastMode(pi: ExtensionAPI) {
  let enabled = true;

  pi.on("session_start", (_event, ctx) => {
    updateStatus(ctx, enabled);
  });

  pi.on("model_select", (event, ctx) => {
    updateStatus(ctx, enabled, event.model.provider);
  });

  pi.registerCommand("enable-fast", {
    description: "Enable fast mode for OpenAI Codex requests",
    // oxlint-disable-next-line require-await
    handler: async (_args, ctx) => {
      enabled = true;
      updateStatus(ctx, enabled);
      ctx.ui.notify("OpenAI Codex fast mode enabled", "info");
    },
  });

  pi.registerCommand("disable-fast", {
    description: "Disable fast mode for OpenAI Codex requests",
    // oxlint-disable-next-line require-await
    handler: async (_args, ctx) => {
      enabled = false;
      updateStatus(ctx, enabled);
      ctx.ui.notify("OpenAI Codex fast mode disabled", "info");
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (
      !enabled ||
      ctx.model?.provider !== "openai-codex" ||
      typeof event.payload !== "object" ||
      event.payload === null ||
      Array.isArray(event.payload)
    ) {
      return;
    }

    return {
      ...(event.payload as Record<string, unknown>),
      service_tier: SERVICE_TIER,
    };
  });
}

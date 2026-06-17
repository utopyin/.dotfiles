import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const COMMAND_NAME = "plannotator-last";
const PLANNOTATOR_ROOT = `${process.env.HOME ?? "/Users/utopy"}/.pi/agent/npm/node_modules/@plannotator/pi-extension`;

interface PiSessionIdentity {
  cwd?: string;
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
}

interface AssistantMessageSnapshot {
  entryId: string;
  text: string;
}

interface AnnotationDecision {
  approved?: boolean;
  exit?: boolean;
  feedback?: string;
  feedbackScope?: "message" | "messages";
  selectedMessageId?: string;
}

interface AnnotationSession {
  waitForDecision: () => Promise<AnnotationDecision>;
}

interface CurrentPiSessionRegistration {
  clear: () => void;
  update: (ctx: ExtensionContext) => void;
}

type SendUserMessageContent = Parameters<ExtensionAPI["sendUserMessage"]>[0];
type SendUserMessageOptions = Parameters<ExtensionAPI["sendUserMessage"]>[1];

type CurrentSessionSendResult =
  | { ok: true }
  | {
      error: unknown;
      ok: false;
      reason: "no-current" | "same-session" | "send-failed";
    };

interface PlannotatorModules {
  findAssistantMessageByEntryId: (
    ctx: ExtensionContext,
    entryId: string
  ) => AssistantMessageSnapshot | undefined;
  getAnnotateMessageFeedbackPrompt: (
    runtime: "pi",
    config: unknown,
    options: { feedback: string }
  ) => string;
  getLastAssistantMessageSnapshot: (
    ctx: ExtensionContext
  ) => AssistantMessageSnapshot | undefined;
  getPiSessionIdentity: (ctx: ExtensionContext) => PiSessionIdentity;
  getRecentAssistantMessages: (
    ctx: ExtensionContext,
    limit: number
  ) => unknown[];
  getStartupErrorMessage: (error: unknown) => string;
  hasPlanBrowserHtml: () => boolean;
  hasSessionMovedPastEntry: (ctx: ExtensionContext, entryId: string) => boolean;
  isCurrentPiSessionDifferentFrom: (origin: PiSessionIdentity) => boolean;
  loadConfig: () => unknown;
  notifyCurrentPiSession: (
    message: string,
    type: "info" | "warning" | "error",
    origin?: PiSessionIdentity
  ) => boolean;
  parseAnnotateArgs: (args: string) => { gate?: boolean };
  registerCurrentPiSession: (pi: ExtensionAPI) => CurrentPiSessionRegistration;
  sendUserMessageToCurrentPiSession: (
    content: SendUserMessageContent,
    options?: SendUserMessageOptions,
    origin?: PiSessionIdentity
  ) => CurrentSessionSendResult;
  startLastMessageAnnotationSession: (
    ctx: ExtensionContext,
    text: string,
    gate: boolean | undefined,
    pickerMessages: unknown[] | undefined
  ) => Promise<AnnotationSession>;
  withCurrentPiSessionFallbackHeader: (
    content: SendUserMessageContent
  ) => SendUserMessageContent;
}

let plannotatorModulesPromise: Promise<PlannotatorModules> | undefined;

const loadPlannotatorModules = (): Promise<PlannotatorModules> => {
  plannotatorModulesPromise ??= (async () => {
    const [
      assistantMessage,
      annotateArgs,
      config,
      prompts,
      currentPiSession,
      events,
    ] = await Promise.all([
      import(`${PLANNOTATOR_ROOT}/assistant-message.ts`),
      import(`${PLANNOTATOR_ROOT}/generated/annotate-args.ts`),
      import(`${PLANNOTATOR_ROOT}/generated/config.ts`),
      import(`${PLANNOTATOR_ROOT}/generated/prompts.ts`),
      import(`${PLANNOTATOR_ROOT}/current-pi-session.ts`),
      import(`${PLANNOTATOR_ROOT}/plannotator-events.ts`),
    ]);

    return {
      findAssistantMessageByEntryId:
        assistantMessage.findAssistantMessageByEntryId,
      getAnnotateMessageFeedbackPrompt:
        prompts.getAnnotateMessageFeedbackPrompt,
      getLastAssistantMessageSnapshot:
        assistantMessage.getLastAssistantMessageSnapshot,
      getPiSessionIdentity: currentPiSession.getPiSessionIdentity,
      getRecentAssistantMessages: assistantMessage.getRecentAssistantMessages,
      getStartupErrorMessage: events.getStartupErrorMessage,
      hasPlanBrowserHtml: events.hasPlanBrowserHtml,
      hasSessionMovedPastEntry: assistantMessage.hasSessionMovedPastEntry,
      isCurrentPiSessionDifferentFrom:
        currentPiSession.isCurrentPiSessionDifferentFrom,
      loadConfig: config.loadConfig,
      notifyCurrentPiSession: currentPiSession.notifyCurrentPiSession,
      parseAnnotateArgs: annotateArgs.parseAnnotateArgs,
      registerCurrentPiSession: currentPiSession.registerCurrentPiSession,
      sendUserMessageToCurrentPiSession:
        currentPiSession.sendUserMessageToCurrentPiSession,
      startLastMessageAnnotationSession:
        events.startLastMessageAnnotationSession,
      withCurrentPiSessionFallbackHeader:
        currentPiSession.withCurrentPiSessionFallbackHeader,
    } satisfies PlannotatorModules;
  })();

  return plannotatorModulesPromise;
};

const excerptText = (text: string, maxChars = 1000): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars).trimEnd()}...`;
};

const blockquote = (text: string): string =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

const anchorMessageFeedback = (
  feedback: string,
  originalMessage: string
): string => `This feedback applies to the earlier assistant response excerpted below:

${blockquote(excerptText(originalMessage))}

User feedback:
${feedback}`;

const safeNotify = (
  modules: PlannotatorModules,
  ctx: ExtensionContext,
  message: string,
  type: "info" | "warning" | "error" = "info",
  origin?: PiSessionIdentity
): void => {
  try {
    ctx.ui.notify(message, type);
  } catch (error) {
    if (modules.notifyCurrentPiSession(message, type, origin)) {
      return;
    }
    console.error(
      `Plannotator notification failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const reportBackgroundError = (
  modules: PlannotatorModules,
  ctx: ExtensionContext,
  message: string,
  error: unknown,
  origin?: PiSessionIdentity
): void => {
  const detail = modules.getStartupErrorMessage(error);
  console.error(`${message}: ${detail}`);
  safeNotify(modules, ctx, `${message}: ${detail}`, "error", origin);
};

const shouldAnchorLastMessageFeedback = (
  modules: PlannotatorModules,
  ctx: ExtensionContext,
  entryId: string,
  origin: PiSessionIdentity
): boolean => {
  if (modules.isCurrentPiSessionDifferentFrom(origin)) {
    return true;
  }
  try {
    return modules.hasSessionMovedPastEntry(ctx, entryId);
  } catch {
    return true;
  }
};

const reportCurrentSessionSendFailure = (
  modules: PlannotatorModules,
  errorMessage: string,
  error: unknown,
  origin: PiSessionIdentity
): void => {
  const detail = modules.getStartupErrorMessage(error);
  console.error(`${errorMessage}: ${detail}`);
  modules.notifyCurrentPiSession(`${errorMessage}: ${detail}`, "error", origin);
};

const trySendUserMessageToDifferentCurrentSession = (
  modules: PlannotatorModules,
  content: SendUserMessageContent,
  options: SendUserMessageOptions,
  errorMessage: string,
  origin: PiSessionIdentity
): boolean => {
  const result = modules.sendUserMessageToCurrentPiSession(
    modules.withCurrentPiSessionFallbackHeader(content),
    options,
    origin
  );
  if (result.ok) {
    return true;
  }
  if (result.reason === "send-failed") {
    reportCurrentSessionSendFailure(
      modules,
      errorMessage,
      result.error,
      origin
    );
    return true;
  }
  return false;
};

const sendUserMessageWithCurrentSessionFallback = (
  modules: PlannotatorModules,
  pi: ExtensionAPI,
  content: SendUserMessageContent,
  options: SendUserMessageOptions,
  errorMessage: string,
  origin: PiSessionIdentity
): void => {
  if (
    trySendUserMessageToDifferentCurrentSession(
      modules,
      content,
      options,
      errorMessage,
      origin
    )
  ) {
    return;
  }

  try {
    pi.sendUserMessage(content, options);
  } catch (error) {
    if (
      trySendUserMessageToDifferentCurrentSession(
        modules,
        content,
        options,
        errorMessage,
        origin
      )
    ) {
      return;
    }
    throw error;
  }
};

const handleAnnotationDecision = (
  modules: PlannotatorModules,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  origin: PiSessionIdentity,
  snapshot: AssistantMessageSnapshot,
  result: AnnotationDecision
): void => {
  if (result.exit) {
    safeNotify(modules, ctx, "Annotation session closed.", "info", origin);
    return;
  }
  if (result.approved) {
    safeNotify(modules, ctx, "Message approved.", "info", origin);
    return;
  }
  if (!result.feedback) {
    safeNotify(
      modules,
      ctx,
      "Annotation closed (no feedback).",
      "info",
      origin
    );
    return;
  }

  const target =
    result.selectedMessageId && result.selectedMessageId !== snapshot.entryId
      ? (modules.findAssistantMessageByEntryId(ctx, result.selectedMessageId) ??
        snapshot)
      : snapshot;
  const feedback =
    result.feedbackScope !== "messages" &&
    shouldAnchorLastMessageFeedback(modules, ctx, target.entryId, origin)
      ? anchorMessageFeedback(result.feedback, target.text)
      : result.feedback;

  sendUserMessageWithCurrentSessionFallback(
    modules,
    pi,
    modules.getAnnotateMessageFeedbackPrompt("pi", modules.loadConfig(), {
      feedback,
    }),
    { deliverAs: "followUp" },
    "Plannotator message annotation feedback could not be sent",
    origin
  );
};

const openLastAssistantMessageAnnotation = async (
  modules: PlannotatorModules,
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionContext
): Promise<void> => {
  const { gate } = modules.parseAnnotateArgs(args);

  if (!modules.hasPlanBrowserHtml()) {
    ctx.ui.notify(
      "Annotation UI not available. Run 'bun run build' in the pi-extension directory.",
      "error"
    );
    return;
  }

  const origin = modules.getPiSessionIdentity(ctx);
  const snapshot = modules.getLastAssistantMessageSnapshot(ctx);
  if (!snapshot) {
    ctx.ui.notify("No assistant message found in session.", "error");
    return;
  }

  const recent = modules.getRecentAssistantMessages(ctx, 25);
  const pickerMessages = recent.length > 1 ? recent : undefined;

  ctx.ui.notify("Opening annotation UI for last message...", "info");

  try {
    const session = await modules.startLastMessageAnnotationSession(
      ctx,
      snapshot.text,
      gate,
      pickerMessages
    );
    ctx.ui.notify(
      "Last-message annotation opened. You can keep chatting while it runs.",
      "info"
    );

    void (async () => {
      try {
        const result = await session.waitForDecision();
        handleAnnotationDecision(modules, pi, ctx, origin, snapshot, result);
      } catch (error) {
        reportBackgroundError(
          modules,
          ctx,
          "Plannotator message annotation session failed",
          error,
          origin
        );
      }
    })();
  } catch (error) {
    ctx.ui.notify(
      `Failed to start annotation UI: ${modules.getStartupErrorMessage(error)}`,
      "error"
    );
  }
};

export default async function plannotatorLastShortcut(pi: ExtensionAPI) {
  const modules = await loadPlannotatorModules();
  const currentPiSession = modules.registerCurrentPiSession(pi);

  pi.on("session_start", (_event, ctx) => {
    currentPiSession.update(ctx);
  });

  pi.on("session_shutdown", () => {
    currentPiSession.clear();
  });

  pi.registerShortcut("alt+o", {
    description: "Annotate the last assistant message with Plannotator",
    handler: async (ctx) => {
      const hasPlannotatorLast = pi
        .getCommands()
        .some((command) => command.name === COMMAND_NAME);

      if (!hasPlannotatorLast) {
        ctx.ui.notify(`/${COMMAND_NAME} is not loaded.`, "error");
        return;
      }

      await openLastAssistantMessageAnnotation(modules, pi, "", ctx);
    },
  });
}

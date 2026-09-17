export const ASK_USER_NOTIFICATION_DELAY_MS = 15_000;
export const ASK_USER_NOTIFICATION_KEY_ENV = "BRRR_API_KEY";

const BRRR_SEND_URL = "https://api.brrr.now/v1/send";
const NOTIFICATION_EXPIRATION_MS = 5 * 60_000;

export interface AskUserNotification {
  readonly question: string;
  readonly context?: string;
}

export interface BrrrNotificationPayload {
  readonly title: string;
  readonly subtitle: string;
  readonly message: string;
  readonly thread_id: string;
  readonly sound: "brrr";
  readonly expiration_date: string;
  readonly interruption_level: "time-sensitive";
}

interface NotificationRuntime {
  readonly schedule: (task: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
  readonly now: () => number;
  readonly post: (
    apiKey: string,
    payload: BrrrNotificationPayload,
  ) => Promise<void>;
}

const notificationRuntime: NotificationRuntime = {
  schedule: (task, delayMs) => setTimeout(task, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: Date.now,
  post: async (apiKey, payload) => {
    const response = await fetch(BRRR_SEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Push notification failed with HTTP ${response.status}`);
    }
  },
};

export function buildNotificationPayload(
  notification: AskUserNotification,
  now: number,
): BrrrNotificationPayload {
  const context = notification.context?.trim();

  return {
    title: "Pi Agent",
    subtitle: context
      ? `Waiting for your answer in ${context}`
      : "Waiting for your answer",
    message: notification.question,
    thread_id: context ? `pi-agent:${context}` : "pi-agent",
    sound: "brrr",
    expiration_date: new Date(now + NOTIFICATION_EXPIRATION_MS).toISOString(),
    interruption_level: "time-sensitive",
  };
}

export function scheduleUnansweredNotification(
  notification: AskUserNotification,
  apiKey: string | undefined,
  runtime: NotificationRuntime = notificationRuntime,
): () => void {
  if (!apiKey) return () => {};

  let waitingForAnswer = true;
  const timer = runtime.schedule(() => {
    if (!waitingForAnswer) return;
    waitingForAnswer = false;
    void runtime
      .post(apiKey, buildNotificationPayload(notification, runtime.now()))
      .catch(() => undefined);
  }, ASK_USER_NOTIFICATION_DELAY_MS);

  return () => {
    if (!waitingForAnswer) return;
    waitingForAnswer = false;
    runtime.cancel(timer);
  };
}

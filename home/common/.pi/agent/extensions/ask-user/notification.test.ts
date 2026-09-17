import assert from "node:assert/strict";
import test from "node:test";
import {
  ASK_USER_NOTIFICATION_DELAY_MS,
  buildNotificationPayload,
  scheduleUnansweredNotification,
  type BrrrNotificationPayload,
} from "./notification.ts";

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

test("builds a grouped time-sensitive Pi question notification", () => {
  assert.deepEqual(
    buildNotificationPayload(
      { question: "Ship this change?", context: "dotfiles" },
      NOW,
    ),
    {
      title: "Pi Agent",
      subtitle: "Waiting for your answer in dotfiles",
      message: "Ship this change?",
      thread_id: "pi-agent:dotfiles",
      sound: "brrr",
      expiration_date: "2026-09-13T12:05:00.000Z",
      interruption_level: "time-sensitive",
    },
  );
});

test("posts only after the question remains unanswered for 15 seconds", async () => {
  let scheduledTask: (() => void) | undefined;
  let scheduledDelay: number | undefined;
  const posts: Array<{ apiKey: string; payload: BrrrNotificationPayload }> = [];

  scheduleUnansweredNotification(
    { question: "Choose a database", context: "app" },
    "test-key",
    {
      schedule: (task, delayMs) => {
        scheduledTask = task;
        scheduledDelay = delayMs;
        return "timer";
      },
      cancel: () => assert.fail("an elapsed timer should not be cancelled"),
      now: () => NOW,
      post: async (apiKey, payload) => {
        posts.push({ apiKey, payload });
      },
    },
  );

  assert.equal(scheduledDelay, ASK_USER_NOTIFICATION_DELAY_MS);
  assert.equal(posts.length, 0);
  scheduledTask?.();
  await Promise.resolve();

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.apiKey, "test-key");
  assert.equal(posts[0]?.payload.title, "Pi Agent");
  assert.equal(posts[0]?.payload.message, "Choose a database");
});

test("cancels the notification when the prompt settles before the delay", async () => {
  let scheduledTask: (() => void) | undefined;
  let cancelledHandle: unknown;
  let postCount = 0;

  const settle = scheduleUnansweredNotification(
    { question: "Continue?" },
    "test-key",
    {
      schedule: (task) => {
        scheduledTask = task;
        return "timer";
      },
      cancel: (handle) => {
        cancelledHandle = handle;
      },
      now: () => NOW,
      post: async () => {
        postCount++;
      },
    },
  );

  settle();
  scheduledTask?.();
  await Promise.resolve();

  assert.equal(cancelledHandle, "timer");
  assert.equal(postCount, 0);
});

test("does not schedule without a configured API key", () => {
  let scheduled = false;

  scheduleUnansweredNotification({ question: "Continue?" }, undefined, {
    schedule: () => {
      scheduled = true;
      return "timer";
    },
    cancel: () => {},
    now: () => NOW,
    post: async () => {},
  });

  assert.equal(scheduled, false);
});

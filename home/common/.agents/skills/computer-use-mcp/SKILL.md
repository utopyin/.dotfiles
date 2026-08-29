---
name: computer-use-mcp
description: Drives local desktop apps and authenticated browser interfaces through Open Computer Use MCP. Use when a task requires a visual desktop interaction, Helium's signed-in browser session, or UI verification that an API or CLI cannot perform.
disable-model-invocation: true
---

# Computer Use MCP

Prefer a purpose-built API, CLI, or MCP server when it can complete the task directly. Use Computer for desktop-only, auth-bound, or genuinely visual work.

Treat the desktop as the user's live session. Ask before sending, submitting, deleting, purchasing, uploading, approving, or making another externally visible change. Access password managers or unrelated private content only when the user explicitly requests it.

## 1. Resolve the app

Use the app name or bundle identifier already established in the current session. Target Helium as `net.imput.helium` and keep its current/default profile. If the required account is not available in that profile, ask the user rather than switching profiles.

Call `computer_list_apps` once when the app identity is unknown or stale, then retain the returned identifier.

Pi exposes this server through the `mcp` proxy with the `computer_` prefix. Pass `mcp.args` as serialized JSON:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\"}" })
```

## 2. Start from fresh state

Begin each assistant turn that will interact with an app by calling `computer_get_app_state`. Element indices belong only to that state.

Use each action's refreshed state to choose the next action. Refresh explicitly after navigation, reloads, window or modal changes, failed actions, or incomplete returned state.

The state is ready when it identifies the intended app and window and exposes the next target or proves that target absent.

## 3. Act in tight chains

Prefer semantic element actions over coordinates:

- Click with `computer_click` and `element_index`.
- Fill a settable control with `computer_set_value`. This does not guarantee keyboard focus. Before a key submission, click the control and confirm focus.
- Otherwise click the editable control, confirm focus, then use `computer_type_text`.
- Send named keys and combinations with `computer_press_key`.

Chain calls only while every next target exists in the latest action result and the window has not changed. Stop and inspect after navigation, submission, modal transitions, downloads, uploads, or uncertainty.

## 4. Recover by changing the precondition

One failed call ends that strategy. Refresh stale state, establish focus, adopt the canonical app identifier, or change to a supported method before retrying. A retry is valid only when the state, target, arguments, or method changed.

After reconnecting an MCP server, verify it with `computer_get_app_state`. A tool catalog response is not a connection health check.

Read [REFERENCE.md](REFERENCE.md) when state is truncated, the accessibility tree is incomplete, a coordinate click is necessary, permissions fail, or the MCP server cannot connect.

Read [LEARNINGS.md](LEARNINGS.md) before platform-specific recording work or when familiar actions behave differently across operating systems.

## 5. Verify

Use the latest action result when it visibly proves the requested outcome. Otherwise refresh state once. A successful tool response without visible evidence is not completion.

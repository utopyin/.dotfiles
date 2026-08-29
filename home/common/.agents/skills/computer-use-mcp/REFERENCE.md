# Open Computer Use reference

Load only the section needed for the current interaction.

## Setup and connection

On macOS, Open Computer Use requires version 14 or later. This dotfiles repo installs the pinned CLI through Mise.

```sh
sw_vers -productVersion
open-computer-use --version
open-computer-use doctor
```

On first use, `doctor` opens onboarding when Accessibility or Screen Recording permission is missing. Ask the user to grant both permissions to Open Computer Use in System Settings. Do not attempt to alter macOS TCC state directly.

After the user grants permission, run `doctor` again and reconnect. The existing stdio MCP process may still hold stale permission state or may have closed.

If Pi cannot reach the server, inspect status and reconnect once:

```text
mcp({ server: "computer" })
mcp({ connect: "computer" })
```

A catalog response only proves that Pi can read the server metadata. It does not prove that the server process accepts calls. After reconnecting, use `computer_get_app_state` as the health check. A `Not connected` result means recovery failed even if `mcp({ server: "computer" })` lists every tool.

The server provides `list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `scroll`, `drag`, `type_text`, `press_key`, and `set_value`, exposed by Pi with the `computer_` prefix.

If the proxy remains disconnected, use a direct snapshot only to distinguish a working native runtime from a stale gateway:

```sh
open-computer-use snapshot net.imput.helium
```

If the snapshot works, restart the host or gateway instead of repeating the same MCP call.

## Snapshot budgets

State defaults to 500 text characters, 1,200 accessibility nodes, and 64 levels. Action results always return these defaults.

When required semantic text ends in `...`, request a bounded text limit first:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\",\"text_limit\":1000}" })
```

Use `"text_limit":"max"` only when complete text is required. If a visible long page, list, or table remains absent from the tree after scrolling, raise the tree budget:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\",\"max_tree_nodes\":3000,\"max_tree_depth\":96}" })
```

Budget values must be positive integers. Only explicit state calls accept them.

## Editable controls and key submission

`computer_set_value` updates a settable control but does not guarantee keyboard focus. When the next action is a key press, use this sequence:

1. Set the value.
2. Click the same control.
3. Confirm focus when the refreshed state exposes it.
4. Press the key.
5. Refresh after any resulting navigation or modal transition.

When using `open-computer-use call` for diagnosis, keep `get_app_state` and dependent element actions in one `--calls` process. A later CLI process must capture new state before using element indices.

## Recording verification

Confirm whether the user requested a display, app window, or selected region before recording. Platform-specific capture commands and window identifiers are documented in [LEARNINGS.md](LEARNINGS.md).

Run a short test capture before the real recording. When using `bg_start`, its initial response proves only that the process spawned. Check `bg_status` before starting UI actions and require the recorder to still be running. Then inspect the test file's duration, dimensions, and size. After the real capture, verify the same properties. Process exit code alone does not prove the requested framing.

```sh
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=width,height \
  -show_entries format=duration,size \
  -of default=noprint_wrappers=1 \
  recording.mov
```

## Coordinate click methods

Omitting `click_method` selects semantic-first `auto`. Refresh state immediately before any explicit coordinate click.

- `app_post` posts to the target window without moving the pointer. Use it for a blank area or overlay that has no usable accessibility element.
- `sky_click` uses macOS private SkyLight behavior when Chromium ignores `app_post`. The target window must be current, visible, and in the same Space. Revalidate this method after macOS upgrades.
- `global` moves the desktop pointer and may change focus. Use it only when the user explicitly approves that behavior, and scope `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1` to that single call.

Explicit methods do not fall back. Refresh state when the target window moves, closes, changes Space, hides, or minimizes.

```text
mcp({ tool: "computer_click", args: "{\"app\":\"net.imput.helium\",\"x\":875,\"y\":375,\"click_method\":\"app_post\"}" })
```

## Failure map

- Stale element or changed page: refresh state and choose a current index.
- Unfocused editable control: set its value when supported, click it, inspect focus, then type or press the submission key.
- Missing app or window: call `computer_list_apps` once, adopt its identifier, then refresh.
- Unsupported key or click method: use a supported key name or return to `auto`.
- Connection or catalog error: reconnect once, then rediscover the server tools.
- Permission error: report the required OS permission and pause for the user.

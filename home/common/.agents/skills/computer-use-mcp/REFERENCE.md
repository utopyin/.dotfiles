# Open Computer Use reference

Load only the section needed for the current interaction.

## Setup and connection

Check the installed runtime, then resolve the target through `computer_list_apps`. Use the identifier it advertises for all state, action, and snapshot calls.

```sh
open-computer-use --version
open-computer-use doctor
```

### macOS

Open Computer Use requires macOS 14 or later. Helium is advertised as `net.imput.helium`.

On first use, `doctor` opens onboarding when Accessibility or Screen Recording permission is missing. Ask the user to grant both permissions to Open Computer Use in System Settings. Do not attempt to alter macOS TCC state directly.

After the user grants permission, run `doctor` again and reconnect. The existing stdio MCP process may still hold stale permission state or may have closed.

### Linux

Linux requires a signed-in desktop session with AT-SPI2 and D-Bus accessibility. Helium is advertised as `Helium` in the tested environment.

Open Computer Use tries to discover `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, and display variables from the signed-in user's session when the caller lacks them.

If state contains Helium's native frame but no web document, check GNOME toolkit accessibility:

```sh
gsettings get org.gnome.desktop.interface toolkit-accessibility
gsettings set org.gnome.desktop.interface toolkit-accessibility true
```

Add renderer accessibility to `~/.config/helium-browser-flags.conf`:

```text
--force-renderer-accessibility
```

Ask before restarting Helium. Preserve its default profile, restore the existing session, then require `computer_get_app_state` to expose the web document and page controls.

### Reconnect and verify

If Pi cannot reach the server, inspect status and reconnect once:

```text
mcp({ server: "computer" })
mcp({ connect: "computer" })
```

A catalog response only proves that Pi can read the server metadata. It does not prove that the server process accepts calls. After reconnecting, use `computer_get_app_state` as the health check. A `Not connected` result means recovery failed even if `mcp({ server: "computer" })` lists every tool.

The server provides `list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `scroll`, `drag`, `type_text`, `press_key`, and `set_value`, exposed by Pi with the `computer_` prefix.

If the proxy remains disconnected, use a direct snapshot only to distinguish a working native runtime from a stale gateway:

```sh
open-computer-use snapshot APP_IDENTIFIER
```

If the snapshot works, restart the host or gateway instead of repeating the same MCP call.

## Snapshot budgets

State defaults to 500 text characters, 1,200 accessibility nodes, and 64 levels. Action results always return these defaults.

When required semantic text ends in `...`, request a bounded text limit first:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"APP_IDENTIFIER\",\"text_limit\":1000}" })
```

Use `"text_limit":"max"` only when complete text is required. If a visible long page, list, or table remains absent from the tree after scrolling, raise the tree budget:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"APP_IDENTIFIER\",\"max_tree_nodes\":3000,\"max_tree_depth\":96}" })
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

### Linux Wayland fallback

If a confirmed-focused Chromium control ignores one `computer_type_text` attempt and is not settable, do not repeat the same call. Use `wtype` with the signed-in user's Wayland environment:

```sh
export XDG_RUNTIME_DIR=/run/user/$(id -u)
ls "$XDG_RUNTIME_DIR"/wayland-*
export WAYLAND_DISPLAY=ACTIVE_SOCKET_NAME
wtype 'literal text'
```

Use the active socket's basename for `WAYLAND_DISPLAY`; the tested session used `wayland-1`. Send submission keys separately, and ask before any externally visible action:

```sh
wtype -k Return
```

## Recording verification

Confirm whether the user requested a display, app window, or selected region before recording, then use the matching platform subsection below.

Run a short test capture before the real recording. When using `bg_start`, its initial response proves only that the process spawned. Check `bg_status` before starting UI actions and require the recorder to still be running. Then inspect the test file's duration, dimensions, and size. After the real capture, verify the same properties. Process exit code alone does not prove the requested framing.

Accessibility bounds may use logical pixels while capture files use physical pixels. Validate framing visually instead of treating larger output dimensions as proof of a full-display capture.

```sh
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=width,height \
  -show_entries format=duration,size \
  -of default=noprint_wrappers=1 \
  recording.mov
```

### Linux

Pass the logical region directly to `-w` and stop with `SIGTERM` so the MP4 finalizes:

```sh
gpu-screen-recorder \
  -w 1157x1300+1231+38 \
  -f 60 -q high -k h264 -cursor yes \
  -o /tmp/recording.mp4
```

Capture a still image of the same logical region with:

```sh
grim -g '1231,38 1157x1300' /tmp/screenshot.png
```

### macOS

`screencapture -v -D1` records a display. To record one app window, pass its Core Graphics window ID with `-l`:

```sh
screencapture -v -V35 -l8802 -x output.mov
```

Find the window ID with `CGWindowListCopyWindowInfo`, matching by owner and title. Re-query it if the app recreates or reopens the window.

```swift
import CoreGraphics
import Foundation

let windows = CGWindowListCopyWindowInfo(
  [.optionOnScreenOnly, .excludeDesktopElements],
  kCGNullWindowID
) as? [[String: Any]] ?? []

for window in windows {
  let owner = window[kCGWindowOwnerName as String] as? String ?? ""
  let title = window[kCGWindowName as String] as? String ?? ""
  guard owner == "Helium" else { continue }
  print(window[kCGWindowNumber as String] ?? "?", title)
}
```

## Coordinate click methods

Omitting `click_method` selects semantic-first `auto`. Refresh state immediately before any explicit coordinate click.

### macOS

- `app_post` posts to the target window without moving the pointer. Use it for a blank area or overlay that has no usable accessibility element.
- `sky_click` uses macOS private SkyLight behavior when Chromium ignores `app_post`. The target window must be current, visible, and in the same Space. Revalidate this method after macOS upgrades.
- `global` moves the desktop pointer and may change focus. Use it only when the user explicitly approves that behavior, and enable `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1` only for that bounded session.

```text
mcp({ tool: "computer_click", args: "{\"app\":\"net.imput.helium\",\"x\":875,\"y\":375,\"click_method\":\"app_post\"}" })
```

### Linux

Prefer semantic AT-SPI clicks with `element_index`. For a coordinate click, use `global` only after user approval and only when the Computer MCP server was started with `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1` for the bounded session. `app_post` and `sky_click` are unavailable.

```text
mcp({ tool: "computer_click", args: "{\"app\":\"Helium\",\"x\":875,\"y\":375,\"click_method\":\"global\"}" })
```

Explicit methods do not fall back. Refresh state when the target window moves, closes, changes workspace, hides, or minimizes. If a Chromium link with a `jump` action ignores one semantic click, refresh and use its nearest descendant that exposes `click` rather than repeating the same index.

## Failure map

- Stale element or changed page: refresh state and choose a current index.
- Unfocused editable control: set its value when supported, click it, inspect focus, then type or press the submission key.
- Missing app or window: call `computer_list_apps` once, adopt its advertised identifier, then refresh.
- Native app frame without expected content: follow the platform setup procedure, then refresh.
- Focused control ignores typing: follow the platform input procedure and change the injection method.
- Unsupported key or click method: use a supported key name or return to `auto`.
- Connection or catalog error: reconnect once, then rediscover the server tools.
- Permission error: report the required OS permission and pause for the user.

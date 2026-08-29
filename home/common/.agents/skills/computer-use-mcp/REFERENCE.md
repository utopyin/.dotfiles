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

If Pi cannot reach the server, inspect status and reconnect once:

```text
mcp({ server: "computer" })
mcp({ connect: "computer" })
```

The server provides `list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `scroll`, `drag`, `type_text`, `press_key`, and `set_value`, exposed by Pi with the `computer_` prefix.

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
- Unfocused editable control: click it, inspect focus, then type; use `set_value` when settable.
- Missing app or window: call `computer_list_apps` once, adopt its identifier, then refresh.
- Unsupported key or click method: use a supported key name or return to `auto`.
- Connection or catalog error: reconnect once, then rediscover the server tools.
- Permission error: report the required OS permission and pause for the user.

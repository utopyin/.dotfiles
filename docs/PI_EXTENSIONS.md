# Vendored Pi extensions

Public-safe vendored Pi extension source lives under `home/.pi/agent/extensions`.
Runtime state, OAuth tokens, caches, sessions, and generated node_modules remain
ignored. This follows the official Pi extension layout: simple extensions are
single `.ts` files under `~/.pi/agent/extensions/`, and extensions with npm
dependencies keep their own `package.json`, lockfile, and ignored
`node_modules/` directory beside the extension code. The root TypeScript project
stays scoped to the dot CLI (`bin/` and `src/`).

## Source allowlist

Only these upstreams are approved for the current vendoring pass:

- Davis: <https://github.com/davis7dotsh/my-pi-setup/tree/main>
- dmmulroy: <https://github.com/dmmulroy/.dotfiles/tree/main>

## Current imports

| Extension                | Upstream | Commit                                     | Local path                                            | Notes                                                                                                              |
| ------------------------ | -------- | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/yeet`                  | Davis    | `e5a5beb9029f207a82fe4d50b024ad7696fb7ae0` | `home/.pi/agent/extensions/yeet.ts`                   | Import paths adapted from the old Mario namespace to `@earendil-works/*`.                                          |
| `openai-codex-fast-mode` | Davis    | `e5a5beb9029f207a82fe4d50b024ad7696fb7ae0` | `home/.pi/agent/extensions/openai-codex-fast-mode.ts` | Injects `service_tier: "priority"` for OpenAI Codex Responses payloads.                                            |
| `zsh-user-bash`          | Davis    | `e5a5beb9029f207a82fe4d50b024ad7696fb7ae0` | `home/.pi/agent/extensions/zsh-user-bash.ts`          | Runs Pi user bash commands through non-interactive zsh.                                                            |
| Git status widget        | Davis    | `e5a5beb9029f207a82fe4d50b024ad7696fb7ae0` | `home/.pi/agent/extensions/git-status-widget.ts`      | Shows branch and unstaged count.                                                                                   |
| `git-interceptor`        | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/git-interceptor.ts`        | Sets non-interactive Git editor env and blocks `--no-verify`.                                                      |
| `whimsical`              | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/whimsical.ts`              | Whimsical integration.                                                                                             |
| `pi-cloak`               | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/pi-cloak/`                 | Secret masking extension.                                                                                          |
| `pi-skill-toggle`        | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/pi-skill-toggle/`          | Skill toggle UI and frontmatter patching.                                                                          |
| `todos`                  | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/todos/`                    | File-backed todo management.                                                                                       |
| `web-tools`              | dmmulroy | `f1d259292fb07e08745484c546b789d9584959b6` | `home/.pi/agent/extensions/web-tools/`                | Registers `websearch` and `webfetch`; uses Exa MCP for search and blocks private/local hosts for fetch by default. |

## Managed Pi packages

`pi-mcp-adapter` is installed from npm instead of vendored. Its package source is
pinned in `home/.pi/agent/settings.json`, and its resolved dependency graph is
tracked in `home/.pi/agent/npm/package-lock.json`. MCP server configuration stays
in `home/.pi/agent/mcp.json`; OAuth credentials and metadata caches remain
ignored.

## Web tools decision

Use dmmulroy-style `web-tools` as the primary `webfetch/websearch` shape because it is more controllable, blocks private/local hosts by default, and keeps fetch/search behavior inspectable in repo source. Defer Davis Firecrawl unless SaaS scraping quality becomes worth an additional API-key dependency.

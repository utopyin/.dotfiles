# Learnings

These are observed platform behaviors, not API guarantees. Keep new findings under the relevant operating-system section.

## macOS

### Record one window, not the display

`screencapture -v -D1` records the full display. To record one app window, pass its Core Graphics window ID with `-l`:

```sh
screencapture -v -V35 -l8802 -x output.mov
```

The accessibility element index for a window is not its Core Graphics window ID. Find the ID with `CGWindowListCopyWindowInfo`, then match the window by owner and title. Re-query it if the app recreates or reopens the window.

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

Retina recordings use physical pixel dimensions, which can exceed the window's logical accessibility bounds. Window shadows can add more pixels. That alone does not mean the full display was captured.

### TCC changes can outlive the MCP process

During testing, `open-computer-use doctor` reported both permissions as granted and direct CLI snapshots worked, while Pi's existing MCP connection remained disconnected. Restarting the host or gateway may be necessary after a macOS TCC change. The recovery procedure lives in [REFERENCE.md](REFERENCE.md).

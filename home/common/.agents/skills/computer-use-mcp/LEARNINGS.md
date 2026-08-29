# Learnings

These are observed platform behaviors, not API guarantees. Keep findings here and operational procedures in [REFERENCE.md](REFERENCE.md).

## Linux

### App identifiers come from the accessibility registry

In the tested session, `computer_list_apps` advertised Helium as `Helium`. That advertised name was the working identifier for subsequent state and action calls.

### Chromium renderer accessibility is independent

AT-SPI2 and D-Bus exposed Helium's native browser frame without exposing its web document. GNOME toolkit accessibility alone was insufficient. The document appeared only after renderer accessibility was enabled and Helium restarted.

### AT-SPI focus does not prove keyboard injection

Semantic focus worked in Chromium while `computer_type_text` produced no text. The same control did not expose a settable value. Wayland keyboard injection worked once it used the signed-in user's runtime directory and display.

### Chromium actions are state-local

Element indices changed after navigation, modal transitions, and asynchronous list updates. Some links exposed `jump` but ignored a semantic click, while a descendant exposing `click` navigated correctly.

### Capture bounds and output dimensions use different scales

AT-SPI reported the tested Helium region as `1157x1300+1231+38`. On the scaled display, `grim` produced `1851x2080` pixels and `gpu-screen-recorder` produced `1852x2080`. Both captured the requested region rather than the full display.

`gpu-screen-recorder` accepted the older region form but emitted a deprecation warning. `SIGTERM` finalized the MP4 cleanly.

## macOS

### Window capture identifiers differ from accessibility indices

The accessibility element index for a window was not its Core Graphics window ID. Reopening the app could replace the Core Graphics ID even when the accessibility window looked unchanged.

Retina recordings used physical pixel dimensions that exceeded the window's logical accessibility bounds. Window shadows added more pixels without changing the requested capture target.

### TCC changes can outlive the MCP process

During testing, `open-computer-use doctor` reported both permissions as granted and direct CLI snapshots worked, while Pi's existing MCP connection remained disconnected. The connection recovered only after the host or gateway restarted.

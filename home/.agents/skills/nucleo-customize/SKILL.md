---
name: nucleo-customize
description: >-
  Customize Nucleo icons when inserting or editing them: primary color via
  currentColor, secondary color via data-color="color-2", stroke width for
  core/ui outline icons, duo soft opacity for ui outline-duo/glyph-duo, and
  corners for core outline. Works for React and vanilla. Use when the user asks
  to change icon color, secondary color, stroke width, thickness, opacity,
  corners, rounded/sharp ends, or customize a Nucleo icon.
disable-model-invocation: true
---

# Nucleo Customize

Use this skill **after** an icon is chosen (via `nucleo-icons` + MCP). One skill covers **React** and **vanilla** — behavior depends on package `target`.

## Step 0 — Detect package target

Call `nucleo_list_families` (or read `manifest.json` at `NUCLEO_SKILLS_ROOT`).

Use:

| Field              | Meaning                                            |
| ------------------ | -------------------------------------------------- |
| `target`           | `react` or `vanilla` (required for correct output) |
| `family` + `fills` | Whether stroke-width customization applies         |

If `target` is missing, ask the user whether they use the React or vanilla package — do not guess.

## What can be customized (now)

| Feature             | When it applies                                                  | React                                            | Vanilla                                                                                          |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Primary color**   | All icons (`currentColor`)                                       | `className` / `style.color` / parent `color`     | CSS `color`                                                                                      |
| **Secondary color** | Elements with `data-color="color-2"`                             | Attribute / Tailwind data selector / CSS         | CSS attribute selector                                                                           |
| **Stroke width**    | **Only** `core` + `outline`, or `ui` + `outline` / `outline-duo` | Prop `strokeWidth`                               | CSS var `--nucleo-stroke-width`                                                                  |
| **Duo opacity**     | **Only** `ui` + `outline-duo` or `glyph-duo` (fill-duo)          | Prop `duoOpacity`                                | CSS vars `--nucleo-outline-duo-opacity` / `--nucleo-glyph-duo-opacity`                           |
| **Corners**         | **Only** `core` + `outline`                                      | Prop `corners` (`"square"` default \| `"round"`) | CSS vars `--nucleo-stroke-linejoin` / `--nucleo-stroke-linecap` / `--nucleo-stroke-linecap-butt` |

### Stroke width — strict rules

Customizable **only** for:

- **core** + fill `outline` (default `2`)
- **ui** + fill `outline` or `outline-duo` (default `1.5`)

**Not** customizable for anything else, including:

- `sharp`, `pixel`, `micro`, or any family other than `core` / `ui`
- `glyph` / `glyph-duo` on any family (including core/ui)

If the user asks to change stroke width outside the allowed cases (e.g. sharp or pixel outline), explain it isn’t supported and offer color / size instead.

## Workflow

```
- [ ] 0. Detect target (react | vanilla)
- [ ] 1. Confirm icon family + fill (from search result)
- [ ] 2. Apply primary color if requested
- [ ] 3. Apply secondary color if requested (data-color="color-2" only)
- [ ] 4. Apply stroke width only if core outline or ui outline/outline-duo
- [ ] 5. Apply duo opacity only if ui outline-duo / glyph-duo
- [ ] 6. Apply corners only if core outline (both targets default to square/miter; set to round if asked)
- [ ] 7. Insert / update code in the project
```

## Primary color

Prepared icons use `currentColor` for primary fills/strokes (elements without a secondary treatment, or the main ink).

**React**

```tsx
<CalendarOutline24 className="text-slate-900" />
// or
<CalendarOutline24 style={{ color: "#0f172a" }} />
```

**Vanilla**

```html
<svg class="icon" style="color: #0f172a">…</svg>
```

```css
.icon {
  color: #0f172a;
}
```

## Secondary color (`data-color="color-2"`)

Many icons include parts marked `data-color="color-2"`. When the user asks for a **second / secondary / accent** color, style **only** those elements — do not recolor the whole icon.

Match the project’s styling approach. Prefer the same system they already use (Tailwind vs plain CSS).

### Plain CSS (always valid)

Prepared icons already use `fill="currentColor"` / `stroke="currentColor"` on inked parts. For a secondary color, set **`color`** on `[data-color="color-2"]` only — that is enough.

```css
.icon {
  color: #0f172a; /* primary → currentColor on the main parts */
}

.icon [data-color="color-2"] {
  color: #ef4444; /* secondary → currentColor on color-2 parts only */
}
```

For inline SVG without a class:

```html
<svg style="color: #0f172a">…</svg>
```

```css
svg [data-color="color-2"] {
  color: #ef4444;
}
```

Only if something still doesn’t recolor (unusual), fall back to explicit `fill` / `stroke` on that selector. Prefer `color` first.

### Tailwind

Target the attribute with a data variant (syntax may vary slightly by Tailwind version):

```html
<!-- React -->
<CalendarOutline24
  className="text-slate-900 **:data-[color=color-2]:text-red-500"
/>
```

```html
<!-- Vanilla / HTML -->
<svg class="text-slate-900 **:data-[color=color-2]:text-red-500">…</svg>
```

If the project’s Tailwind setup doesn’t support `**:` or that data syntax, fall back to plain CSS (above) or a small wrapper class.

### React without Tailwind

```tsx
<CalendarOutline24 className="nucleo-icon" style={{ color: "#0f172a" }} />
```

```css
.nucleo-icon [data-color="color-2"] {
  color: #ef4444;
}
```

## Stroke width

Only when **both** are true:

1. Family is `core` or `ui`
2. Fill is `outline`, or (`ui` and `outline-duo`)

### React (`target: "react"`)

```tsx
<CalendarOutline24 strokeWidth={1} />
```

### Vanilla (`target: "vanilla"`)

Prepared SVGs use a **CSS variable with a fallback** (no inline default on `<svg>`), so a normal stylesheet override works:

```html
<!-- baked in: stroke-width="var(--nucleo-stroke-width, 1.5)" -->
<svg …>…</svg>
```

```css
svg {
  --nucleo-stroke-width: 1; /* overrides the 1.5 / 2 fallback */
}
```

Defaults in the fallback: **core** `2`, **ui** `1.5`.

Do **not** use a React `strokeWidth` prop in vanilla HTML/JS.

## Duo opacity (soft layer)

Applies **only** to **ui** icons with fill `outline-duo` or `glyph-duo` (also called fill-duo).

Prepared icons:

1. Normalize `fill-opacity` / `stroke-opacity` → `opacity`
2. Only soft-layer values **`0.3`** (typical outline-duo) and **`0.4`** (typical glyph-duo) are controllable
3. Other opacities (`0`, `1`, `0.2`, …) stay fixed

Defaults:

- `outline-duo` → `0.3`
- `glyph-duo` → `0.4`

### React (`target: "react"`)

```tsx
<AlertInfoGlyphDuo18 duoOpacity={0.2} />
<ArrowBoldDownOutlineDuo18 duoOpacity={0.5} strokeWidth={1.5} />
```

Do not use a generic `opacity` prop for the soft duo layer — use **`duoOpacity`**.

### Vanilla (`target: "vanilla"`)

Use the variable that matches the icon fill. Defaults are in the `var()` fallback (not inline on `<svg>`):

| Fill          | Attribute pattern                                  | Fallback |
| ------------- | -------------------------------------------------- | -------- |
| `outline-duo` | `opacity="var(--nucleo-outline-duo-opacity, 0.3)"` | `0.3`    |
| `glyph-duo`   | `opacity="var(--nucleo-glyph-duo-opacity, 0.4)"`   | `0.4`    |

```css
svg {
  --nucleo-outline-duo-opacity: 0.2; /* or --nucleo-glyph-duo-opacity */
}
```

Do **not** offer duo opacity for core, sharp, pixel, or non-duo ui fills.

## Corners (core outline only)

Applies **only** to **core** + fill `outline`.

User language aliases:

| User says                               | Value              |
| --------------------------------------- | ------------------ |
| round, rounded, soft corners            | `round`            |
| square, squared, sharp corners, sharper | `square` (default) |

### Rules

| Mode       | `stroke-linejoin` | `stroke-linecap`                                             |
| ---------- | ----------------- | ------------------------------------------------------------ |
| **round**  | `round`           | `round` (including `data-cap="butt"` elements)               |
| **square** | `miter`           | `square`, or **`butt`** if the element has `data-cap="butt"` |

### React (`target: "react"`)

Prepared components expose `corners` (default **`"square"`**):

```tsx
<PrinterOutline32 />
<PrinterOutline32 corners="square" />
<PrinterOutline32 corners="round" strokeWidth={2} />
```

Do not invent other prop names (`corner`, `linecap`, etc.).

### Vanilla (`target: "vanilla"`)

Prepared **core outline** SVGs use CSS variables with **square** fallbacks (only on elements that already had linecap/linejoin, plus stroked `data-cap="butt"` elements):

| Attribute                            | Pattern                                   | Fallback |
| ------------------------------------ | ----------------------------------------- | -------- |
| `stroke-linejoin`                    | `var(--nucleo-stroke-linejoin, miter)`    | `miter`  |
| `stroke-linecap` (normal)            | `var(--nucleo-stroke-linecap, square)`    | `square` |
| `stroke-linecap` + `data-cap="butt"` | `var(--nucleo-stroke-linecap-butt, butt)` | `butt`   |

**Square / sharp** (default look — no CSS needed):

```css
/* already the fallbacks; optional explicit: */
svg {
  --nucleo-stroke-linejoin: miter;
  --nucleo-stroke-linecap: square;
  --nucleo-stroke-linecap-butt: butt;
}
```

**Round / soft:**

```css
svg {
  --nucleo-stroke-linejoin: round;
  --nucleo-stroke-linecap: round;
  --nucleo-stroke-linecap-butt: round;
}
```

Do **not** add linecap/linejoin to elements that never had them. Do **not** hand-edit those attributes when CSS vars are enough.

Both React and vanilla default to **square/miter**. Use `corners="round"` (React) or the three CSS vars set to `round` (vanilla) when the user wants soft corners.

### Not supported

Corners are **not** customizable for ui, sharp, pixel, micro, or any glyph/duo fill. If asked, explain and offer color / stroke width (when allowed) instead.

## Decision cheat sheet

| User intent                                          | Allowed?                           | React                      | Vanilla                                                                                 |
| ---------------------------------------------------- | ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Primary color                                        | Always                             | `color` / `className`      | CSS `color`                                                                             |
| Secondary / accent color                             | If icon has `data-color="color-2"` | Data selector / CSS        | CSS `[data-color="color-2"]`                                                            |
| Stroke width on **core `outline`**                   | Yes                                | `strokeWidth={…}`          | `--nucleo-stroke-width`                                                                 |
| Stroke width on **ui `outline` / `outline-duo`**     | Yes                                | `strokeWidth={…}`          | `--nucleo-stroke-width`                                                                 |
| Stroke width on **sharp / pixel / micro** (any fill) | **No**                             | Explain + offer color/size | Same                                                                                    |
| Stroke width on **glyph / glyph-duo**                | **No**                             | Explain                    | Explain                                                                                 |
| Soft opacity on **ui outline-duo / glyph-duo**       | Yes                                | `duoOpacity={…}`           | `--nucleo-outline-duo-opacity` / `--nucleo-glyph-duo-opacity`                           |
| Soft opacity on other families/fills                 | **No**                             | Explain                    | Explain                                                                                 |
| Corners on **core outline**                          | Yes                                | `corners="round\|square"`  | `--nucleo-stroke-linejoin` / `--nucleo-stroke-linecap` / `--nucleo-stroke-linecap-butt` |
| Corners on other families/fills                      | **No**                             | Explain                    | Explain                                                                                 |

## With nucleo-icons

1. Find the icon (`nucleo-icons` skill + MCP)
2. Fetch SVG / use the React component path if present
3. Apply this skill’s customizations for the active `target`
4. Keep user-facing lists free of icon ids and match explanations

## Examples

**React — thinner core/ui outline**

```tsx
<SettingsOutline24 strokeWidth={1} className="text-slate-900" />
```

**React — primary + secondary color (Tailwind)**

```tsx
<BellOutline24 className="text-slate-900 **:data-[color=color-2]:text-red-500" />
```

**Vanilla — primary + secondary (CSS)**

```html
<svg class="icon" aria-hidden="true">…</svg>
```

```css
.icon {
  color: #0f172a;
}
.icon [data-color="color-2"] {
  color: #ef4444;
}
```

**Sharp / pixel + “make the stroke thicker”**

Stroke width is only for **core outline** and **ui outline / outline-duo**. For `sharp`, `pixel`, or any other case, explain it isn’t customizable. Offer changing color or picking a different size instead.

**Core outline — round / soft corners**

```tsx
<DragDown2fOutline24 corners="round" />
```

Vanilla:

```css
.icon-round {
  --nucleo-stroke-linejoin: round;
  --nucleo-stroke-linecap: round;
  --nucleo-stroke-linecap-butt: round;
}
```

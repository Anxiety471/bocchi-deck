# Bocchi Deck 🎸

A **Pi TUI extension** that adds a retro rock / band-room terminal UI to your coding session. Originally built as "Pi Control Deck", now rebranded with music-themed labels, multiple visual themes, and full Pi TUI API compliance.

![Theme: retro-rock](https://img.shields.io/badge/theme-retro--rock-ff6b35?style=flat-square)
![Pi TUI](https://img.shields.io/badge/Pi%20TUI-v0.75.3-8b5cf6?style=flat-square)
![TypeScript](https://img.shields.io/badge/TS-Strict-3178c6?style=flat-square)

---

## Features

### Widgets (above editor)

| Widget             | Default | Description                                       |
| ------------------ | ------- | ------------------------------------------------- |
| **Active Session** | visible | Model, provider, thinking level, mode, turn count |
| **Setlist**        | visible | Tool execution progress, idle/active state        |

### Commands

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `/bocchi`          | Open command palette (SelectList overlay)           |
| `/bocchi-settings` | Toggle widgets, compact mode, render cards, aliases |
| `/bocchi-theme`    | Switch visual theme                                 |
| `/bocchi-status`   | Show full status summary                            |
| `/bocchi-clear`    | Remove all widgets and status labels                |
| `/confirm`         | Confirmation dialog overlay                         |
| `/danger`          | Risk-themed confirmation                            |
| `/fetch`           | BorderedLoader spinner demo                         |

### Legacy aliases

The following old commands are preserved and toggleable via Settings:
`/control`, `/deck`, `/deck-settings`, `/deck-theme`, `/deck-status`, `/clear-ui`

### Render cards

Custom tool rendering for LLM-dispatched tools:

- `bocchi_status` — Status info cards (ℹ ✓ ⚠ ✗)
- `bocchi_error` — Error cards with suggestions (✗ BAD TAKE)
- `bocchi_work` — Working progress cards
- `bocchi_confirm` — Confirmation required cards

### Overlays

- **Command palette** — Searchable SelectList with arrow keys and Esc
- **Settings** — SettingsList with keyboard toggle/save/cancel
- **Theme selector** — SelectList for visual theme switching
- **Confirmation** — Yes/No overlay for risky operations
- **BorderedLoader** — Spinner overlay with Esc-to-cancel

---

## Themes

Switch anytime with `/bocchi-theme` — no restart needed.

### 🎸 retro-rock (default)

Music/band terminology with rounded box cards:

- 🎸 **ACTIVE SESSION** — context widget
- ▣ **SETLIST** — workflow widget
- ⚡ **RIFF EXECUTION** — tool call cards
- ✓ **CLEAN TAKE** — result cards
- ✗ **BAD TAKE** — error cards
- ⚙ **AMP SETTINGS** — settings overlay
- ▶ **START TAKE?** — confirmation dialog
- Working indicator: ♪ ♩ ♫ ♬
- Idle: `backstage` | Running: `live`

### 🎭 mono-stage

Monochromatic rounded borders with stage terminology.

### 🌃 tokyo-night

Original vibrant dark theme with simple borders.

### ⚪ minimal

Bare-bones mode — no extra labels, subtle separators only.

### Width safety

All themes respect the 80-column minimum. Every rendered line is passed through `truncateToWidth()`, `wrapTextWithAnsi()`, or `visibleWidth()`.

---

## Layout

Bocchi Deck uses a **vertical Pi-native layout** (no sidebar, no dashboard):

```
┌──────────────────────────────────────┐
│  normal assistant/tool output stream │
├──────────────────────────────────────┤
│  🎸 ACTIVE SESSION                   │  ← widget (1 line compact)
│  ▣ SETLIST                           │  ← widget (1 line compact)
├──────────────────────────────────────┤
│  default Pi editor                   │
├──────────────────────────────────────┤
│ mode:normal  tools:idle  bocchi:on   │  ← status labels
└──────────────────────────────────────┘
```

---

## Installation

### Quick install (copy to Pi extensions)

```bash
cp bocchi-deck.ts ~/.pi/agent/extensions/
```

Then in Pi, run `/reload`.

### From source

```bash
git clone https://github.com/Anxiety471/bocchi-deck.git
cp bocchi-deck/index.ts ~/.pi/agent/extensions/bocchi-deck.ts
# or use with pi -e
pi -e ./bocchi-deck/index.ts
```

---

## Architecture

### File structure

```
bocchi-deck/
├── index.ts          # Main extension (single self-contained file)
├── README.md         # This file
└── .gitignore
```

### Core components

- **Theme config** (`BocchiThemeConfig`) — Label maps, border styles, and color keys for each of the 4 themes
- **`ActiveContextWidget`** — Renders model/session info in 1 line (compact) or multi-line
- **`WorkflowProgressWidget`** — Renders tool execution state in 1 line
- **`showCommandPalette()`** — SelectList overlay factory
- **`showSettingsOverlay()`** — SettingsList overlay factory
- **`showConfirmationOverlay()`** — Confirm dialog overlay factory
- **`drawCard()`** — Renders rounded or simple bordered cards with title/content
- **`ContainerFromLines`** — Helper to render pre-computed lines as a TUI component

### Strict Pi TUI compliance

- ✅ `render(width)`, `invalidate()`, `handleInput(data)` on every interactive component
- ✅ `truncateToWidth()` / `wrapTextWithAnsi()` / `visibleWidth()` on every line
- ✅ Theme from callbacks (`theme.fg()` / `theme.bg()`) — no imports, no hardcoded colors
- ✅ `invalidate()` rebuilds themed content on theme change
- ✅ Built-in `SelectList`, `SettingsList`, `BorderedLoader` from `@earendil-works/pi-tui`
- ✅ Default editor preserved — no sidebar, no dashboard, no custom editor
- ✅ Works at 80-column terminal width

### State management

State is kept in-memory via a `BocchiState` object. The extension reacts to Pi lifecycle events:

- `session_start` — Reinitialize state
- `model_select` / `thinking_level_select` — Update context info
- `turn_start` / `turn_end` — Track turns
- `tool_execution_start` / `tool_execution_end` — Track tool progress
- `tool_call` — Update mode label
- `before_agent_start` / `agent_end` — Working state

---

## Settings (via `/bocchi-settings`)

| Setting                  | Options            | Default |
| ------------------------ | ------------------ | ------- |
| Compact mode             | on / off           | on      |
| Active Context widget    | visible / hidden   | visible |
| Workflow Progress widget | visible / hidden   | visible |
| Footer status labels     | visible / hidden   | visible |
| Working indicator        | visible / hidden   | visible |
| Render cards             | enabled / disabled | enabled |
| Alias commands           | yes / no           | yes     |

---

## Tool reference

### `bocchi_status`

Display status cards with icons. Parameters:

- `title` (string) — Status title
- `message` (string) — Status message
- `status` (optional: `info` | `success` | `warning` | `error`)

### `bocchi_error`

Display error cards. Parameters:

- `errorType` (string) — Error category
- `errorMessage` (string) — Error description
- `suggestion` (optional string) — Fix suggestion

### `bocchi_work`

Display working progress. Parameters:

- `task` (string) — Task description
- `progress` (optional string) — Progress info

### `bocchi_confirm`

Request user confirmation. Parameters:

- `title` (string) — Dialog title
- `description` (string) — What's at stake
- `confirmLabel` / `cancelLabel` (optional strings)

---

## Development

### Prerequisites

- Pi v0.75.3+
- Node.js 22+

### Testing

```bash
# Lint
npx biome check index.ts

# Type-check (requires Pi's dependencies)
cp index.ts ~/.pi/agent/extensions/bocchi-deck.ts
pi -e ~/.pi/agent/extensions/bocchi-deck.ts
```

---

## Changelog

| Version | Notes                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2.0     | Rebranded from Pi Control Deck to Bocchi Deck. Added retro-rock, mono-stage themes. Rounded card rendering. Music-note working indicator. |
| 1.0     | Original Pi Control Deck with tokyo-night and pantheon themes.                                                                            |

---

## License

MIT — feel free to fork, modify, and share.

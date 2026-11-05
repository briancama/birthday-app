# Bric: Build Prompt

*How to use this. Paste it into your coding tool as the project instructions, or save it as DESIGN.md in the repo. It is self-contained and assumes no other file except the logo SVGs. The full rationale lives in the Bric Design System doc.*

## 1. What you are building

Bric is a prediction market for a friend group. People hold **brics**, an invented currency, and use them to take positions on markets. The first screen is the **Wallet**: a balance, a line chart of earnings growth, and a ledger of transactions (earnings only for now). Everything after builds on the same system: markets with two or more options, positions, a leaderboard and a friend circle.

Build in the project’s existing stack. If there is none, use semantic HTML, one CSS file driven by custom properties, and small vanilla JS modules. No CSS framework, no component library, no icon font, no animation library.

When the spec is silent, ask. Do not invent labels, features, colors or copy.

## 2. Brand in brief

- **Platform:** Bric. **Currency:** brics (“1 bric”, “20 brics”). Platform with a capital B, currency in lowercase. The Bric symbol can stand in for the word beside numerals.
- **Idea:** a ledger for friends: heavy, plain and exact.
- **Look:** black page, white ink, double-ruled boxes, heavy monospace type, saturated color used only for fills and data.
- **Voice:** earnest, plain and forward-leaning. It pushes the user toward gaining more brics, sincerely. It never jokes about brics, never calls them money, cash or funds, and never winks.

## 3. Hard rules

1. Dark only. No light theme and no toggle. Set `color-scheme: dark`.
2. Border radius is 0 everywhere in the interface. No shadows, gradients, blur or transparency effects.
3. One typeface: IBM Plex Mono, weights 500 and 700 only. Never lighter. Fallbacks: ui-monospace, Menlo, Consolas, monospace.
4. Every element must mean something. No decorative labels, badges, status words or icons. Status words name real states only: Open, Closed, Settled.
5. Structure is drawn with lines, and each line style has a meaning (section 6).
6. Color has jobs (section 7). Never use color as the only carrier of meaning.
7. Text on a color fill is black. Known gap: black on the blue series fill is 4.49:1, just under the 4.5:1 target. If it fails review, lighten the blue slightly rather than changing the text color.
8. The Bric logo and symbol are used exactly as supplied: never recolored, rounded, outlined, shadowed, tilted or stretched.
9. Anything that moves brics shows the exact before and after, for example “555 → 515 brics”.

## 4. Tokens

Design values are in px. Implement sizes in rem (1rem = 16px) so text respects user settings.

```css
:root {
  color-scheme: dark;

  /* interface colors */
  --ground: #000000;  /* page and every box background */
  --ink:    #ffffff;  /* all lines and body text */
  --fill:   #00a0a0;  /* selected, active, header and label fills (teal) */
  --hatch:  #00b3b3;  /* chart hatch pattern only */
  --mark:   #ffd400;  /* first letter of panel titles only */
  --guide:  #bdbdbd;  /* chart gridlines, tertiary guides */
  --alert:  #ff2400;  /* errors, failures, losses, irreversible actions */

  /* series colors: identify one option among several, assigned by slot */
  --series-1: #00a0a0;  /* teal,   solid square    */
  --series-2: #ffd400;  /* yellow, solid diamond   */
  --series-3: #3366ff;  /* blue,   solid triangle  */
  --series-4: #00ff00;  /* green,  cross           */
  --series-5: #ff8000;  /* orange, hollow square   */

  /* type */
  --font: IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace;
  --w-body: 500;
  --w-strong: 700;

  /* space */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 18px;

  /* lines */
  --line-double: 4px double var(--ink);
  --line-container: 2px solid var(--ink);
  --line-divider: 1px solid var(--ink);
  --line-dash: 1px dashed var(--ink);
}
```

## 5. Typography

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Display numeral | 60px | 700 | Letter-spacing −0.03em, line-height 1.1. The unit (word or symbol) sits beside it at 16px. |
| Page title | 30px | 700 | Uppercase, letter-spacing +0.04em. |
| Panel title | 16px | 700 | Sits in the border like a notch. First letter in `--mark`. |
| Body | 15px | 500 | Line-height 1.5. |
| Small, table, readout | 13px | 500, 700 for emphasis |  |
| Chart labels | 12px | 500 |  |

- Hierarchy comes from size and weight only, never from color or opacity.
- Numbers are right-aligned in tables. Running totals and balances are bold.
- Uppercase is for the page title and table column heads only. Panel titles are title case. Everything else is sentence case.
- Use typographic punctuation in copy: ’ for apostrophes, “ ” for quotes, a real minus (−) for negative amounts.

## 6. Line language

| Line | Weight | Meaning | Where |
| --- | --- | --- | --- |
| Double | 4px | A major unit that contains things | Panels, title block, the rule under a table header |
| Solid | 3px | Data itself | Chart frame, data lines |
| Solid | 2px | A secondary container or control | Ledger container, readout bar, chips, buttons, form fields |
| Solid | 1px | A division between neighbors | Table column dividers |
| Dashed, short | 1–2px | More of the same, divided inside a container | The rule under the balance numeral, ledger row dividers |
| Dashed, long (6 4) | 1.5px | Reference marks | Chart gridlines |
| Dotted (2 3) | 1.5px | Transient guides | The chart cursor line |

Dashes are a delineation tool, not a theme. Never use them as borders around containers or for texture. Dash patterns also mean “estimate” on charts, so series are never told apart by dashes.

## 7. Color jobs

- **Ground** is the page and all box backgrounds. **Ink** is every line and all text.
- **Fill (teal)** marks what is selected, active or labeled: the selected chip, table header rows, readout label cells, the primary button, the chart hatch. Text on it is black.
- **Mark (yellow)** is used only for the first letter of each panel title. It is the same size and weight as the rest of the word, with no background block or padding.
- **Alert (red)** appears only for errors, failures, losses and irreversible actions. It is always paired with a word or a sign (a loss reads “−35”). It appears in text, thin borders, or a small label with black text on a red fill. It never fills a panel. Gains stay in Ink and are never green.
- **Series colors** identify one option among several in a market, and only that. Use them for lines, markers, bar and area fills, and a small square key beside an option’s name. Never for borders, buttons, panel backgrounds or other chrome.
- Series slots are stable: an option keeps its slot for the life of its market, everywhere it appears (chart, position row, ledger tag, market card).
- At most five series colors. A market with more than five options shows the top four in color and groups the rest as “Other”, drawn in Ink and hatched.
- Red is never a series color, not even for “No”. Green never means a gain. Binary markets use slot 1 alone: solid for Yes, hatched for No.

## 8. Layout

- Mobile: a single column, max-width 480px, centered, 12px page padding. Panels are separated by an 18px gap. Respect safe-area insets with `viewport-fit=cover` and `env(safe-area-inset-*)`.
- Wider than about 900px: panels may tile in two columns with the same 18px gap. A single panel never gets wider than the mobile measure when it holds reading text. Wide tables scroll inside their own container.
- Spacing uses only 4, 8, 12 and 18. Panel padding is 10 / 12 / 14.

## 9. Components

### Title block

Black box, 4px double ink border, padding 6px 12px, the page title in uppercase.

### Panel

A real `fieldset` with a 4px double ink border, black background, margin-top 18px, padding 10px 12px 14px. The `legend` carries the title with 0 6px padding. Wrap the first letter of the title in a span colored `--mark`.

### Chips

Buttons for small exclusive choices such as a chart range: 2px ink border, transparent background, bold ink text, padding 2px 12px, 8px gap. The selected chip has a `--fill` background and black text, and sets `aria-pressed`. The tappable area must be at least 44px tall even if the visible chip is shorter.

### Buttons

Primary: `--fill` background, black bold text, 2px ink border. Secondary: black background, ink text, 2px ink border. There is no destructive style. Irreversible actions use a confirmation dialog.

### Form fields

A 2px ink rectangle, monospace text, no radius. The label sits above in 13px bold. Radios and checkboxes are drawn as squares with a 2px ink border and a `--fill` fill when selected. An error is one sentence beneath the field saying what is wrong and how to fix it.

### Readout bar

A 2px ink bordered bar below a chart, min-height 28px. The left cell has a `--fill` background (or the series color of the option being read) with black bold text showing the date or name. The right cell shows the value, for example “+45 → 555 brics”. When nothing is selected it shows “---” on the left and a plain instruction on the right.

### Ledger table

A scrolling container (max-height 320px, 2px ink border) around a table at 13px with a sticky header row.

- Columns: Date, Event, +Amount (right-aligned), Balance (right-aligned, bold).
- Header row: `--fill` background, black bold text, 1px black column dividers, a 4px double ink rule beneath.
- Body: newest first, 4px 8px cell padding, 1px solid ink column dividers (none before the first column), 1px dashed ink lines between rows. Event text wraps (min-width 150px). Dates and numbers do not wrap.
- Amounts show their sign (+25). Losses show a real minus in `--alert`.

### Line chart (single series)

SVG with viewBox 440 × 220 that scales to the panel width. Plot inset: left 44, right 12, top 12, bottom 26.

- Y axis: five labels, right-aligned just left of the plot, with round bounds (round to half a power of ten).
- Gridlines: horizontal, dashed long (6 4), `--guide`, 1.5px.
- Fill under the line: a 45° hatch pattern, 6px pitch, 2px strokes in `--hatch`, opacity .9, closed to the baseline.
- Frame: a 3px solid ink rectangle drawn above the hatch.
- Data line: 3px ink, round joins, straight segments (not smoothed).
- Markers: 6×6 solid squares at real data points. Never on computed anchor points.
- X axis: start date, midpoint, today, in “Oct 4” format.
- The series starts from an anchor at the start of the selected range, using the balance accumulated before it.
- Interaction (pointer move or tap): snap to the nearest real data point and show a 1.5px dotted ink vertical line plus a 12×12 `--fill` square with a 2.5px ink outline. Update the readout bar.
- Range chips: 1W, 1M, ALL (default 1M).

### Multi-option chart (markets with more than two options)

- One line per option in its series color, on a 0 to 100% axis labeled with percent signs. The options’ probabilities sum to 100%.
- Marker per slot, drawn about 8px across: solid square, solid diamond (rotated square), solid triangle (pointing up), cross (two 2.5px strokes), hollow square (2px stroke, black fill).
- Label each line directly at its right end with the option name. A legend is the fallback only.
- The readout bar shows one cell per option at the selected point, sorted by value, each label cell in that option’s series color.
- A dashed data line means an estimate or projection. A solid line means something that happened.
- Stacked bars are allowed only for “how does the whole split” questions: segments in slot order, separated by 2px ink lines.

### Confirmation dialog (anything that moves brics)

A panel with a 4px double border whose legend states exactly what will happen, for example “Place position”. It shows the option, the amount, and the balance before and after (“555 → 515 brics”). The confirm button is primary and cancel sits beside it. Nothing is preselected for irreversible actions. Any consequence label uses `--alert`.

### Navigation

A bottom bar with a text label for every destination. The current destination has a `--fill` background and black text. Icons, if used, accompany the label.

### Market card

A panel whose legend is the market question. It shows the leading probability as a large numeral, a status word (Open, Closed or Settled) drawn with a ledger box icon, and a one-line detail. Divide detail rows with short dashes.

### Empty and error states

- Empty: a ruled box with one plain sentence about what is missing and, if there is one, the action to take. A spot illustration is optional.
- Error: a 2px `--alert` border box with a black-on-red label that names the real problem (for example “Failed” or “Not enough brics”), then one sentence on what happened and what to do. Red appears nowhere else on that screen.

## 10. Logo, symbol and icons

**Files** (supplied; place in `/assets/brand/`):

| File | Use |
| --- | --- |
| `bric_symbol_white.svg` | Default symbol: white on black, everywhere in the interface |
| `bric_symbol_white_sm.svg` | Same symbol for small sizes (inline beside numerals, favicon) |
| `bric_logo.svg` | Full logo in white, for headers, splash and share images |
| `bric_symbol.svg`, `bric_symbol_sm.svg`, `bric_logo_black.svg` | Black versions for light surfaces such as print |

- The symbol also serves as the currency mark. Use the word “brics” in running copy and the symbol in tables, the readout bar and the display numeral. Size the symbol to the cap height of the figures beside it.
- Clear space is at least the width of the symbol’s vertical bar on every side (about 13% of the symbol’s width).
- The marks are always Ink. Series colors, Fill and Alert never tint them.
- Never place a mark behind text, charts or tables, and never as a pattern or watermark.

**Icons.** Each icon depicts one concrete thing the product has and always sits beside a text label. Build on a 24×24 grid with a 20×20 live area, 2px strokes (3px at 48px), square caps, mitered joins, whole-number coordinates, `stroke: currentColor`, `fill: none`. Fills are limited to solid ink and the 45° hatch. Prefer straight segments at 0°, 45° and 90°. One color per icon. Icons never animate. A standalone icon button is a 44px square with a 2px ink border and an accessible name.

Market states are ledger boxes: an empty box for Open, a struck box for Closed, a ticked box for Settled.

**Illustration** is for empty states, onboarding and rare milestones only, never on a screen with a chart or dense table. White line on black, 3px strokes, hatch in teal as the only color fill, one per screen, 160–240px. Subjects are the social world (friends, rooms, food, dice, tickets), never finance clichés such as coin stacks, rockets or upward arrows. No gradients, photos, 3D or emoji.

## 11. Voice and copy

- **Earnest accumulation.** The voice treats brics as worth having and growing and says so without irony. It points at the next thing to gain: “45 more to 600.” “Second place is 40 brics ahead.”
- **Plain verbs:** gain, hold, grow, reach. Never money, cash, funds, worthless or fake.
- **Numbers carry the push,** not hype words. No exclamation marks, no emoji, no “oops”, no mascots.
- **Specific.** Exact figures over adjectives. Always show the sign on a change (+20, −35). Show both numbers when a balance changes: “+45 → 555 brics”.
- **Flat on loss and error.** State the number and the next step. Do not console and do not joke.
- **Real states only:** Open, Closed, Settled.

Tone examples: “You hold 555 brics.” “+20 latest · 12 transactions”. “Not enough brics. You hold 555; this takes 600.” “No transactions yet. Win a market to put brics here.”

## 12. Accessibility

- Semantic elements: fieldset and legend for panels, table with thead and tbody for ledgers, buttons with `aria-pressed` for toggles, `role="img"` and a label on every chart. Provide a text summary or data table alternative for each chart.
- Focus ring: 3px ink outline with 2px offset on every interactive element.
- Touch targets at least 44px.
- Never rely on color alone: every series has a marker shape and a direct label.
- Respect reduced motion. Motion is functional only: state changes are immediate or a single step of 100ms or less. No easing flourishes, no looping animation, no celebration animation.

## 13. Data (first build)

- Transaction: `{ id, date, description, amount }`. Amounts are positive earnings only for now. Compute the running balance.
- Market: `{ id, question, status: open | closed | settled, options: [{ id, label, slot }] }`. `slot` (1 to 5) is assigned once and never changes.
- Keep sample data in one clearly marked constant so it can be replaced with a database query. Sample descriptions should read like “Weekly stipend”, “Won: Chili cook-off”, “Correct call: Rain on Saturday”.

## 14. Build order

1. Tokens, font loading and base styles.
2. A style guide page showing every component above in every state. This is the living reference.
3. The Wallet screen: balance, growth chart with range chips, and the transactions ledger.
4. The markets list and a market detail screen with the multi-option chart.
5. The position form and the confirmation dialog.
6. The bottom navigation.

Stop after each step and show the result before continuing.

## 15. Undecided: implement the default and isolate it

- Whether the symbol goes before or after the number (default: after, with a narrow space).
- The size at which the small symbol file takes over (default: below 24px).
- Whether the yellow first letters become keyboard shortcuts (default: styling only).

## 16. Acceptance checklist

- [ ] Every border radius is 0, and there are no shadows or gradients.
- [ ] Only IBM Plex Mono at 500 and 700 is used.
- [ ] Every element can be explained by what it means in the product.
- [ ] Panels use 4px double lines, and dashes appear only inside containers.
- [ ] Yellow appears only on first letters of panel titles.
- [ ] Red appears only with a word or a sign, never as a panel fill.
- [ ] Series colors appear only in data and option keys.
- [ ] Every chart has a frame, dashed gridlines, a readout bar and a text alternative.
- [ ] Every series has a marker shape and a direct label, not just a color.
- [ ] Every balance change shows before and after.
- [ ] No copy calls brics money, cash or funds, and none comments on their pointlessness.
- [ ] Touch targets are at least 44px and focus rings are visible.

## 17. Do not

- Add status indicators, mode labels, badges, avatars, mascots or decorative icons.
- Add rounded corners, shadows, gradients, blur or a light theme.
- Use font weights below 500.
- Use yellow anywhere but the first letter of panel titles.
- Use dashed lines outside the places listed above.
- Use a series color for interface chrome, or red as a series color.
- Recolor, outline, round or animate the Bric marks.
- Invent copy that jokes about brics or calls them money.

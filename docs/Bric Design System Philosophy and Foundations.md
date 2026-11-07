# Bric Design System: Philosophy and Foundations

_Version 1.0 for Bric, the friend-group prediction market_

**How to read this.** Sections tagged **Settled** record decisions made while building the wallet. Sections tagged **Proposed** extend those decisions to parts of the product that don’t exist yet. They are adopted for the first build, but nothing in them has been built yet, so check them against real screens as they are made. Section 10 lists what is still undecided.

## At a glance

| Topic                       | Decision                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Platform**                | Bric, a friend-group prediction market                                                                                                           |
| **Currency**                | brics (“1 bric”, “20 brics”), written with the Bric symbol beside numerals                                                                       |
| **Idea**                    | A ledger for friends: heavy, plain and exact                                                                                                     |
| **Look**                    | Black ground, white ink, 4px double rules, heavy IBM Plex Mono, radius 0, dark only                                                              |
| **Interface color**         | Ink white, Fill teal `#00a0a0`, Mark yellow `#ffd400` on first letters only, Alert red `#ff2400`                                                 |
| **Series color**            | Teal, yellow, blue `#3366ff`, green `#00ff00`, orange `#ff8000`, by stable slot, with a marker shape each                                        |
| **Line language**           | Double = a major unit, solid = structure and data, dashed = divisions inside a container                                                         |
| **Voice**                   | Earnest and plain. Pushes the user toward gaining more brics, never winks, and is exact on anything that moves a balance                         |
| **Marks**                   | Supplied Bric logo and symbol remain unmodified; organic curves also belong to hand-drawn illustration, never rounded UI chrome                  |
| **Icons**                   | Clean-lined, labeled and few. Market states are ledger boxes. The hand-drawn piggy bank identifies the wallet                                    |
| **Illustration and motion** | Confident hand-drawn artwork; one brief coin drop into the piggy bank per confirmed reward, white trails on black, no motion with reduced motion |

## 1. Origins

Two references started this system: early DOS spreadsheets (the frame-and-menu structure of Lotus 1-2-3) and a Japanese banking app (Minna no Ginko, with its huge numerals, hatched fills and restraint).

We borrowed ideas, not artifacts. From the first we kept the habit of drawing structure with lines and treating the screen as a record. From the second we kept the confidence of one enormous number on a quiet field. We did not keep the DOS palette, the fake system chatter, text-mode characters, or the banking app’s white page and illustrations.

From here the system stands on its own. When a design question comes up, answer it with the principles below, not by going back to the references.

## 2. Philosophy

**A ledger for friends: heavy, plain and exact.**

This is a game played between people who know each other, with real social stakes and an invented currency, brics. The interface should treat the numbers with the seriousness of a ledger and leave the playfulness to the people. Gravity lives in the form, and humor lives in the content: the questions people ask, the events they bet on, the names they use.

The core metaphor is the **ledger**: everything on screen is a record, and records are ruled, aligned and dated.

### Principles (Settled)

**1. Everything means something.** Every label, badge, line, color and word on screen must refer to a real thing in the product. If you can’t say what an element means, remove it. _Test: point at any element and explain what it tells the user. “It looks technical” is not an answer._ This is the principle that removed the invented status labels from the first wallet draft.

**2. Structure is drawn, not decorated.** We separate and group content with lines. We don’t use shadows, rounded corners, gradients or tinted surfaces. Different line styles mean different things (see Line language).

**3. Heavy, never delicate.** Type is medium or bold, lines are thick, and numbers are large. Nothing should look faint or tentative. _Test: squint. Every element should still be legible._

**4. Color is a job, not a mood.** Each color has one role and one rule within its layer: interface colors say what the interface is doing, and series colors say which option a data series belongs to. We add a color only when a new job exists that no current color can do.

**5. Numbers are the hero.** The most important number on any screen is the largest thing on it. Everything else is labeled, aligned and quiet around it.

**6. Shape before color.** Meaning is carried by pattern, weight, position and words first. Color confirms meaning but never carries it alone.

**7. Plain words.** We name things by what they are. No jargon, no invented system language, no exclamation marks.

**8. Quiet by default, loud on money. (Proposed)** Everyday screens use the lightest treatment of the system. The heaviest treatments (double-ruled dialogs, explicit before/after figures) are reserved for actions that move points.

## 3. Voice and copy (Proposed)

- **Declarative.** Say what is true: “Latest +20 · 12 transactions”, not “You’re on a roll!”
- **Specific.** Prefer exact figures to adjectives. Always show the sign on a change (+20, −35).
- **Before and after.** When something changes a balance, show both numbers with an arrow: “+45 → 555 brics”.
- **No chrome humor.** No emoji, no “oops”, no mascots in the interface itself. The fun comes from user-generated content, such as market questions and event names.
- **Casing.** Uppercase is for the page title and column heads only. Panel titles use title case. Everything else uses sentence case.
- **Names for real states only.** Use the actual lifecycle of the thing, for example a market that is Open, Closed or Settled. Never add decorative status words.
- **Unit.** The platform is Bric and its currency is brics (“1 bric”, “20 brics”). Write the platform with a capital B and the currency in lowercase. The Bric symbol replaces “pts” everywhere in the interface; where it sits relative to the number is still open (see Section 10).

**Direction: earnest accumulation (Proposed).** The voice pushes the user to gather more brics, and it means it.

- **Sincere, never ironic.** Brics are treated as worth having, growing and protecting. The voice never comments on how pointless they are, never winks and never undercuts itself. Any absurdity is left for the user to notice.
- **Forward-leaning.** Point at the next thing to gain: the gap to the next rank, the next round number, the next open market. “45 more to 600.” “Second place is 40 brics ahead.”
- **Plain verbs of accumulation.** Gain, hold, grow, reach. Brics are never called money, cash or funds, and never described as worthless or fake.
- **Numbers carry the push.** Gaps, targets and ranks do the motivating, not hype words or exclamation marks.
- **Plain on loss and error.** A loss or a failure is stated flatly, with the number and the next step. The voice doesn’t console and doesn’t joke.
- **Stakes stay legible.** Anything that moves brics follows the before-and-after rule above, so the earnest tone never blurs a balance.

## 4. Foundations

### Color (Settled)

| Token            | Value              | Job                                               | Rules                                                                                |
| ---------------- | ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ground           | `#000000`          | Page and every box background                     | Never tinted or layered.                                                             |
| Ink              | `#ffffff`          | All lines and all body text                       | Lines are always Ink.                                                                |
| Fill             | `#00a0a0` (teal)   | Selected, active, labeled and header fills        | Text on Fill is always black, never white.                                           |
| Hatch            | `#00b3b3`          | Chart pattern fill only                           | Not used for text or borders.                                                        |
| Mark             | `#ffd400` (yellow) | The first letter of each panel title              | Rare by design. See extension rule below.                                            |
| Guide            | `#bdbdbd`          | Chart gridlines and other tertiary guides         | Never for text.                                                                      |
| Alert (proposed) | #ff2400 (red)      | Errors, failures, losses and irreversible actions | Always paired with a word or a sign. Black text on a red fill. Never a series color. |

Rules:

- Dark only. There is no light theme and no theme toggle. Set `color-scheme: dark`.
- No gradients, transparency effects or additional hues without a new job (see Extending the system).
- Gains and losses are never shown by color alone. A loss carries a minus sign and a hatched fill. A gain stays in Ink and is never green (see Data visualization).
- **Mark extension (Proposed):** if yellow ever needs a second job, it should be “needs your attention” (an unsettled market you’ve bet on, an open invitation). Don’t use it for decoration.

Contrast (approximate): white on black is about 21:1, black on teal about 6.5:1, yellow on black about 14.7:1, red on black about 5.5:1. White on teal is about 3.2:1 and fails, which is why text on teal is always black.

**Alert red (Proposed).** Red appears only to say something went wrong or something can’t be undone: an error, a failed action, a loss, an irreversible confirmation. It is always paired with a word or a sign, so a loss reads “−35” and an error names the problem. It appears in text, thin borders, or a small label with black text on a red fill, and never fills a panel. Gains stay in Ink and are never green.

### Series colors (Proposed)

Prediction markets often have more than two options, and every option needs a stable identity across charts, positions and the ledger. The interface colors can’t do that job, so the system has a second layer: **series colors**. They exist only to tell one option from another.

| Slot | Color  | Value     | Hue  | Contrast on black | Marker         |
| ---- | ------ | --------- | ---- | ----------------- | -------------- |
| 1    | Teal   | `#00a0a0` | 180° | 6.5:1             | Solid square   |
| 2    | Yellow | `#ffd400` | 50°  | 14.7:1            | Solid diamond  |
| 3    | Blue   | `#3366ff` | 225° | 4.5:1             | Solid triangle |
| 4    | Green  | `#00ff00` | 120° | 15.3:1            | Cross (×)      |
| 5    | Orange | `#ff8000` | 30°  | 8.3:1             | Hollow square  |

The hues are spread around the wheel, with red (about 8°) held back for the Alert job. Teal, yellow, green and orange are fully saturated. Orange sits closest to red, so it leans on its marker and label, and red is always paired with a word or a sign. Blue is as pure as legibility allows: pure blue (#0000ff) is only 2.4:1 against black, so the system uses #3366ff at 4.5:1 and draws it with 3px lines and larger markers. The other four sit at 6:1 or better.

- **Stable slots.** An option keeps its slot for the life of its market, everywhere it appears: chart line, position row, ledger tag, market card.
- **Five at most.** A market with more than five options shows the top four in color and groups the rest as “Other”, drawn in Ink and hatched.
- **Red and green are not signals.** Red is never a series color, not even for “No”. Green never means a gain. Binary markets use teal alone: solid for Yes, hatched for No.
- **Never color alone.** Each series also has its marker shape and a direct label at the end of its line. Some of these hues sit close for people with color-vision differences (teal, green and blue), so the marker and label carry the identity.
- **Where they may appear.** Lines, markers, bar and area fills, and a small square key beside an option’s name. Never borders, buttons, panel backgrounds or other interface chrome. Text on a series fill is black.
- **Dashes stay free.** Dash patterns mean “estimate” (see Data visualization), so series are never told apart by dashes.
- **The readout bar follows the series.** When a chart is read at a point, the label cell takes the Series color of the option being read.

### Typography (Settled)

**Typeface:** IBM Plex Mono, weights 500 and 700 only. Fallbacks: ui-monospace, Menlo, Consolas, monospace. Nothing lighter than 500, ever.

Why monospace: columns align without effort, numerals read as a record, and the typeface carries the ledger character on its own so we don’t need ornament.

| Role                    | Size | Weight                 | Notes                                                                    |
| ----------------------- | ---- | ---------------------- | ------------------------------------------------------------------------ |
| Display numeral         | 60px | 700                    | Letter-spacing −0.03em. Unit sits beside it at 16px, spacing reset to 0. |
| Page title              | 30px | 700                    | Uppercase, letter-spacing +0.04em.                                       |
| Panel title             | 16px | 700                    | Sits in the border like a notch. First letter in Mark yellow.            |
| Body                    | 15px | 500                    | Line height 1.5.                                                         |
| Small / table / readout | 13px | 500 (700 for emphasis) |                                                                          |
| Chart labels            | 12px | 500                    |                                                                          |

Rules:

- Hierarchy comes from size and weight, never from color or opacity.
- Numbers are right-aligned in tables. Running totals and balances are bold.
- The Mark-colored first letter is the same size and weight as the rest of the word, with no background block or padding. This avoids sizing and spacing problems.
- **Proposed:** move sizes to rem so text respects user settings, keeping the same proportions.

### Line language (Settled)

Lines are the system’s grammar. Each style has a meaning, so the style tells the reader what kind of boundary they’re looking at.

| Line                      | Weight | Meaning                                      | Where it appears                                        |
| ------------------------- | ------ | -------------------------------------------- | ------------------------------------------------------- |
| Double                    | 4px    | A major unit that contains things            | Panels, the title block, the rule under a table header  |
| Solid                     | 3px    | Data itself                                  | Chart frame, the data line                              |
| Solid                     | 2px    | A secondary container or control             | Ledger container, readout bar, chips, buttons           |
| Solid                     | 1px    | A division between neighbors                 | Table column dividers                                   |
| Dashed (short)            | 1–2px  | More of the same, divided inside a container | The rule under the balance numeral, ledger row dividers |
| Dashed (long, 6/4)        | 1.5px  | Reference marks                              | Chart gridlines                                         |
| Dotted / short dash (2/3) | 1.5px  | Transient guides                             | The cursor line on a chart                              |

**The dashed rule:** dashes are a delineation tool, not a theme. Use them to divide repeated or related content inside a container. Don’t use them for borders around containers, and don’t add them for texture.

### Shape, space and grid

- **Radius is always 0.** No shadows.
- **Spacing scale (Settled):** 4, 8, 12, 18. Page padding 12. Gap between panels 18. Panel padding 10 / 12 / 14.
- **Mobile layout (Settled):** a single column, maximum width 480px, centered. Respect safe-area insets.
- **Wider screens (Proposed):** the panel is the layout unit. Above roughly 900px, panels may tile in two columns with the same 18px gap. Never stretch a single panel wider than the mobile measure for reading text. Wide tables may scroll within their container.

### Iconography and illustration (Proposed)

Base icons are the system’s small alphabet; illustrations are its hand-drawn objects. They share black ground and white ink, but not construction rules. Interface structure and base icons are clean and exact. Illustration has confident irregular contours and organic curves; it does not inherit the icon grid or uniform stroke weights.

**Philosophy: ruled, labeled and few.**

**1. An icon is a drawn word.** Each icon depicts one concrete thing the product has: a wallet, a market, a position, a ledger, a circle of friends. If the product has no such thing, there is no icon for it. This is Principle 1 applied to pictures.

**2. Always beside a word.** An icon is never the only way to find or understand something. It sits next to or above a text label. Close and back are the only exceptions, and they still carry an accessible name.

**3. Drawn with the line language.** Icons use the interface’s own lines: 2px strokes, square caps, mitered corners. Fills are limited to solid Ink and the 45° hatch. Prefer straight segments at 0°, 45° and 90°, and use a curve only where the real object is round.

**4. One ink.** An icon is a single color: Ink by default, Alert red for warnings and failures, or a Series color when it identifies one option. Never two colors in one icon and never a gradient.

**5. Ledger metaphors first.** Reach for the vocabulary of paper records: boxes, ticks, strikes, stamps, rules, tabs and margin marks. Market states are drawn as ledger boxes: an empty box for Open, a struck box for Closed and a ticked box for Settled.

**6. A small, closed set.** Aim for 20 to 30 glyphs in total. A new one is drawn only if it passes the Extending the system checklist, and it joins the set instead of being drawn ad hoc.

**7. Heavy and exact.** Icons follow Principle 3 as much as type does. A glyph that falls apart when squinted at, or that needs a thin line to work, is redrawn.

**Construction**

| Size | Stroke | Use                                           |
| ---- | ------ | --------------------------------------------- |
| 16px | 2px    | Inline beside small text                      |
| 24px | 2px    | Default size for navigation, buttons and rows |
| 48px | 3px    | Spot icons in empty states                    |

- Build on a 24 × 24 grid with a 20 × 20 live area and a 2px margin. Place points on whole-number coordinates so 2px strokes land crisp on the pixel grid.
- Ship as SVG with `stroke` set to `currentColor`, `fill` set to `none`, square caps and mitered joins, so an icon takes its color from the surrounding text.
- A standalone icon button is a 44px square with a 2px Ink border.
- Base icons never animate. The illustrated wallet uses the piggy bank instead of a geometric wallet glyph; the reward coin has the specific motion exception below.
- An icon next to its label is hidden from screen readers. A standalone icon button carries an accessible name.

**The Bric mark.** The Bric symbol is also the currency mark, so it will be the most-seen icon in the product. See Logo and symbol for how it is used. Icons drawn for the interface sit beside it and follow the construction rules above; the symbol is the one exception.

**Starting vocabulary (Proposed).** The Bric symbol, wallet, markets, positions, ledger, circle (people), invite, the three market-state boxes, alert, add, edit, share, search, back and close.

**Illustration**

Spot illustration is for moments where the interface has room to be human: empty states, onboarding and rare milestones. It does not compete with a chart or a dense table. The wallet piggy bank is a functional exception: it identifies the wallet beside a label even when a ledger is present.

- **Style.** White artwork on black, drawn with a confident hand: naturally irregular contours, not geometric approximations or a uniform icon stroke. Preserve the supplied drawing’s proportions and line character. Fills are limited to small solid Ink shapes and the 45° teal hatch.
- **Reference assets (Settled direction, implementation pending).** `images/BRIC/piggy_bank.svg` identifies the wallet; `images/BRIC/coin_illustrated.svg` represents a credited reward. The current assets are black artwork. The author will supply dark-background variants; do not recolor the files or introduce a white illustration area.
- **Subject.** The social world the bets are about: friends, rooms, food, dice, tickets, game night. The wallet piggy bank and individual reward coin are explicit functional exceptions. Coin stacks, rockets, bulls and bears, and upward arrows remain excluded.
- **People.** Drawn in profile or from behind with minimal facial detail, so any friend group can see itself in them. No recurring mascot.
- **Placement.** One spot illustration per screen at most, never behind text or data, sized 160 to 240px. The wallet artwork is scaled proportionally for its control or panel context; it must not obscure the ledger. Its control retains a text label or accessible name and a touch target of at least 44px.
- **Not allowed.** Gradients, photographs, 3D, emoji and stock illustration styles.
- **Accessibility.** An illustration that adds nothing the text doesn’t already say gets an empty alt text.
- **Warmth.** The product’s personality lives here and in user-generated content, not in the interface chrome.

### Logo and symbol (files supplied; usage rules Proposed)

The brand has two marks, both supplied as SVG. The **logo** reads as two interlocking B shapes, tilted. The **symbol** is a heavy B crossed by a vertical bar, with a rounded flourish on its left; the bar is the same device currency symbols use. The symbol doubles as the currency mark and stands wherever “pts” used to stand.

| File                                                           | Use                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bric_symbol_white.svg`                                        | Default symbol: white on black, everywhere in the interface                                                  |
| `bric_symbol_white_sm.svg`                                     | Same symbol, for small sizes such as inline beside numerals and favicons (assumed purpose of the \_sm files) |
| `bric_logo.svg`                                                | Full logo in white, for headers, splash and share images on black                                            |
| `bric_symbol.svg`, `bric_symbol_sm.svg`, `bric_logo_black.svg` | Black versions for light surfaces such as print and documents                                                |

- **Unmodified marks.** The interface is built from straight rules and right angles; supplied marks and hand-drawn illustration may have organic curves. Do not round, outline, shadow, tilt, stretch or recolor the logo or symbol to match the interface, and set them against plain black so the contrast does the work.
- **Always Ink.** White on black, black on light surfaces. Series colors, Fill and Alert never tint the marks.
- **Clear space.** At least the width of the symbol’s vertical bar on every side, which is about 13% of the symbol’s width.
- **Small sizes.** Use the small symbol file where the openings in the B start to close up. The size at which it takes over is open (see Section 10).
- **Beside numerals.** Size the symbol to the cap height of the figures next to it. Use the word “brics” in running copy and the symbol in tables, the readout bar and the display numeral.
- **Never behind content.** Not behind text, charts or tables, and not as a pattern or watermark.

### Motion (Settled direction, implementation pending)

**Embedded portal (Settled direction).** The BriSpace wallet lives in a fixed
bottom-right teal organic shape containing the piggy bank, Wallet label and
balance, replacing the navigation wallet button. The blob marks the boundary
to Bric; it is an explicit exception to straight-edged UI chrome, not a general
rounded-control style. A tuck-away control leaves an accessible edge tab.
Remember that choice on this browser across pages and visits, and respect
safe areas and mobile bottom navigation.

The embedded portal is icon-only, with a smaller stationary piggy bank on a
slowly morphing teal blob and subtle teal glow. Dragging toward the right edge
tucks it away; an icon-only edge tab restores it. A keyboard-focus tuck control
remains available. Accessible names replace visible labels here. This is a
specific exception to the no-shadow and no-loop rules for the portal boundary;
other Bric controls remain clean-lined. Reduced motion disables morphing.
The piggy bank stays centered independently of the coin's flight area; reward
coins still enter its slot from above the teal shape. A dark teal center and
brighter irregular rim suggest depth. The gradient is a portal-specific
exception alongside its glow, not a general panel treatment.

**Current portal direction:** the opening is nearly circular and its rim moves
only slightly. A teal rim surrounds a black viewport containing a cropped
white double-ruled wallet surface with a teal header band and the centered pig.
This replaces the teal gradient interior: we see a glimpse of Bric's design,
not a teal object on BriSpace. No invented data or visible labels are added.
The coin drop, drag dismissal and reduced-motion behavior remain.

**Light-preview experiment:** inside the embedded portal, a white viewport
contains a centered black double-ruled wallet box and centered piggy bank,
with a small legend-style notch and no visible text. This replaces the black
preview and teal header band only; the full product's dark-only decision and
the surrounding BriSpace theme are unchanged.

**Actual wallet portal (current direction):** the opening is a crop of the
real light Bric wallet, not an imitation of another site's UI. The same surface
expands on click, revealing its balance, daily check-in and recent activity.
The lower-right illustrated pig and varied copies of the hand-drawn coin
decorate the bottom. Keep the expanded boundary circular with black around the
separate white double-ruled box. The heading says Wallet; the balance summary
includes latest change and total transactions. Activity reserves four scrollable
rows. Coin-drop preview is test-only (`?walletPreview=1` on localhost).
Clean monospace controls and teal action fills replace the legacy
wallet dialog. Close/Escape returns to the crop; retain sound, coin motion and
drag dismissal. Clipped controls are inert, and the expanded surface uses
native modal focus. A brief 320ms expansion is an explicit portal exception;
reduced motion makes it immediate. This does not expand the product scope.

- Motion is functional only: it confirms a state change.
- Ordinary UI state changes are immediate or a single step of 100ms or less. No easing flourishes, springs or looping animation.
- **Confirmed-reward exception.** After a newly confirmed bric credit, one illustrated coin falls into the piggy bank’s slot. Short, hand-drawn white trailing lines on black make its movement visible. The piggy bank stays still; the coin is occluded at the slot and both coin and trails are removed afterward.
- One brief drop represents one confirmed reward, regardless of amount. Failed or capped attempts, idempotent replays and loading historical transactions never trigger it. No confetti or unrelated celebration; the Bric logo and currency symbol never animate.
- Motion trails are transient illustration strokes, not a new border style, chart guide or background texture.
- Exact gain and before/after balances remain visible independently. Update the balance without waiting for the animation; never block interaction or move focus for it.
- With reduced motion, skip the drop and trails entirely and show the same static balance feedback.
- Embedded and standalone wallets share this treatment. These illustration decisions do not add charts, markets or other full-product features to the current repository’s limited wallet scope.

## 5. Components

### Settled (built in the wallet)

- **Title block.** Black box, 4px double white border, uppercase title.
- **Panel.** A fieldset with a 4px double white border, black background, and a legend that sits in the border. The first letter of the legend is yellow.
- **Range chips.** Buttons with a 2px white border and bold white text. The selected chip gets a teal fill and black text. Used for choosing a time range or any small exclusive choice.
- **Line chart.** See Data visualization. Dashed gridlines, a 3px frame and data line, square markers, and a hatched teal fill beneath.
- **Readout bar.** A 2px bordered bar below a chart. The left cell is a teal label with black bold text (the date or name), and the right cell shows the value. When nothing is selected it reads “---” and a plain instruction.
- **Ledger table.** A scrolling container with a sticky teal header row and a 4px double rule beneath it. Solid 1px column dividers, dashed row dividers, right-aligned numbers, newest first.
- **Footer note.** Small bold white text beneath the panels.

### Proposed (not yet built)

- **Buttons.** Primary: teal fill, black bold text, 2px white border. Secondary: black fill, white text, 2px white border. Irreversible actions go through a confirmation dialog with a double border and a red label that names the consequence.
- **Form fields.** A 2px white rectangle, monospace text, no radius. The label sits above in 13px bold. Radios and checkboxes are drawn as text-style glyphs, with the selected state shown as a teal-filled square. Errors are a sentence beneath the field that says what is wrong and how to fix it.
- **Confirmation dialog (money-moving actions).** A panel with a double border and a legend that states exactly what will happen, such as “Place bet”. It shows the amount, the choice, and the balance before and after (“555 → 515 brics”). The confirm button is primary, and cancel sits beside it. Nothing is preselected for irreversible actions.
- **Navigation.** A bottom bar with a text label for every destination. The current destination has a teal fill and black text. Icons, if used, accompany the label.
- **Market card.** A panel whose legend is the question. It shows current probability as a large numeral, a status word (Open, Closed or Settled), and a one-line detail. Details are divided with dashes.
- **Empty state.** A ruled box with one plain sentence about what is missing and, if there’s one, the action to take. A spot illustration is optional (see Iconography and illustration).
- **Error and failure states.** A ruled box with a 2px red border and a black-on-red label that names the real problem (for example “Failed” or “Not enough brics”), followed by one sentence on what happened and what to do. Red appears nowhere else on that screen.

## 6. Data visualization

### Encoding order (Settled for the line chart, Proposed for extensions)

Encode meaning in this order: **position, then pattern, then weight, then color.** Color is last and never alone.

- **Frame always.** Every chart has a 3px solid white plot frame.
- **Grid.** Dashed long gridlines in Guide gray, about four or five divisions, with round-number axis bounds.
- **Fill.** The area under a line uses the hatch pattern (45 degrees, 6px pitch) in Hatch teal.
- **Markers.** Straight-sided shapes, never circles, at real data points: a solid square for a single series, and each series’ own shape when there are several (see Series colors). No markers on computed anchor points.
- **Interaction.** Tapping or hovering snaps to the nearest real data point and shows a dashed vertical guide, a teal square marker and a readout bar.

### Proposed mappings

- **Solid vs hatched:** solid fill is the primary or positive side (holdings, gains, yes). Hatched fill is the opposing side (losses, no). This keeps the meaning readable in monochrome.
- **Multiple series:** distinguish them by Series color plus marker shape, labeled directly at the end of each line. A legend is the fallback. Dash patterns are reserved for estimates.
- **Probability charts:** the axis runs 0 to 100%, always with percent labels.
- **Estimates:** a dashed data line means an estimate or projection. A solid line means something that happened.
- **Bars:** white-outlined bars filled with the option’s Series color. The opposing side of a binary market is the same color, hatched.

### Multi-option markets (Proposed)

- **One line per option** in its Series color and marker, on a 0 to 100% axis. The options’ probabilities sum to 100%.
- **Label directly.** Name each line at its right end, leader first. A legend is a fallback only.
- **Read all at once.** The readout bar shows one cell per option at the selected point, sorted by value, each label cell in that option’s Series color.
- **Shares of a whole.** When the question is how the total splits, a stacked bar is allowed, with segments in slot order separated by 2px Ink lines.
- **Many options.** Past five, the smallest options collapse into “Other” (see Series colors).

## 7. Accessibility (Settled unless noted)

- Use real semantic elements: fieldset and legend for panels, table with thead and tbody for ledgers, buttons with aria-pressed for toggles, and role and label on charts.
- Focus ring is 3px white with a 2px offset on every interactive element.
- Never use color as the only signal.
- **Known gap:** the range chips are about 30px tall. The target is at least 44px for touch. Fix this before the next release.
- **Proposed:** give each chart a text summary or a data table alternative.
- Respect reduced motion: reward feedback remains available as static exact figures, with no coin drop or trails.

**Known gap (blue).** Black text on the blue series fill is 4.49:1, just under the 4.5:1 target for small text. If it fails review, lighten the blue slightly rather than changing the text color.

## 8. Extending the system

When something new is needed, check it against these questions in order:

1. **What does it mean?** If it has no real referent in the product, don’t add it.
2. **Does an existing component do this job?** Reuse before inventing.
3. **Which line is it?** Pick from the line table. Don’t invent a new border style.
4. **Which color job is it?** Use the interface colors by their rules, or a Series color if it identifies one option among several. A new color needs a new job.
5. **Does it survive in monochrome?** If meaning is lost without color, add pattern or words.
6. **Does it stay heavy?** Type at 500 or above, lines at 1px or thicker for dividers and 2px or thicker for containers.
7. **Is it loud only when money moves?** Match the treatment to the stakes.

## 9. What this system is not

- Not a retro costume. It doesn’t imitate DOS, a terminal or a spreadsheet. We use the discipline of those interfaces, not their palette or jargon.
- Not a banking app. No reassurance language and no imagery of comfort.
- Not playful in its chrome. No confetti, mascots, rounded stickers, or exclamation points.
- Not light, soft, or translucent.

## 10. Open questions

1. **Name and wordmark.** The platform is Bric. Decide whether the title block shows the logo, the symbol or the word.
2. **Currency.** The platform is Bric and the currency is brics. Confirm the capitalization and plural proposed in Voice, and decide whether the symbol goes before or after the number.
3. **Errors and failures.** Red now covers errors, failures, losses and irreversible actions (see Color). Confirm it should not also mean “No” or “down” in market charts.
4. **Keyboard shortcuts.** The highlighted first letters currently don’t do anything. Either make them real shortcuts on desktop, or accept that they are a stylistic mark and document them that way.
5. **Illustration.** The piggy bank and coin samples establish the hand-drawn direction. Dark-background variants are still needed, followed by review at actual wallet sizes and of the brief reward drop.
6. **Light mode.** The current answer is never. Confirm that holds for print and shared-link views.
7. **Touch sizing.** Raise chips and any other small controls to the 44px target.
8. **Sound and haptics.** None so far. Decide whether any belong on money-moving confirmations.

**Also open**

- **The symbol as currency.** Check that the Bric symbol holds up beside numerals at 16px and 24px, and decide the size at which the small version takes over.
- **Series count.** Five series colors cover most markets. Confirm that anything beyond five collapses into “Other”, or decide on a sixth color.
- **Series palette.** The new hues (green, blue, orange, and red for alerts) are proposals in pure, saturated values. Check them on a real multi-option chart before locking them, especially blue, which is as pure as legibility allows.

## Appendix: token reference

```css
:root {
  color-scheme: dark;

  /* color */
  --ground: #000000; /* page + box backgrounds */
  --ink: #ffffff; /* all lines + text */
  --fill: #00a0a0; /* selected / header / label fills; black text on top */
  --hatch: #00b3b3; /* chart pattern only */
  --mark: #ffd400; /* first letter of panel titles */
  --guide: #bdbdbd; /* gridlines */

  /* type */
  --font: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
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

  /* shape */
  --radius: 0;
}
```

**Alert and series tokens**

```css
:root {
  /* alert: errors, failures, losses, irreversible actions */
  --alert: #ff2400;

  /* series: identify one option among several; assigned by slot */
  --series-1: #00a0a0; /* teal,   solid square    */
  --series-2: #ffd400; /* yellow, solid diamond   */
  --series-3: #3366ff; /* blue,   solid triangle  */
  --series-4: #00ff00; /* green,  cross           */
  --series-5: #ff8000; /* orange, hollow square   */
}
```

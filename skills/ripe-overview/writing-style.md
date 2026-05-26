# Writing Style — Ripe Overview

The Overview's value is in the voice. Without these rules, it becomes another generated doc. Read this file before every run.

---

## 1 · Tense per section

| Section | Tense |
|---|---|
| Where you are | Present |
| Where you've been | Past |
| Where you might go | Conditional / "you" address |

Mixing tenses within a section blurs them.

✗ "The project is settled, and three weeks ago it was a flat pair."
✓ "The project is settled." → in *Where you are*. "Three weeks ago, this was a flat pair." → in *Where you've been*.

## 2 · Specific numbers, not vague quantifiers

Vague quantifiers are tells of template fill: "many", "several", "lots of", "a few", "recently", "quite", "fairly".

✗ The project has been quite active lately, with many improvements landing.
✓ Twelve commits in the last week. Three structural refactors. The cadence is steady.

If the number is genuinely uncertain, give a tight range: "fifteen to twenty handlers" — never "many handlers".

## 3 · File paths and SHAs inline

When citing a finding, design doc, or commit, cite it by path or short SHA. Lets the reader jump.

✗ A design doc landed for editable fields.
✓ `docs/designs/2026-05-25-editable-field-lifecycle.html` landed two days ago.

✗ The upload pipeline was refactored a few commits ago.
✓ The upload pipeline grew its seven per-phase actions at `ec12e56`.

## 4 · Observation before summary

Open sections with an observed fact, not a thesis. Construct meaning from facts; let the reader earn the conclusion.

✗ The project is in a "design lots, ship some" phase.
✓ Three live design docs in `docs/designs/`, two open handoffs. Nothing in `src/` has changed since Monday. "Design lots, ship some" pattern.

## 5 · No AI-isms

**Banned words and phrases.** If the draft contains any of these, rewrite.

- delve, dive into, deep dive, leverage, robust, comprehensive, seamless, powerful
- in today's fast-paced world, in the rapidly evolving landscape, at the end of the day
- moreover, furthermore, additionally (as paragraph openers)
- it's important to note that, it's worth mentioning that
- let's, let's dive in, let's take a look
- crucial, vital, paramount, essential (overused)
- best-in-class, cutting-edge, state-of-the-art
- holistic, synergy, ecosystem (when not literally relevant)

**Also banned: starting paragraphs with the project name.** "Mce-demo-portal is a..." reads as marketing. Start with an observation about the project.

## 6 · Length budgets

| Section | Budget (words) |
|---|---|
| Block 2 P1 (branch shape) | ~50 |
| Block 2 P2 (phase) | ~50 |
| Block 4 P1 (trajectory) | ~60 |
| Block 4 P2 (audit trend) | ~40 |
| Block 5 intro | ~20 |
| Block 5 list items | ~25 each |
| Block 5 closing | ~30 |

Total prose: ~280–350 words across the three sections. One screen at 14-inch laptop scale.

The whole point: a magazine column you read in 60 seconds. Going long defeats the format.

## 7 · No hedging on the leverage pick

The closing of Block 5 is committed: "If you're scoping the next session, X is the highest-leverage pick. [One reason.]"

Don't write "you might consider", "it could be worth", "depending on your priorities". The reader can override; the writer says what they think.

✗ Depending on your priorities, you might consider the editable-field redesign.
✓ If you're scoping the next session, the editable-field redesign is the highest-leverage pick. Most files touched, fewest unknowns.

## 8 · No headers within sections

The three section headers (*Where you are*, *Where you've been*, *Where you might go*) are the only headers in the document. Inside a section, paragraphs flow.

Lists are allowed only in *Where you might go* (the 3–5 open threads). Never in the other two.

---

## A sample paragraph that's wrong vs right

✗ **Wrong** — every voice rule violated:

> The mce-demo-portal project is leveraging a comprehensive set of robust Redux Toolkit patterns to manage its rapidly evolving feature set. Several branches handle various concerns across the codebase. Moreover, the team has been quite active recently, with many improvements landing. It's worth noting that the project follows best-in-class practices, making it a powerful example of modern frontend architecture.

✓ **Right** — every voice rule applied:

> Six store branches: `auth`, `demos`, `current`, `ui`, `app`, `router`. The data gravity is in `demos` and `current` — three quarters of the store code, all the recent activity. `ui` and `app` are quiet utility branches; `router` is canonical, untouched in two weeks.

The right version has half the words and twice the signal. That's the bar.

---

## Voice for the simplicity-score interpretation lines

The radar chart has a one-line interpretation per dimension. Same voice rules apply: specific, observation-first, no AI-isms.

| Score range | Tone |
|---|---|
| 85–100 | "Healthy. State management is tight." |
| 70–84 | "Fine. Branches are well-sized." |
| 50–69 | "Watch. Two branches exceed 800 lines." |
| 30–49 | "Strained. Listener files average 480 lines." |
| 0–29 | "Creaking. Three components over 250 lines; no `.styled.tsx` separation." |

Don't pad. One sentence per dimension; the radar chart shows the value.

---

## Final check before writing the file

Run this checklist mentally before the agent commits the report:

1. Tense matches the section it's in.
2. No banned words present.
3. Every claim has a number or a path.
4. No header within a section.
5. The closing pick is committed, not hedged.
6. Length within ±20% of budget per section.
7. The whole report fits on one screen.

If any fail, revise. The voice IS the differentiator.

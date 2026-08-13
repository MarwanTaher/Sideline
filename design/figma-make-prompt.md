# Figma Make prompt — Sideline redesign

How to use: open **Figma Make**, paste the prompt below, and **attach**:
1. `design/design-tokens.json` (colors, type, spacing, radius)
2. `design/DESIGN_SYSTEM.md` (component inventory + product context)
3. Screenshots of the current screens you want redesigned (home, availability, draft, matchday,
   voting, leaderboard, profile, players-admin) — as many as you have.

Then iterate one screen at a time using the follow-up prompts at the bottom.

---

## PROMPT (paste this)

You are a senior product designer. Redesign **Sideline**, a mobile-first PWA for organizing
recurring casual football (soccer) matches with friends. I've attached the current design
tokens (`design-tokens.json`), a design-system spec (`DESIGN_SYSTEM.md`), and screenshots of
the current app. Use them as the foundation — evolve the look, do not throw away the structure.

**Design direction:** modern, fun, energetic, and visually complete — like a polished consumer
sports app (think the playful confidence of a fitness or fantasy-sports app), NOT enterprise
software. It should feel alive and rewarding to use, while staying clean and fast.

**Keep as hard constraints:**
- Mobile-first, installable PWA; primary layouts target ~390px width, then scale up to tablet/desktop.
- Light AND dark themes, both first-class (base: light `#ffffff` / dark `#0d0d0d`).
- Buildable in **Tailwind CSS + React** — use standard scales (spacing, radius, type) so it maps to code.
- Touch targets ≥ 40px; visible focus states; status conveyed beyond color alone.
- Reuse the token palette: emerald accent, neutral surfaces, semantic success/warning/danger/info,
  and the 5-color team palette (rose, sky, emerald, amber, violet). You may introduce ONE canonical
  brand color (resolve emerald vs the lime `#a6ce39`) and a subtle shadow/elevation scale.

**Deliverables (make it visually complete):**
1. **Foundations page:** color styles (light + dark), type scale, spacing, radius, elevation,
   iconography style, and a short "voice & feel" note.
2. **Component library** as component sets with variants: Button (primary/secondary/danger/
   success/ghost × sm/md × default/hover/disabled/pending), Badge (5 tones + dot), Card, Input,
   Select, Avatar (photo + initials), Tabs/Sub-nav, Toast/Feedback, Empty state, List row,
   Stat tile, and the App header (mobile 3-zone app bar + drawer, and desktop inline nav).
3. **High-fidelity screens (light + dark, mobile first):**
   - Home / matches list
   - Match detail
   - Availability (in/out, player cap, **waitlist** with position + auto-promote)
   - Draft / lineup builder (2–5 teams, drag players, per-team color)
   - Matchday console (live score, goal/assist log, substitutions)
   - Voting (rate teammates, clear "out-of-scope" handling)
   - Leaderboard + player stats
   - Profile (photo/initials avatar, edit)
   - Players admin (roster, soft-delete + restore history)
4. **Key states for each flow:** empty, loading, error, full match, single player, permission-denied.
5. **A clickable prototype** of the core flow: open match → set availability → get waitlisted →
   promoted → matchday → vote.

**Make it fun (tasteful, not noisy):** playful micro-interactions and celebratory moments
(goal scored, promoted off the waitlist, match won), team color accents, a friendly empty-state
illustration style, rounded and confident components, and a lively but legible type treatment.
Keep information density comfortable on a phone.

Start by generating the **Foundations page + Component library**, then the **Home** and
**Availability** screens in both light and dark. Show them, then wait for my feedback before
continuing to the other screens.

---

## Follow-up prompts (one screen at a time)

- "Now design the **Draft / lineup builder** for 5 teams on mobile: draggable player chips,
  per-team color headers, a bench area, and an auto-balance action. Show light + dark."
- "Design the **Matchday console**: live scoreboard for two teams, a running goal/assist feed,
  and a substitution flow. Include the 'goal scored' celebration state."
- "Design the **Voting** screen: rate each teammate 0–10, with a clear treatment for votes the
  system flags as out-of-scope, plus the submitted/confirmation state."
- "Give me the **empty, loading, and error** states for the Availability screen."
- "Tighten spacing and type to a strict 4px scale and export the final color styles for both themes."

## Handoff back to code

- In Figma Dev Mode, read spacing/color/radius as tokens and mirror them in Tailwind.
- Or paste a screen screenshot into **v0.dev** with: "Rebuild this in React + Tailwind (dark mode
  via prefers-color-scheme), using these tokens: [paste design-tokens.json]."

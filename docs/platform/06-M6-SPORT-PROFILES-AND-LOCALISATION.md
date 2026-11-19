# M6 — Sport Profiles and Localisation (later, optional)

| | |
|---|---|
| Status | Idea. Don't start this until groups ask for it. |
| Depends on | [M4](./04-M4-GROUP-CONFIGURATION-AND-MODULES.md) (registry and modules), ideally [M5](./05-M5-PLATFORM-OPERATIONS-AND-ONBOARDING.md) |
| Overview | [00-OVERVIEW.md](./00-OVERVIEW.md) |

## 1. Why this is last

The core reservation logistics are mostly sport-neutral: availability, waitlist, guests,
seasons, seats, billing, and automation. They become reusable by any sport once M4 is done.
The football-specific parts are smaller but deeper:

| Football-specific | Where |
|---|---|
| Positions GK/DEF/MID/FWD | `players` CHECK constraint, `positions.ts`, draft board, bummer rules (MID/FWD assignment) |
| Goals/assists per round, mini-matches | `match_rounds`, `round_goals`, matchday console, results W/D/L |
| Stats fields and defensive stats | `stats`, `player_stats_submissions`, `legacy_defensive_stats` |
| Scoring engine | `scoring.ts`, a faithful port guarded by golden tests |
| Awards and achievements | `awards.ts`, `achievements.ts` |

Generalising these before real demand exists would risk the golden-tested engine for no user
benefit.

## 2. Approach when it's time

1. **Sport profile** as data: `sport_profiles(key, positions[], team_size_range, round_label, score_events[])`
   with `groups.sport_profile`. Football is the first profile and reproduces today exactly.
2. Replace the positions CHECK with an FK or validation against the group's profile.
3. **Scoring as a pluggable model.** Define a `ScoringModel` interface. The current engine
   becomes `football-v1` with no behaviour change, and golden tests pin it. Other sports start
   with a simple model, such as peer votes + win rate.
4. Modules that depend on football events (`ratings` stats, some `recognition` awards, `fun`
   bummer rules) declare `sports: ["football"]` in their manifest. They are hidden for other
   profiles until they get an equivalent.
5. Candidate second sports: ones that fit "teams drafted from a pool + rounds", such as
   futsal, basketball pickup, or volleyball. Racket sports (courts, pairs) would need a
   different draft/matchday model; treat that as a separate module, not a profile.

## 3. Localisation

ROADMAP already lists English/Polish. When it is needed:

- Externalise UI copy, validation messages, notification text, and plural forms. Use `locale`
  from the group (default) with an account override.
- Use `Intl` for dates and currency everywhere. M4's timezone and currency work already pushes
  formatting through helpers.
- Moment copy and fun messages already live in settings; make them per locale.

## 4. Exit criteria (when undertaken)

- [ ] Football groups unchanged (golden tests)
- [ ] One non-football group running on its profile with the modules that apply
- [ ] UI available in English and Polish

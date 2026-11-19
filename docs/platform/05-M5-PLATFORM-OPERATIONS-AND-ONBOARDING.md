# M5 — Platform Operations and Onboarding

| | |
|---|---|
| Status | Proposal |
| Depends on | [M3](./03-M3-ACCOUNTS-AND-MEMBERSHIP.md) and [M4](./04-M4-GROUP-CONFIGURATION-AND-MODULES.md) |
| Unlocks | Invited groups onboarding themselves; later, public signup |
| User-visible change | "Create a group" flow, email (free tier), platform console (platform admin only) |
| Overview | [00-OVERVIEW.md](./00-OVERVIEW.md) |

## 1. Goal

Groups the team doesn't personally know can create and run a group without developer help. The
platform also becomes safe to operate: correct hosting plan, email, backups, data export and
deletion, quotas, and per-group observability.

Rollout happens in three steps, each behind a platform setting:

| Step | Who can create a group |
|---|---|
| 1. Invite-only | Accounts on a platform allow-list (platform admin adds them) |
| 2. Waitlist | Anyone can request; platform admin approves |
| 3. Open | Anyone with a verified email, subject to quotas |

## 2. Free-tier guardrails (do this before step 1)

The platform stays on free tiers and charges nobody (overview §6). Instead of upgrading at a
limit, it stops admitting groups.

| Signal | Action |
|---|---|
| Neon storage or compute above ~70 % of the free limit (Diagnostics read-out + monthly console check) | Close new-group creation (waitlist). Tighten history retention, e.g. prune old `app_errors`, `vote_audit`, and push failure rows. |
| Vercel invocations or bandwidth above ~70 % | Close new-group creation; look at the heaviest pages per group |
| Blob storage nearing the limit | Enforce quotas (§6), compress uploads client-side, prune orphaned files in cron |
| Cron fan-out exceeding the function time budget | Batch with a cursor (M2); spread groups across hourly ticks |

**Scheduler.** Reminders must fire at each group's local time. Expose `/api/cron/tick`
(secret-protected, idempotent). Each run processes the groups whose local hour matches their
reminder settings. A free GitHub Actions `schedule` workflow calls it hourly with
`CRON_SECRET`, and the existing Vercel daily cron stays as a backstop. GitHub's scheduled runs
can start late or be skipped, so every job must tolerate a missed or late tick. The existing
notification leases prevent double sends when a tick is retried.

## 3. Group creation (self-service)

1. `/groups/new`: name, slug (availability check, reserved words), country → suggests time
   zone and currency, preset choice (M4 §5).
2. Creates the group, the owner membership, and the preset settings in one transaction.
3. A guided checklist on the new group's home: invite members, set the venue, create the first
   match, optionally enable seasons and billing.
4. The group starts in status `active` with quotas (§6).

## 4. Email

Required for strangers: account verification, password reset without an organiser, invites
by email, and optional notification fallback.

- Pick one transactional provider whose free tier covers the expected volume, with EU data
  residency where possible.
  Keep it behind `src/lib/email.ts` so it can be swapped later.
- Email verification sets `accounts.email_verified_at`. Self-service group creation needs a
  verified email.
- The self-service password reset sits alongside the existing organiser-mediated flow.
- Add SPF/DKIM for the sending domain. Rate-limit sends per account and per group.

## 5. Platform console (`/platform`, `platform_admin` only)

| View | Content |
|---|---|
| Groups | Slug, name, owner, status, created, members, matches last 30 days, storage used, errors last 7 days |
| Group detail | Settings snapshot, modules, quotas, audit, suspend / archive / restore |
| Support mode | Time-boxed, read-only entry into a group. Logged to `platform_audit` and visible to that group's owner. |
| Errors | `app_errors` across groups, filterable by group |
| Health | Cron last run per job, push failure rates, DB size, Blob usage |

Platform views use `platformSql` from the allow-listed files (M2 §5.3).

## 6. Quotas and abuse

| Limit | Initial value (tunable per group) |
|---|---|
| Groups owned per account | 3 |
| Active members per group | 100 |
| Upload size / total Blob per group | 5 MB / 200 MB |
| Invite links active per group | 20 |
| Push sends per group per day | 2 000 |

Store per-group overrides in `app_settings` (`quota.*`); only platform admins can edit them.
Enforce them in actions, and show "limit reached" states in the UI. Suspended groups are
read-only for members and receive no cron or push.

## 7. Data protection (EU users)

The platform stores personal data of EU residents: names, photos, availability, money owed,
and device push endpoints.

- **Roles:** each group's organiser decides why data is collected (controller). The platform
  processes it for them (processor) and is the controller for account data. Write a privacy
  policy and terms that state this. Have them reviewed before step 3 (open).
- **Group export:** owner-triggered ZIP of JSON/CSV for all group tables. This extends the
  existing CSV export, scoped by RLS.
- **Group deletion:** the owner requests it. The group is archived immediately and hard-deleted
  after 30 days by a cron job that deletes in FK order and removes Blob files under
  `groups/<id>/`.
- **Account deletion:** removes credentials, devices, and email. Member rows are anonymised
  ("Former member #123") so group history and money records stay consistent.
- **Money:** the platform never holds or moves money. It records what members owe organisers,
  which keeps it out of payment regulation. Keep that line.
- **Backups:** document Neon point-in-time restore for the chosen plan, and test a restore to a
  branch once per quarter (ROADMAP: Performance and Reliability).

## 8. Performance at multiple groups

- Check that every hot query uses an index leading with `group_id` (M1 §5). Run
  `EXPLAIN` on the top 10 pages with two seeded groups of realistic size.
- Score computation and caching are per group (M2). A busy group cannot invalidate another
  group's caches.
- The cron fan-out keeps a per-group time budget, and one failing group does not stop the
  others.
- Watch Neon compute: autosuspend keeps idle cost low, but many groups mean fewer idle periods.

## 9. Platform billing — not planned

Decided 2026-11-19: groups are never charged, and the platform stays on free tiers. Capacity is
managed with quotas and the waitlist (§2, §6). A group's own dues and billing modules are
unaffected; they track money between members and organisers, not money to the platform.

## 10. Support and documentation

- Organiser help pages: getting started, presets, modules, money settings and snapshots,
  inviting members.
- An in-app "Report a problem" link that writes to `app_errors` with context. No third-party
  widget.
- A short public status note (a static page is enough) for incidents.

## 11. Slices (PR-sized)

1. Free-tier usage read-out + `/api/cron/tick` + GitHub Actions hourly schedule
2. Email module + verification + self-service reset
3. Group creation flow (invite-only allow-list) + onboarding checklist
4. Quotas + suspended/read-only state
5. Platform console (groups, detail, errors, health)
6. Support mode with audit
7. Group export + deletion + account deletion/anonymisation
8. Privacy policy / terms pages; waitlist step

## 12. Exit criteria

- [ ] At least three groups outside the founders' circle created without developer help
- [ ] Usage of every free tier is visible in Diagnostics and below ~70 %; monthly cost stays $0
- [ ] Restore test done; export and deletion verified on Preview
- [ ] Cron delivers reminders at each group's local time
- [ ] ARCHITECTURE.md drivers (§1) and deployment (§4) updated for the platform

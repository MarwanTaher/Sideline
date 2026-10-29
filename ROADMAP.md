# Sideline Roadmap

Planned features and improvements for players, organisers, and future clubs.
Unchecked items are proposed work, not scheduled releases. Each checkbox can be
tracked as a focused issue with its own implementation and tests.

## Near Term

### Matchday Navigation

- [ ] Open the most useful match view for the current phase and role: availability, drafting, live play, or results. Preserve explicit deep links and access to other tabs.
- [ ] Test navigation across phase changes, refreshes, and back/forward navigation so players do not land on an irrelevant or inaccessible screen.

### Desktop and Mobile Polish

- [ ] Render billing settings forms once across responsive layouts, avoiding duplicate form controls, element IDs, and independent copies of form state.
- [ ] Replace fixed navigation-rail offsets with layout-aware positioning; check scrolling, sticky headers, and action visibility on small phones and wide desktops.
- [ ] Finish light/dark theme consistency for badges, status labels, empty states, charts, and browser chrome.
- [ ] Expand keyboard, screen-reader, contrast, touch-target, and reduced-motion regression checks for availability, drafting, voting, and billing.

### Reproducible Development Setup

- [ ] Provide deterministic fictional demo data covering matches, votes, awards, guests, subscriptions, and payments, with matching local parity baselines.
- [ ] Add a documented first-admin bootstrap for an empty development database, with explicit target checks and no committed passwords or production-data dependency.

## Next

### Faster Admin Reviews

- [ ] Bring pending stats, guest requests, and account approvals into a consistent review queue with filtering and links to the relevant match or player.
- [ ] Extend batch actions with explicit selection, per-item results, repeat-submission protection, and an audit trail. Keep payment confirmation separate from any trusted-player shortcuts.

### Invitations and Onboarding

- [ ] Build a guided club invitation flow on the existing account and link-based authentication, with expiry, revocation, and clear pending-approval states.
- [ ] Help new players set preferences, understand ratings, and discover app installation and notifications through short, contextual steps rather than repeated prompts.

### Sharing and Season Recaps

- [ ] Extend sharing beyond individual lineups to season highlights, achievement milestones, and end-of-season summary cards.
- [ ] Add suitable link previews and native sharing fallbacks, with explicit visibility controls and no contact, payment, or private account details in shared content.

### Performance and Reliability

- [ ] Measure remaining database round trips on admin and player pages, then batch independent reads and remove avoidable serial requests without weakening authorisation.
- [ ] Add cache-invalidation regression coverage for corrected scores, votes, match results, and season changes so performance improvements do not serve stale standings.
- [ ] Expand end-to-end coverage for registration, availability, drafting, matchday scoring, voting, and billing using disposable fictional fixtures.
- [ ] Document and exercise database backup/restore procedures, keeping disaster recovery distinct from CSV exports.

## Longer Term

### Multi-Club Support

- [ ] Introduce clubs and memberships with club-scoped organiser roles and an explicit active-club switcher.
- [ ] Scope database access, server actions, caches, uploaded files, and notification recipients to the active club; add cross-club isolation tests before public onboarding.
- [ ] Provide self-service club creation and invitation management, with club-specific scheduling, scoring, and billing settings.

### Localisation

- [ ] Externalise interface copy and add English/Polish translations, including validation messages, notification text, and plural forms.
- [ ] Apply locale-aware date, number, and currency formatting while retaining exact monetary values and explicit scheduling time zones.

### Optional Payment Reconciliation

- [ ] Evaluate hosted payment links and reconciliation with club organisers before selecting a payment provider; retain manual transfers as a supported option.
- [ ] If adopted, handle verified webhooks, duplicate events, failed payments, refunds, and reconciliation history without collecting card details in Sideline.

## Not Currently Planned

- General-purpose chat or a social feed that duplicates existing group messaging.
- Native mobile apps before a clear need beyond the installable web app.
- Fixed-position requirements in automatic team balancing; players can continue to rotate positions and organisers retain manual lineup control.
- Using achievements, predictions, or engagement streaks to inflate skill ratings.

See the [README](README.md) for the current application and development setup.
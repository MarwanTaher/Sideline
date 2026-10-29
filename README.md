# Sideline

Sideline is a mobile-first web app for organisers and players in a weekly football
group. It brings availability, balanced team drafting, live match scoring, player
ratings, awards, season subscriptions, and payment tracking into one place.

It currently serves a single private group, with plans to support a public
multi-club service. Players manage their participation and stats; admins organise
matches, approve accounts, and manage billing.

## Built With

- Next.js 16 App Router, React 19, and TypeScript.
- Tailwind CSS v4 with Outfit and Inter fonts.
- Auth.js / NextAuth v5 credentials authentication and JWT sessions.
- Neon PostgreSQL, Drizzle ORM, and parameterised SQL.
- Vercel hosting, Blob storage, and Cron; Web Push for notifications.
- Node.js tests, ESLint, and database-backed golden parity tests.

See [architecture](docs/ARCHITECTURE.md) and
[requirements](docs/REQUIREMENTS.md) for the application boundaries and behaviour.

## Roadmap

See the [project roadmap](ROADMAP.md) for planned features and improvements.

## Run Locally

### Requirements

- Node.js 20.9 or newer and npm.
- For the running application: a dedicated development Neon database
  with the reviewed schema and SQL migrations through `0036` already applied.
- An existing development admin account. Registration creates an inactive player
  who needs admin approval; there is no automatic first-admin bootstrap or bundled
  demo password. An empty database requires maintainer provisioning first.

The unit tests and lint checks do not need a database or environment file:

```bash
npm ci
npm run test:unit
npm run lint
```

### Application Configuration

On a fresh checkout, create a local environment file from the blank example. Do
not overwrite an existing environment file. In PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in the values locally; never commit them:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required: development Neon connection string. Never use production for local development or tests. |
| `AUTH_SECRET` | Required: a newly generated local authentication secret. |
| `CRON_SECRET` | Optional locally; required to authorise scheduled reminder requests. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional push configuration. Use separate development keys and no real device subscriptions. |
| `BLOB_READ_WRITE_TOKEN` | Optional uploads; use a dedicated development store, not production storage. |

Generate a local authentication secret with Node.js, then put the result only in
your local `AUTH_SECRET` setting:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Do not run migrations against an unverified connection. The SQL files in
`drizzle/` are reviewed migrations, not an automatic installation or seed command.
No migrations run as part of `npm run dev` or the database-free test gate.

Once the development database and account have been provisioned:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with that development
account. Only use made-up player and payment data in a demonstration database.

## Validation

```bash
npm run test:unit
npm run lint
npm run build
```

The unit gate is database-free and covers match phases, time boundaries, money,
personal moments, recorded audio, reminder scheduling, and export/log formatting.
It also checks local payment-QR payloads and score-snapshot revision/completeness rules.
`npm run build` runs this gate before compiling Next.js, including on Vercel.
The separate `test:scoring` and `test:awards` golden suites require database
configuration and are deliberately not run by the database-free gate.

### Golden Parity Tests and Fictional Samples

The committed [score examples](tests/golden_scores.json) and
[awards examples](tests/golden_awards.json) are entirely fictional format samples,
not engine-output baselines for a running database.

Database parity suites instead read ignored local baselines from `tests/.local/`.
Both snapshot exporters and parity suites require an explicit opt-in and an exact
approved hostname match before querying. Use a provisioned, approved non-production
database with fictional data, never production:

```powershell
$env:ALLOW_GOLDEN_DB_TESTS = "1"
$env:GOLDEN_DATABASE_HOST = "your-approved-preview-host.neon.tech"
npm run test:scoring:update
npm run test:awards:update
npm run test:scoring
npm run test:awards
```

The scripts load `DATABASE_URL` from the local environment file. Independently
verify the target database first: setting the hostname flag does not certify
that a database is non-production. Export baselines only after reviewing the
expected behaviour; do not regenerate them simply to silence a failing test.
The local snapshot directory is ignored and must never be committed or shared.

### Preview integration tests

Use an explicitly approved Preview database with the reviewed migrations through
`0036` already applied. Point the local `.env.local` at **Preview, never
production**, and ensure Preview has no registered push devices. The following
PowerShell opt-ins must identify that same approved host:

```powershell
$env:ALLOW_PREVIEW_DB_TESTS = "1"
$env:PREVIEW_DATABASE_HOST = "your-approved-preview-host.neon.tech"
node --use-system-ca --conditions=react-server --import tsx tests\preview-phases.test.mts
```

The suite creates uniquely named fixture players and an archived test season, checks
billing concurrency, credit release, checklist changes, reserve-list joins, auto-IN,
score revisions and sanitized error logging, and removes only its fixtures in `finally`.
It is deliberately excluded from the build/unit gate.

## Deployment Safety

The application targets Vercel. Use separate database, storage, and push
configuration for development, preview, and production environments.

The reminder schedule is configured in [vercel.json](vercel.json). Scheduled
requests require `CRON_SECRET`. Check the effective environment configuration
before running database-backed tests, builds, or a local production-mode server.

## License

Copyright 2026 Marwan Salah. Licensed under the [Apache License 2.0](LICENSE).

Bundled audio recordings are CC0; sources and checksums are listed in
[audio licenses](public/audio/LICENSES.txt). Third-party dependencies retain their
respective licenses.

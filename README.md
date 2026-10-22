This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Validation

```bash
npm run test:unit
npm run build
```

The unit gate is database-free and covers match phases, time boundaries, money,
personal moments, recorded audio, reminder scheduling, and export/log formatting.
It also checks local payment-QR payloads and score-snapshot revision/completeness rules.
`npm run build` runs this gate before compiling Next.js, including on Vercel.
The separate `test:scoring` and `test:awards` golden suites require database
configuration and are deliberately not run by the database-free gate.

Celebration and bummer recordings are bundled in `public/audio/`. Their verified
CC0 sources and file checksums are listed in [LICENSES.txt](./public/audio/LICENSES.txt).

### Preview integration tests

Apply migrations `0029`–`0034` to the approved Preview branch first. Point the local
`.env.local` at **Preview, never production**, and ensure Preview has no registered
push devices. The following PowerShell opt-ins must identify that same approved host:

```powershell
$env:ALLOW_PREVIEW_DB_TESTS = "1"
$env:PREVIEW_DATABASE_HOST = "your-approved-preview-host.neon.tech"
node --use-system-ca --conditions=react-server --import tsx tests\preview-phases.test.mts
```

The suite creates uniquely named fixture players and an archived test season, checks
billing concurrency, credit release, checklist changes, reserve-list joins, auto-IN,
score revisions and sanitized error logging, and removes only its fixtures in `finally`.
It is deliberately excluded from the build/unit gate.

> **Warning — `.env.production.local` wins in production mode.** `next build` and `next start`
> load `.env.production.local` *before* `.env.local`. If that file holds the production
> `DATABASE_URL`, a local production server talks to **production**, even though your scripts read
> Preview from `.env.local`. When testing locally, pin the database in the process environment
> (which overrides every `.env` file), for example:
>
> ```powershell
> $env:DATABASE_URL = node -e "process.stdout.write(require('dotenv').parse(require('fs').readFileSync('.env.local')).DATABASE_URL)"
> npx next start -p 3123
> ```

### Release prerequisites

- Migrations `0029`–`0036` are applied to Preview and production (2026-10-22). Any new
  environment needs them before running this code. `0033` adds predictions, `0034` the
  seat-swap tables, `0035` `season_invoices.hidden_at` (admin "Hide from player") and `0036`
  MultiSport leftover-credit settlement (`multisport_scans.settled_at/settled_as`).
  `0032` adds the per-match payment currency (`matches.payment_currency`, default `PLN`).
- Verify Vercel's daily reminders cron and separate Preview push configuration.
  Lock notifications are daily, not exact-time, and are **off by default** (enable the
  "Availability locked" type in Notifications settings to turn them on).
- Configure and verify Neon recovery/pre-season snapshots separately. The Diagnostics
  CSV exports are not a full database backup.
- Payment QR uses the Polish ZBP field layout (26-digit NRB, zero-padded grosz amount,
  UTF-8 recipient/reference) documented by
  [pl-qr-payment](https://github.com/IonBazan/pl-qr-payment).
  The encoder runs locally and never truncates payment details; manual transfer remains
  available when the fields do not fit.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

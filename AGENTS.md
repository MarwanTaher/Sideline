<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project conventions

- App Router pages in `src/app` compose data and render. Mutations belong in colocated Server Actions: validate input, re-check authorization, call domain logic in `src/lib`, then revalidate affected paths or scores.
- Keep database and other server-only modules out of `"use client"` components. A helper imported from a client component must not transitively import `src/lib/db.ts`; use client-safe helpers such as `src/lib/format-money.ts` and `import type` for server-side types.
- Before running database-backed tests or migrations, verify `DATABASE_URL` points to an explicitly approved non-production database. Never use production for test fixtures, and do not apply migrations unless requested. Follow the Preview test safeguards in [README.md](README.md).
- Keep schema changes as reviewed SQL migrations in `drizzle/`; do not assume migrations have been applied to a deployment database.

## Validation

- Run `npm run test:unit` for the database-free unit gate and `npm run lint` for ESLint.
- `npm run build` runs the unit gate before the Next.js build.
- Golden scoring and awards tests require database configuration; Preview integration tests have explicit opt-in and host checks. Follow [README.md](README.md) before running them.

## Project references

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module boundaries, data access, and deployment.
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): product behavior and requirements.

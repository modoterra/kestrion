# Repository Guidelines

## Project Structure & Module Organization
`src/index.tsx` boots the OpenTUI app, and `src/app.tsx` wires the top-level screen provider. Keep UI components in `src/components/app/`, shared runtime logic in `src/lib/`, and inference adapters in `src/lib/inference/`. Place tests beside the code they cover as `*.test.ts` or `*.test.tsx`; shared UI test helpers live in `src/test/`. There is no separate assets directory today.

## Build, Test, and Development Commands
- `bun run dev` starts the CLI app in watch mode.
- `bun run start` runs the app once without watching.
- `bun run test` runs the Bun test suite.
- `bun run typecheck` runs `tsc --noEmit`.
- `bun run harness:lint` checks Oxlint rules on `src/`.
- `bun run harness:fmt` formats `src/` with Oxfmt.
- `bun run harness` runs lint, format, typecheck, and tests in the expected pre-PR sequence.

## Coding Style & Naming Conventions
Use strict TypeScript and React with named exports only. Oxfmt enforces tabs, single quotes, no semicolons, sorted imports, trailing-comma-free objects, and a `printWidth` of 120. Oxlint forbids `any`, default exports, console logging, non-null assertions outside tests, and cyclic imports. Prefer `import type` where possible and add explicit function return types. Follow the existing naming pattern: kebab-case file names such as `conversation-view.tsx`, PascalCase for React components, and descriptive test names.

## Testing Guidelines
The project uses `bun:test`. Keep tests close to the feature under test and name them `*.test.ts` or `*.test.tsx`. UI behavior should use helpers from `src/test/app-test-utils.tsx`; service, config, and storage behavior belong in `src/lib/*.test.ts`. No coverage threshold is configured, so every user-visible behavior change or bug fix should include new or updated tests.

## Commit & Pull Request Guidelines
Current history starts with `Initial commit from create-tui`, so follow a simple imperative style for new commits, for example `Add provider config keyboard shortcuts`. Keep commits scoped to one change. PRs should summarize behavior changes, list verification commands such as `bun run harness`, and include terminal screenshots or captured frames when UI output changes.

## Security & Configuration Tips
Do not commit real credentials. Copy `.env.example` and set `FIREWORKS_API_KEY` locally, or use the generated config file at `~/.config/kestrion/config.json`. Runtime data is stored in `~/.share/kestrion/kestrion.sqlite`; treat both locations as local-only state.

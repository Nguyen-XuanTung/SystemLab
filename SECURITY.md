# Security Policy — SystemLab

## Security Model

SystemLab is a local-first static browser application:
- All simulation compute, persistence (IndexedDB), and import/export operations happen exclusively in the user's browser.
- No backend server, user credentials, telemetry collection, or external API keys are used.
- Imported JSON files pass through a 2 MB size cap, recursive `__proto__` / `constructor` / `prototype` key stripping, and strict Zod schema validation (`src/schemas/projectSchema.ts`).
- Fault injection applies strictly inside the internal discrete-event simulation and never generates network traffic against external hosts.

## Reporting a Vulnerability

If you discover a security issue (such as unsafe JSON deserialization, XSS vector, or dependency vulnerability):
1. Do **not** disclose exploit details publicly before a fix is available.
2. Open a private security advisory on GitHub once the repository is hosted, or contact the repository maintainer directly with reproduction steps and affected file paths.
3. Never commit secrets, personal credentials, or sensitive test payloads to issues or pull requests.

# Development guide

## Environment

Use Windows with Node.js 22.12 or later and npm. The Electron version pinned by `package-lock.json` determines the desktop runtime. Keep the lockfile committed for reproducible dependency resolution. Electron and Teleproto are pinned. The minimatch overrides update the packaging dependencies from major versions 9/10 to 11 to address GHSA-g3hv-75wg-m249; validate packaging when changing these overrides.

```powershell
npm ci
npm start
```

Dependencies and the Electron distribution are downloaded during installation. Configure any required download proxy in your local environment; do not commit proxy credentials or local package-manager configuration.

## Architecture

| Component | Responsibility |
| --- | --- |
| `src/main.cjs` | Electron lifecycle, encrypted persistence, trusted IPC, notifications, and tray controls |
| `src/server.cjs` | Local authenticated MCP transport and tool registration |
| `src/catalog.cjs` | Telegram operation schemas and input bounds |
| `src/telegram.cjs`, `src/advanced.cjs` | Teleproto connections (telegram package alias), Telegram requests, search, and serialization |
| `src/gate.cjs`, `src/rules.cjs` | Approval requests, grants, rule evaluation, and revision checks |
| `src/access.cjs`, `src/permitted-search.cjs` | Permission-aware discovery and search |
| `src/jobs.cjs` | Background search state and write deduplication |
| `src/memory.cjs`, `src/memory-access.cjs` | Text-memory persistence, review, and access scope |
| `src/sync-*.cjs`, `src/sync-ui.js` | Encrypted channel transport, causal merging, local projection, and owner review |
| Renderer HTML, CSS, and JavaScript | Desktop account management, approval review, and settings |
| `test/` | Synthetic unit, HTTP, adapter, and Electron UI fixtures |

Renderer content uses a constrained preload bridge. Keep Telegram data, file content, and user-authored text escaped when rendering. New write operations must pass through the approval gate and retain request-ID handling.

## Validation

```powershell
npm test
npm run test:approvals
```

The Node test suite covers policy precedence, scoping, approval rejection, persistence, MCP requests, Telegram serialization, search continuation, and background work. It uses synthetic account and message data.

The Electron UI suite opens a separate temporary profile and uses mocked Telegram clients. It does not start the production MCP endpoint or require a Telegram account. Screenshots and results are written to `artifacts/approvals/` and must remain untracked.

If the surrounding shell sets `ELECTRON_RUN_AS_NODE`, remove that variable for the Electron test process so the desktop runtime can start normally.

Telegram API serialization tests do not establish live account privileges or network behavior. Validate those separately with a dedicated test account, controlled recipients, and explicitly reviewed actions.

## Packaging

```powershell
npm run dist -- --config.electronDist=node_modules/electron/dist
```

This uses the installed Electron distribution and creates both NSIS installer and portable targets under `dist/`. `npm run dist:portable` builds only the portable target. Local unsigned packages are supported. Distributors should configure a Windows signing certificate and use npm run dist:signed, which enforces signing.

The package includes application sources and required runtime dependencies. Tests, local reports, screenshots, and development documentation are not runtime assets. A version change should update both `package.json` and the root package entry in `package-lock.json`.

## Repository hygiene

- Commit source, synthetic tests, documentation, application icons, and `package-lock.json`.
- Keep dependencies, installers, test artifacts, local logs, sessions, and application vaults out of Git.
- Keep all maintained documentation, interface copy, comments, and test descriptions in English. Runtime user content can be in any language.
- Use fictional account names, synthetic IDs, and visibly test-only credentials in fixtures.
- Do not include personal machine paths, organization data, conversation transcripts, or real Telegram content in examples.
- Review the staged diff before publishing. `.gitignore` does not remove content already committed or protect a manually uploaded directory archive.

Before publishing from a Git checkout, inspect the candidate files and ignored paths:

```powershell
git status --short
git ls-files
git ls-files --others --exclude-standard
git diff --cached --check
```

Distribute installers as release assets rather than source files. If creating a source archive, generate it from reviewed tracked files instead of compressing the entire working directory.

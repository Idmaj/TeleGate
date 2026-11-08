# Security and data handling

TeleGate mediates access between a Telegram account and an MCP client. Its controls depend on a trusted Windows user session, a trusted application installation, and an appropriately configured assistant client.

## Transport boundary

- The MCP server listens on `127.0.0.1` and requires a generated bearer token.
- Requests validate the host header and reject browser-origin requests.
- The supported deployment is a local desktop process. Do not expose the endpoint through port forwarding or a public reverse proxy.
- Treat the MCP token as a credential. Store it in client secret storage or a local environment variable, never in source control.

## Account and action controls

Reads are evaluated against account and chat rules, saved grants, and pause state. Unknown or unverified metadata does not grant access. Discovery and cross-chat search default to the currently permitted workspace.

AI writes require owner approval for the exact request. Device sync is separately enabled by the owner and authorizes automatic encrypted uploads and cleanup in one dedicated private channel. Read permissions do not authorize message sending, account changes, rule changes, or memory changes. The MCP interface has no approval endpoint for the assistant to call.

Rule and memory proposals show before/after state and use revision checks to prevent stale updates. Ordinary read operations do not send read receipts; `mark_read` is a separate approved write.

Pausing access blocks new work and cancels waiting approvals. It cannot undo an operation already accepted by Telegram. Write retry records prevent automatic replay of uncertain attempts, but they do not provide a universal exactly-once guarantee.

## Local persistence

The application vault is stored in Electron's per-user application-data directory. A portable executable uses that same profile location rather than a data directory beside the executable.

| Data | Storage treatment |
| --- | --- |
| Telegram sessions and API Hash | Encrypted with Electron `safeStorage` backed by Windows |
| MCP token and proxy credentials | Encrypted |
| Saved memory and persisted job records | Encrypted |
| Account labels, API ID, read rules, grants, and audit metadata | Ordinary application settings |
| Sign-in codes and two-step passwords | Used during authentication and not intentionally persisted |

Encrypted values are available in process memory while used. Windows-backed storage does not protect against malicious software running as the same Windows user. Do not assume an encrypted vault is safe to publish or transferable to a different Windows profile.

Audit records and job results may contain sensitive identifiers, error details, or message data. Notification privacy mode hides request details on desktop notifications; full details remain available in the application.

## Assistant and Telegram boundaries

Data returned through MCP is available to the connected assistant and may be processed by its provider. TeleGate's local server does not make that downstream processing local or private by itself.

Saved memory is owner-approved text guidance. The application does not enforce its semantic meaning or detect contradictions. Telegram messages and saved notes do not independently authorize access expansion or persistent changes.

Telegram account permissions, content restrictions, and rate limits remain in force. Support for Telegram operations depends on the upstream client library and API compatibility.

## Repository and diagnostic data

Never publish vault files, session strings, API hashes, bearer tokens, proxy secrets, account exports, or screenshots containing personal messages. The repository ignore rules cover common local artifacts, but ignored files can still be included in a manual archive or forced Git addition.

Use synthetic data for reproductions. Inspect logs, screenshots, and issue attachments before sharing them. Repository visibility does not change the sensitivity of local application data.

## Reporting a concern

If private vulnerability reporting is available on the repository, use that channel. Otherwise, contact the repository maintainer privately before sharing credentials, personal data, or an exploit that affects active users. A useful report identifies the affected version, the relevant trust boundary, and a minimal reproduction with synthetic data.

## Optional device sync

Sync uploads only memory, read rules, and saved read permissions, encrypted before leaving the device. Account mapping uses Telegram IDs. Sync keys and local merge state are encrypted in the application vault. Tokens, sessions, audit logs, and pending approvals are excluded. Read rules and saved permissions from trusted devices apply automatically by default. Each device can disable automatic permission application to require local review of access-expanding changes. Concurrent record changes retain all versions and require a choice in either mode. See [Device sync](docs/device-sync.md) for passphrase handling, retention, trusted-device boundaries, and recovery limitations.

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

Sync uploads only memory, read rules, and saved read permissions, encrypted before leaving the device. Account mapping uses Telegram IDs. Sync keys and local merge state are encrypted in the application vault. Tokens, sessions, audit logs, and pending approvals are excluded. Access-expanding read rules and saved permissions require local review by default. Each device can explicitly enable automatic permission application only when all participating devices are trusted to change its access. Concurrent record changes retain all versions and require a choice in either mode. See [Device sync](docs/device-sync.md) for passphrase handling, retention, trusted-device boundaries, and recovery limitations.

## Security update 0.6.1

Read authorization is checked again before MCP results are released. Revocation, expiry, new deny rules, and pause can withhold an in-flight result. One-time approval remains usable only while its authorization state is unchanged. Telegram may already have processed a network request; these checks cannot recall data previously delivered or undo a completed write.

Image and UTF-8 text attachment previews are bounded. Every attachment shows a SHA-256 digest and requires an explicit review acknowledgement. Unsupported or oversized previews require saving a copy for inspection; exported files are not automatically opened and remain on disk until the owner deletes them. A preview does not certify that a file is harmless or remove image metadata. Never execute untrusted attachments. Media forwarding is disabled; use reviewed uploads instead. Text forward sources are read with permission, displayed, and compared again immediately before forwarding. Telegram does not offer a conditional forward tied to a content hash; a source can still change after the final comparison.

On the first launch of this update, existing automatic permission sync and direct routes in automatic proxy policies are disabled. Explicit direct connection policies remain unchanged. The owner can opt back in from the corresponding settings. The migration runs once per profile.

Sign out and remove requests Telegram authorization revocation before deleting local credentials. Network failure retains credentials with AI access paused so the owner can retry. Remove locally only is a separate confirmed option and does not revoke the Telegram session. Terminate the session in Telegram Settings > Devices when remote revocation cannot be confirmed. Existing audit, memory, and historical job records are not erased by account removal.

All MCP clients still share one bearer token and the owner's read rules. Only connect trusted clients. Data provided to an external assistant can be processed by its provider. Windows secure storage cannot isolate credentials from malware running as the same user.

Unsigned local builds remain possible. Release distributors should use npm run dist:signed with their own signing certificate; the command fails when signing cannot be completed. A successful dependency audit is not proof that the application or its dependencies contain no vulnerabilities.

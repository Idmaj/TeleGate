# Setup guide

## Requirements

- A Windows desktop session.
- A Telegram account and your own API ID and API Hash from [Telegram's developer portal](https://my.telegram.org).
- An MCP client that supports Streamable HTTP and bearer authentication.
- Node.js 22.12 or later and npm when running or building from source.

## Run TeleGate

For a source checkout:

```powershell
npm ci
npm start
```

Packaged distributions provide a Windows installer and a portable executable. The portable executable does not require installation, but its settings and encrypted vault still reside in the Windows user's application-data directory.

## Connect a Telegram account

1. Open **Accounts** and choose an account alias.
2. Enter your API ID, API Hash, and phone number in international format.
3. Complete Telegram verification and, if enabled, two-step verification.
4. Repeat the process to add another account.

Configure an optional proxy in **Telegram proxy** before sign-in if your network requires one. SOCKS4, SOCKS5, and MTProto are supported. A default proxy can be overridden for each account. Proxy connections are disabled by default; use the host and port appropriate for your environment.

## Configure an MCP client

Open **MCP connection** and copy the endpoint and generated token into your client's configuration.

```text
Transport: Streamable HTTP
URL: http://127.0.0.1:19741/mcp
Authorization: Bearer <TELEGATE_TOKEN>
```

Store the token in the client's secret storage or an environment variable rather than a committed configuration file. Clients that wait for desktop approval should allow a tool timeout longer than the two-minute approval window.

### Codex example

```toml
[mcp_servers.telegate]
url = "http://127.0.0.1:19741/mcp"
bearer_token_env_var = "TELEGATE_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 600
```

Set `TELEGATE_MCP_TOKEN` in the environment used to launch the client. Its value is the raw token, without the `Bearer ` prefix. Restart the client after changing its environment or configuration.

## Set access rules

Open **Rules & permissions** to configure account and chat scopes. Reads ask by default. Rules can match explicit chats, public channels, chat types, folders, and read operations, with exclusions and optional expiration.

Use **Preview what AI can already read** to inspect the permitted workspace. Assistants should begin with `accounts` and `accessible_chats`. An allowed read includes discovery of that chat; a general directory permission does not grant access to message content.

Each write is reviewed separately. Notifications show the operation and destination, with a formatted preview when relevant. Dismissing a notification or enabling do-not-disturb does not approve the request.

## Connect another computer

Use **Device sync** to create or join an encrypted private-channel workspace. Sign in independently on each device and use the same sync passphrase. See the [device sync guide](device-sync.md) for setup, access review, and recovery.

## Keep the application available

Closing the main window hides it in the system tray. Use **Quit TeleGate** from the tray menu to stop the application and local server. The tray also provides access to pending requests and global pause.

## Upgrade

1. Quit the running TeleGate instance from the tray.
2. Install or launch the updated package under the same Windows user.
3. Restart the MCP client so it refreshes the tool catalog.

The existing application profile retains accounts, rules, memory, and the MCP token. A portable executable does not make an encrypted profile transferable between Windows users or devices.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Client cannot connect | TeleGate is running and port `19741` is available. |
| Authentication fails | The client uses the current token and its expected bearer-token format. |
| Chat is missing from discovery | The selected account has an active read permission for the requested operation; check exclusions, expiry, and pause. |
| Search returns no results | Inspect the response's coverage and continuation values. The default scope includes only permitted chats. |
| Approval does not appear | Inspect **Access requests**, notification privacy settings, and do-not-disturb. Requests can expire while notifications are suppressed. |
| Telegram reports a wait or permission error | Inspect the returned retry information and the connected account's Telegram privileges. |
| Connection fails behind a proxy | Verify the proxy type, address, port, and credentials for the relevant account. |

When reporting a problem, share a minimal reproduction with synthetic data. Do not attach application vaults, session strings, tokens, or unredacted Telegram content.

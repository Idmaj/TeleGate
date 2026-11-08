# Feature reference

TeleGate provides a permission-controlled Telegram workspace for MCP-compatible assistants. The capabilities below are available through the desktop application, the MCP interface, or both.

## Accounts and connectivity

| Capability | Behavior |
| --- | --- |
| Multiple accounts | Maintain separate Telegram sessions and account aliases. |
| Account sign-in | Authenticate with an API ID, API Hash, phone verification, and an optional two-step password. |
| Proxy profiles | Keep a reusable list of SOCKS4, SOCKS5, and MTProto proxies, test each route, and select a default or per-account policy. |
| Connection failover | Use direct connection, one fixed proxy, or automatic rotation across selected working proxies with optional direct fallback. |
| Connection status | Inspect connectivity and errors, and reconnect an account from the desktop interface. |
| Local MCP endpoint | Connect through authenticated Streamable HTTP on the loopback interface. |

## Discovery, search, and reading

| Capability | Behavior |
| --- | --- |
| Permitted chat discovery | List authorized chats with names, types, folders, and available read operations. |
| Directory search | Filter chat names by text, username, ID, type, or folder, with pagination. |
| Message search | Search one chat, selected chats, or a folder using text, date, sender, media, filename, link, hashtag, forwarded-status, and topic filters. |
| Conversation context | Read history, surrounding messages, original replies, discussion threads, pinned messages, and forum topics. |
| Background searches | Inspect progress, cancel work, resume interrupted searches, and retrieve results under current permissions. |
| Media access | Download supported message media through the MCP interface. |
| Read receipts | Ordinary reads do not acknowledge messages; marking messages as read requires a separate approved action. |

Discovery and cross-chat search default to permitted chats. Expanded access is an explicit request that remains subject to directory and per-chat approval. Search responses identify their coverage and provide continuation values where applicable.

## Messaging and account actions

| Capability | Behavior |
| --- | --- |
| Formatted messages | Use HTML, Markdown, or supported explicit Telegram formatting entities. |
| Media and albums | Send attachments, captions, albums, and supported voice or video variants. |
| Replies and topics | Target a reply or forum topic when supported by the operation. |
| Scheduling | Schedule messages and manage scheduled content, delivery time, cancellation, and immediate sending. |
| Message actions | Edit, delete, forward, pin, unpin, react, and create polls. |
| Multiple recipients | Send the same content to selected chats with a separate approval for each destination. |
| Chat organization | Archive, mute, pin, mark unread, and manage custom folders. |
| Groups and channels | Create chats, update metadata and photos, manage invitations and join requests, and perform supported member-management actions. |

Each write requires approval and the connected account's Telegram privileges. Stable request IDs prevent automatic replay of a previously attempted write. Ambiguous outcomes require inspection before another attempt.

## Permissions and review

- Define allow, deny, or ask rules by account, chat, chat type, public status, folder, and read operation.
- Apply exclusions and temporary or permanent grants, including grants created from an approval request.
- Follow current Telegram folder membership when evaluating folder rules.
- Preview the chats an assistant can read and explain the effective policy for a request.
- Review recipient identity, content, attachments, scheduling, and operation details before approving writes.
- Approve or reject selected ordinary requests together, with optional rejection reasons.
- Review AI-proposed rule changes separately, with before/after state and protection against stale updates.
- Pause AI access globally or for an individual account, and inspect searchable decision history.

Rule precedence is **deny, then ask, then allow**. Unverified metadata does not grant access. Writes cannot be automatically authorized by a read rule.

## Persistent context

Global and per-chat memory stores titled text notes for durable context, communication preferences, and workflow conventions. Relevant notes accompany authorized reads and can be retrieved before composing a message.

The desktop editor supports adding, editing, and deleting notes. Assistants can propose a related set of changes for owner review. Maintenance instructions favor concise notes, updating existing information, removing obsolete duplication, and checking consistency. Notes are interpreted by the assistant; their meaning is not enforced as an access policy.

## Device synchronization

Opt-in private-channel synchronization shares encrypted memory, read rules, and saved read permissions across independent installations. It supports account identity mapping, offline retries, deletion tracking, concurrent-edit review, and automatic access synchronization with an optional destination-device review mode. Setup separates creating a new workspace from joining an existing one and finds default-name sync channels automatically. Each device retains three confirmed snapshots of its own. See [Device sync](docs/device-sync.md) for setup and boundaries.

## Desktop experience

- Frameless approval notifications with chat identity and human-readable request details.
- Optional raw JSON inspection in the approval center.
- Dedicated rule-change and memory-change review interfaces.
- Notification position, size, privacy mode, and do-not-disturb settings.
- System tray controls for pending requests, access pause, navigation, and exit.
- English interface, Windows installer, and portable executable.

## Practical limits

| Area | Current boundary |
| --- | --- |
| Attachments | Up to 10 MB per file; albums contain 2-10 files. |
| Multiple recipients | Up to 20 destinations per request. |
| Search | Bounded page sizes and scan limits; use continuation values for additional results. |
| Memory | Up to 8,000 characters per note and 20 changes per proposal. Concise notes are recommended. |
| Approval queue | Requests expire after two minutes if no decision is made. |
| Platform | Windows desktop packaging. |
| Telegram coverage | Calls, Secret Chats, Stories, and bot-only inline keyboards are not implemented. |

The tool schemas provide the authoritative parameter limits. Telegram may impose additional account, operation, or network restrictions.

# MCP reference

TeleGate exposes an authenticated Streamable HTTP endpoint at `http://127.0.0.1:19741/mcp`. Use MCP tool discovery for complete input schemas and current parameter limits.

## Tool catalog

| Area | Tools |
| --- | --- |
| Accounts and discovery | `accounts`, `accessible_chats`, `dialogs`, `folders` |
| Reading and search | `messages`, `search`, `search_all`, `chat`, `participants`, `download` |
| Conversation context | `context`, `thread`, `comments`, `pinned`, `topics` |
| Background work | `search_start`, `job_status`, `job_result`, `job_cancel`, `job_resume` |
| Messaging | `send`, `send_media`, `album`, `send_many`, `edit`, `delete`, `forward`, `poll`, `react`, `pin`, `unpin` |
| Scheduled messages | `scheduled`, `scheduled_edit`, `scheduled_send_now`, `cancel_scheduled` |
| Chat organization | `archive`, `mute`, `pin_chat`, `mark_read`, `mark_unread`, `folder_update` |
| Group and channel administration | `create_chat`, `chat_title`, `chat_about`, `chat_photo`, `invite_create`, `invite_revoke`, `join_requests`, `join_decide`, `member_add`, `member_remove`, `member_restrict` |
| Read rules | `rules_list`, `rules_explain`, `rules_propose` |
| Saved context | `memory_list`, `chat_context`, `memory_propose` |

## Identifiers and input conventions

- Use the account IDs returned by `accounts` and numeric chat IDs returned by discovery. Keep IDs as strings.
- Message IDs are positive integers. Date filters and Telegram scheduling parameters use Unix timestamps in seconds; rule expiration uses Unix timestamps in milliseconds.
- Explicit message entities use Telegram's UTF-16 offsets and lengths.
- File tools accept a filename and base64 content. They do not expose arbitrary local filesystem paths.
- Replace illustrative values in examples with identifiers from the connected account. Synthetic IDs are not valid destinations by themselves.

## Discover a permitted workspace

Call `accounts`, then `accessible_chats` with the selected account. The default operation is `messages`; use `operation: "search"` to discover chats available for message search.

The response includes chat identity, folders, allowed operations, and pagination. It excludes inaccessible chat names, last-message previews, phone numbers, and unread counts. Directory responses obtained internally from Telegram are filtered inside TeleGate.

`dialogs`, `search_all`, and `search_start` default to `scope: "permitted"`. This mode does not request additional access. `scope: "all"` explicitly expands discovery and applies the normal directory and per-chat approval flow.

If permitted discovery is insufficient for the requested task, assistants must continue with `dialogs` using `scope: "all"` and relevant filters, unless the user explicitly restricted the task to permitted chats. TeleGate obtains any required approval. After discovery, assistants should invoke the appropriate tool for the original task and continue after approval. An empty permitted result is not evidence that a chat is absent or denied. Explicit rejection and deny rules must be respected.

A broad public-channel rule covers resolvable channels available to the account; it does not enumerate every public channel on Telegram. Folder permissions follow current membership, including subsequent additions, subject to exceptions and other rules.

## Search and continuation

`search` applies filters within one chat. `search_all` searches permitted chats and can be narrowed by explicit chat IDs or a folder ID. Supported filters include message text, date range, sender, media type, filename, links, hashtags, forwarded status, and topic.

Use the continuation returned by the operation rather than assuming the first page is complete:

- `accessible_chats` and `dialogs`: pass `nextOffset` as `offset`.
- `messages` and `search`: pass `nextOffsetId` as `offsetId`.
- `search_all`: pass the returned `nextCursor` unchanged as `cursor`.

Keep the same search filters when continuing. A null continuation means the current search has no further page. Results describe the searched scope; an empty permitted search does not establish that the entire account contains no matching messages.

For background work, call `search_start`, poll `job_status`, and retrieve data through `job_result`. `job_status` reports progress and `hasMore`; `job_result` supplies an authorized continuation. Results are filtered or approved under current permissions when retrieved.

## Writes and retry behavior

All write operations require desktop approval. Supply a stable `requestId` and reuse it with identical arguments when retrying the same intended action. Completed attempts return their cached result where retained. Reusing an ID with different arguments is rejected.

An interrupted or uncertain write is not automatically replayed. Inspect Telegram before using a new request ID. Request deduplication reduces accidental repeats but cannot guarantee exactly-once delivery across every network or Telegram failure.

Read the relevant `chat_context` before composing or performing an action. `send_many` applies the same content to multiple recipients and requires a separate approval for each destination. Forwarding also requires read access to the source.

`folder_update` replaces a custom folder definition, so provide the complete intended selection and flags. System folders cannot be edited. Administrative actions require the connected Telegram account's privileges.

## Read rules

`rules_list` returns read rules and saved grants. `rules_explain` evaluates an account, chat, and operation using available Telegram metadata. `rules_propose` requests an owner-reviewed create, update, enable, disable, delete, or saved-permission revocation.

Rules support allow, deny, and ask decisions with account, chat, type, public-status, folder, and operation selectors. Precedence is **deny > ask > allow**. Explicit ask or deny rules override saved permissions, and unverified metadata does not auto-allow a request. Read rules cannot authorize writes or future rule changes.

Proposals include a human-readable before/after review. A change to the underlying revision invalidates a stale proposal. There is no MCP tool that approves a pending request.

## Saved context

`memory_list` returns current notes and their revision for a global or chat scope. Chat scope includes inherited global notes. `chat_context` obtains the relevant notes without fetching message history. Existing read access permits chat-memory access; otherwise the normal chat-read approval applies.

Authorized results can include a second MCP text content block named `ownerMemory`. The first content block retains the primary tool result. Consumers should make both blocks available to the assistant.

`memory_propose` accepts related create, update, and delete changes within one scope. A proposal must use the revision that was just read and explain the requested change. Its tool instructions favor concise, durable notes, updates instead of duplication, and removal of obsolete information. Changes apply together after a dedicated owner review. The application stores text; it does not enforce the meaning of a note as a policy.

For example, a project note could identify the topic used for release planning or the convention for issue references. Such context does not grant permission to read, send, change rules, or maintain memory without the appropriate authorization.

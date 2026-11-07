# Device sync

TeleGate can synchronize memory, read rules, and saved read permissions through a dedicated private Telegram channel. No separate server is required. Enable it explicitly in **Device sync** on each computer.

## First device

1. Sign in to the Telegram account that will own the sync channel.
2. Open **Device sync** and select **Create a private sync channel**.
3. Choose a strong shared passphrase of at least 16 characters and store it securely.
4. Review the authorization for automatic sync uploads, reads, and cleanup, then enable sync.
5. Copy the channel ID shown after setup.

The application creates a private broadcast channel named **TeleGate Sync**. Keep it private with no other subscribers. Sync verifies those conditions and stops if they change. A workspace message identifies the channel and verifies the passphrase; do not delete or edit it.

## Additional devices

1. Install TeleGate and sign in independently to the same Telegram account.
2. Open **Device sync**, select **Connect to an existing workspace**, and enter the channel ID and shared passphrase.
3. Review incoming access changes. New allow rules and saved permissions do not activate without review on this device.

Other logged-in accounts are matched by their Telegram user IDs, not local aliases or installation IDs. Sign in to the corresponding account before applying its incoming changes. One local login per Telegram account is supported. Global notes and all-account rules retain their global scope. Folder selectors use Telegram folder IDs belonging to the same account.

## Automatic behavior

- TeleGate checks for changes every 30 seconds while running. Telegram flood-wait responses delay retries.
- Local edits remain durable while offline and are captured on the next successful cycle.
- Each installation publishes complete encrypted snapshots under its own device identity. There is no shared message that two devices overwrite.
- Independent records merge automatically. Concurrent changes to the same record remain available for review; wall-clock timestamps never choose a winner.
- Deletions remain as tombstones inside snapshots so a returning offline device cannot resurrect old notes.
- Each installation removes only its own older snapshots, retaining its latest three confirmed uploads. Snapshots from disconnected devices are not automatically removed. Interrupted uploads can leave an extra file.
- The workspace is limited to 4 MB of plaintext records, including conflict versions and tombstones. Limit errors are shown without deleting local data.

The channel contains only a small workspace descriptor and encrypted sync attachments. Other messages are ignored. Do not use this channel for ordinary conversations or manually remove its newest snapshots.

## Review and local controls

Memory changes apply automatically unless they conflict. New deny/ask rules and clearly restrictive removals can apply automatically. Other rule changes are reviewed conservatively, including changes that might remove an existing restriction. Saved permission additions require review; revocations propagate automatically. Expiration is an absolute timestamp and is not extended by sync.

Incoming reviews appear in **Device sync**, with a desktop notification. Compare the current and incoming versions and acknowledge the effect before approving. **Keep local on this device** dismisses that incoming version locally; it does not revoke another device's policy. A new remote version is reviewed again. Resolving a concurrent conflict publishes the selected version to the other devices, where access review still applies.

**Pause** stops automatic sync on this computer. **Disconnect this device** removes the local sync connection but keeps local rules, memory, and channel files. Neither action removes other devices' copies. AI access pause is separate and remains local.

## Encryption and boundaries

Content uses AES-256-GCM authenticated encryption with a fresh random nonce for each upload. A workspace-specific random salt and scrypt derive the shared key from the passphrase. The key and local sync state are protected using Electron secure storage. The passphrase itself is not retained.

Telegram can see the channel, file sizes, timing, and workspace/device identifiers; rules and memory content are encrypted before upload. Telegram sessions, API credentials, MCP tokens, proxy credentials, audit history, pending approvals, and background-job results are excluded from the sync payload.

Anyone with the shared key and access to the channel is a trusted participant. This is not remote device revocation: to exclude a device that already knows the key, create a new workspace with a new passphrase and reconnect only trusted devices. Previously downloaded data cannot be recalled. Passphrases cannot be recovered by TeleGate. Do not copy an entire application profile to provision another device; join from its own installation instead.

Protocol tests use simulated Telegram clients and independent devices. Validate initial setup and ongoing delivery on your own accounts and network before relying on sync as your only copy of important notes.

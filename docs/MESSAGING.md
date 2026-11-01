# Messaging and account management

Direct messages let any two active accounts talk without leaving the marketplace: customer ↔ seller, customer ↔ support, seller ↔ admin, and so on. The same screens also give administrators a safe way to inspect an account and help with a lost password.

## Who can message whom

| Rule | Behaviour |
| --- | --- |
| Signed-in only | `/messages` and every `/api/v1/messages/*` endpoint require authentication |
| Active accounts only | Suspended accounts are hidden from search and are rejected when starting a conversation |
| Any role | Customers, sellers, managers, support staff, and administrators can all message each other |
| One thread per pair | Starting a conversation twice reuses the existing thread — no duplicate inboxes |
| Self-chat blocked | A user cannot start a conversation with their own account |
| Outsiders blocked | Only the two participants can read, send, or mark a thread read (`403`) |

There is no group chat and no file/image attachment in messages today. Bodies are plain text, 1–2,000 characters, trimmed before saving.

## Where to find it

| Surface | Entry point |
| --- | --- |
| Storefront | Header **Messages** icon with unread-conversation badge; account menu → **Messages** |
| Customer account | **Account → Messages** in the sidebar |
| Seller center | **Messages** in the seller portal navigation |
| Admin/staff portal | **Messages** in the portal navigation |
| Admin users screen | **Message** action on a user row, or **Message user** inside the account modal (opens `/messages?user=<id>`) |

The page is a two-pane inbox on desktop and a single pane with a back button on small screens.

## Sending a message

1. Open **Messages**.
2. Choose **New message**.
3. Type at least two characters of a **name, email address, or phone number**.
4. Pick the person from the results (each row shows their role and role-coloured avatar).
5. Type in the composer and press **Enter** (or **Send**). **Shift + Enter** inserts a new line.

The conversation appears immediately in the left-hand list with the last message, a relative timestamp, and an unread badge. Opening a thread marks it read for the current user.

## Profile icons by account type

Every user avatar is role-aware (`frontend/src/components/UserAvatar.tsx`):

| Role | Colour | Badge glyph |
| --- | --- | --- |
| Customer | Slate | Person |
| Seller | Emerald | Storefront |
| Administrator | Rose | Shield with check |
| Manager | Violet | Briefcase |
| Support | Sky | Headset |

If the account has uploaded a profile image (`avatar_path`), the image is shown inside the same coloured ring; otherwise the user's initials are used. The badge glyph is drawn on top, so an administrator is recognisable even in a long conversation list.

## Unread counts and polling

- Unread is counted **by message ID**, not by timestamp. The participant row stores `last_read_message_id`; a message is unread when its `id` is greater than that value and it was not sent by the reader.
- Storefront badge: unread **conversations**, refreshed every 30 seconds.
- Conversation list: refreshed every 15 seconds.
- Open thread: refreshed every 5 seconds; opening or polling it marks the thread read.
- Sending a message marks it read for the sender and updates the list immediately.
- There are no websockets, so other people's messages appear within one polling interval. This keeps the deployment to a single PHP/Nginx origin with no extra daemon.

## API summary

All routes are under `/api/v1`, require Sanctum auth, and return JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/messages/conversations` | Inbox, newest activity first (limit 50) |
| `POST` | `/messages/conversations` | Start or reopen a direct thread (`user_id`) |
| `GET` | `/messages/conversations/{id}` | Thread (latest 100 messages) and mark read |
| `POST` | `/messages/conversations/{id}/messages` | Send `{ "body": "..." }` |
| `POST` | `/messages/conversations/{id}/read` | Mark read explicitly |
| `GET` | `/messages/unread` | `{ unread_conversations, unread_messages }` |
| `GET` | `/messages/users?search=` | Active-user search (minimum 2 characters, 12 results) |

Creation and sending are rate-limited (`30/min` and `40/min` per user); search allows `60/min`.

## Data model

| Table | Purpose |
| --- | --- |
| `conversations` | One row per thread; `created_by`, `last_message_at` |
| `conversation_participants` | Membership, `last_read_message_id`, `last_read_at` |
| `messages` | `conversation_id`, `sender_id`, plain-text `body` |

Deleting a user deletes their messages via `nullOnDelete` on `sender_id`; the thread remains for the other participant with the sender shown as “Deleted user”.

## Administrator account management

Administrators with the **`users.manage`** permission can open **Admin → Users → Manage** on any account.

- **Account summary:** role, status, join date, last login, order count, conversation count, seller/store details.
- **Edit details:** name, sign-in email, phone. Email and phone uniqueness is enforced; Bangladeshi mobile format is validated. Each change is written to the audit log (`user.details_updated`).
- **Password:** the current password is a one-way hash and is **never displayed or emailed in plain text — not even to an administrator**. The modal offers two safe actions:
  1. **Set password** — validates strength (8+ characters, letters and numbers, confirmation), rehashes, revokes the user's API tokens, and sends the `password_changed` email. If an administrator changes their own password, the current browser session is kept and only other tokens are revoked.
  2. **Email reset link** — generates a standard Laravel reset token and sends the `password_reset` email with `{reset_url}`. The administrator never sees the token. Reset links are refused for suspended accounts.
- **Message user:** opens the direct-message thread with that account.

Related tests: `tests/Feature/AdminUserManagementTest.php` (9 tests) and `tests/Feature/MessagingTest.php` (9 tests). Actions are audited as `user.details_updated`, `user.password_changed`, and `user.password_reset_sent`.

### What administrators cannot do

- View an existing plaintext password (hashes are one-way by design).
- Read a reset token from the UI or API.
- Send a reset link to a suspended account until it is reactivated.
- Manage passwords without `users.manage`; managers and support agents receive `403`.

## Privacy and moderation

- A thread is visible only to its two participants; the API authorises membership on every read/write call.
- Administrators cannot browse arbitrary threads through this feature. If moderation is required, add a separate, audited policy — do not widen the participant check silently.
- Message bodies are not encrypted at rest beyond database/storage controls. Do not send card numbers, passwords, or one-time codes in chat.
- Search exposes name, email, phone, and role to signed-in users so they can find each other, as requested. If this is too broad for production, restrict it to staff/seller-to-customer relationships.
- Unread state is per-device-session agnostic: reading on one device clears the badge everywhere.

## Limitations

- No group conversations, attachments, reactions, typing indicators, or read receipts beyond the per-user unread counter.
- No email/SMS notification is sent for a new chat message; recipients see it on their next poll or page load.
- No block/report workflow, profanity filter, spam scoring, or message retention policy.
- No admin-wide conversation log or export; only the participants can read a thread.
- Polling adds periodic API traffic; at high concurrency, move to websockets/SSE and Redis.
- The account modal cannot display or recover an old password — set a new one or send a reset link instead.

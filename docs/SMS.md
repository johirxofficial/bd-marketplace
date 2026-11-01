# SMS notifications

The platform sends template-driven transactional SMS through a queued job. The default gateway is **log-only**: messages are recorded as sent but never leave the server. No real provider has been verified in this deployment.

## Master switch and gateway selection

- `sms_enabled` platform setting is the master switch (**Admin → SMS notifications → Overview**). When off, nothing is queued even if a gateway is enabled.
- The active gateway is the **first enabled gateway**, ordered by `is_default` then `id`.
- A message is skipped when: SMS is disabled, the customer has no phone number, no enabled gateway exists, or the event template is disabled/missing.
- Changing the default gateway affects new messages only; already-queued messages keep their `sms_gateway_id`.

## Gateways

| Driver | Label | Required configuration | Default endpoint |
| --- | --- | --- | --- |
| `log` | Log file (development) | None. Sender ID optional. | Laravel log |
| `sslwireless` | SSL Wireless | `api_token`, `sid` (or sender ID), optional `endpoint` | `https://smsplus.sslwireless.com/api/v3/send-sms` |
| `bulksmsbd` | BulkSMSBD | `api_key`, sender ID, optional `endpoint` | `http://bulksmsbd.net/api/smsapi` |
| `alpha` | Alpha SMS | `api_key`, sender ID, optional `endpoint` | `https://api.sms.net.bd/sendsms` |

Gateway config is stored **encrypted** (`SmsGateway` model cast). Admin API responses mask configured secrets with `has_*` flags; a blank secret on update keeps the stored value.

The seeded log gateway:

- Name: `Log file (development)`
- Sender ID: `BDMARKET`
- Enabled and default
- Config: none

### What "log" actually does

`LogSmsDriver` writes the message to `backend/storage/logs/laravel.log` and returns a synthetic reference (`log-<timestamp>`). The message row is then marked `sent`. This is intentional for development and the staging demo.

## Templates

Eleven seeded templates (`{variable}` placeholders):

| Event | Purpose |
| --- | --- |
| `order_placed` | Order received |
| `order_confirmed` | Seller confirmed |
| `order_processing` | Packing |
| `order_shipped` | Shipped |
| `order_delivered` | Delivered |
| `order_completed` | Completed / review nudge |
| `order_cancelled` | Cancelled with reason |
| `payment_received` | Manual payment verified |
| `payment_rejected` | Verification failed with reason |
| `payment_submitted` | Reference received |
| `return_status_changed` | Return workflow update |

Available placeholders include: `{customer_name}`, `{site_name}`, `{store_name}`, `{order_number}`, `{amount}`, `{payment_method}`, `{reason}`, `{status}`. Unsupported placeholders are left literal — check the rendered body in the log.

Bodies are truncated to **1,000 characters**. Empty bodies are rejected by admin validation.

## Phone normalization

`SmsService::normalizePhone()` converts common Bangladeshi formats to `8801XXXXXXXXX`:

- `017XXXXXXXX` → `88017XXXXXXXX`
- `88017XXXXXXXX` → unchanged
- `17XXXXXXXX` (10 digits starting with `1`) → `88017XXXXXXXX`
- Non-digits are stripped.

Invalid/short numbers are not rejected here; the provider will reject them and the message becomes `failed` with the provider error.

## Delivery pipeline

1. Domain action calls `SmsService::sendEvent($user, $event, $replacements, $related)`.
2. A `sms_messages` row is created (`status=queued`), linked polymorphically to the order/return when provided.
3. `SendSmsMessage` is queued on the database queue.
4. Worker calls the driver. Success → `status=sent`, `provider_ref`, `sent_at`. Failure → `status=failed`, error stored, job retried.
5. Retries: **3 attempts, 30-second backoff** (`SendSmsMessage`). The queue worker itself runs with `--tries=3 --max-time=3600` and is restarted by systemd.

The message log keeps the recipient, body, event, gateway, status, provider reference, error, and timestamps. It is paginated in the admin UI.

## Admin API

Requires `auth:sanctum` + `permission:sms.manage`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/sms/gateways` | List gateways (secrets masked) and available drivers |
| `POST` | `/api/v1/admin/sms/gateways` | Create a gateway |
| `PATCH` | `/api/v1/admin/sms/gateways/{id}` | Update gateway / set default |
| `GET` | `/api/v1/admin/sms/templates` | List templates |
| `PATCH` | `/api/v1/admin/sms/templates/{id}` | Update name/body/enabled |
| `GET` | `/api/v1/admin/sms/messages` | Paginated message log |
| `POST` | `/api/v1/admin/sms/test` | Send a test SMS (throttle 6/min) |

`POST /admin/sms/test` requires `to` and `body`, returns `201` with the queued message. Real delivery depends on the gateway.

## Enabling a real provider

1. Obtain an approved sender mask/SID and API credentials.
2. **Admin → SMS notifications → Gateways**: edit the log gateway or create a new one, choose the driver, enter credentials, save.
3. Mark it default and ensure it is enabled; keep only one default.
4. Turn on the master switch (`sms_enabled`).
5. Send a test SMS to a real handset and confirm:
   - message log shows `sent` and a provider reference;
   - the handset receives the message;
   - a failed/invalid number shows `failed` with a useful error.
6. Place a test order and verify `order_placed` and `payment_received` messages.
7. Monitor cost/throughput and the queue worker.

**Not verified in this deployment:** no real SSL Wireless/BulkSMSBD/Alpha account exists here. Their drivers follow the documented HTTP APIs but have not been exercised against live endpoints. Provider error codes/response shapes may need adjustment.

## Verified in staging

- Test SMS queued (`201`) and delivered through the log gateway; message row `sent`.
- Order placed / payment verified events produced templated messages to the demo customer (`+8801811000009`).
- Message log returned 4 entries with correct statuses.
- Automated coverage: `tests/Feature/SmsTest.php`.

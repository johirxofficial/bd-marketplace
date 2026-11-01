# Developer API and webhooks

Two integration surfaces:

1. **Sanctum API tokens** for server-to-server calls to the same `/api/v1` API used by the SPA.
2. **Signed webhooks** for push notifications about orders, payments, returns, settlements, and product approvals.

## API tokens

### Create a token

**Admin → API & webhooks → API tokens**, or:

```http
POST /api/v1/admin/developer/tokens
Content-Type: application/json

{
  "name": "Warehouse integration",
  "abilities": ["*"],
  "expires_in_days": 90
}
```

Response `201` contains `plain_text_token` **once**. Only the hash is stored. If lost, revoke and create a new one.

### Use a token

```http
GET /api/v1/products
Authorization: Bearer 1|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Accept: application/json
```

- Tokens inherit the **creating user's role and permissions**.
- `abilities` values (`*`, `read`) are descriptive only. The server does not enforce `read` on routes; it is not a scope system. The UI says this, and integrations must not rely on it.
- Tokens can be created with 1–365 days expiry or no expiry.
- Revoke with `DELETE /api/v1/admin/developer/tokens/{id}`. Creation/revocation are audited (`api_token.created`, `api_token.revoked`).

### Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/developer/tokens` | Tokens for the current user (never plaintext) |
| `POST` | `/api/v1/admin/developer/tokens` | Create token |
| `DELETE` | `/api/v1/admin/developer/tokens/{id}` | Revoke token |

Requires `permission:developer.manage`.

For browser SPA calls, authentication uses the session cookie + CSRF (`/sanctum/csrf-cookie` and `X-XSRF-TOKEN`), not bearer tokens.

## Webhooks

### Create

```http
POST /api/v1/admin/developer/webhooks
{
  "name": "Order sync",
  "url": "https://example.com/webhooks/bd",
  "events": ["order.placed", "payment.collected"],
  "active": true
}
```

- `url`: valid URL, max 500 chars. Use HTTPS in production.
- `events`: one or more allow-listed values.
- `secret`: optional 16–200 chars; if omitted a 48-char secret is generated.
- The response includes the secret **once**. It is encrypted at rest and hidden from serialization.

### Update, test, delete

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/developer/webhooks` | List endpoints + available events |
| `PATCH` | `/api/v1/admin/developer/webhooks/{id}` | Update; blank secret keeps the stored one |
| `POST` | `/api/v1/admin/developer/webhooks/{id}/test` | Queue a test `order.placed` |
| `GET` | `/api/v1/admin/developer/webhooks/{id}/deliveries` | Last 50 delivery attempts |
| `DELETE` | `/api/v1/admin/developer/webhooks/{id}` | Delete endpoint and deliveries |

**Test caveat:** the test endpoint dispatches `order.placed` to **every active webhook subscribed to that event**, not only the endpoint whose button was clicked. Use a dedicated event subscription or expect other endpoints to receive the sample too.

### Events

| Event | Emitted when | Sample payload fields |
| --- | --- | --- |
| `order.placed` | Checkout succeeds | `order_number`, `order_id`, `grand_total`, `payment_method`, `items_count` |
| `order.status_changed` | Order/seller order status changes or is cancelled | `order_number`, `order_id`, `status`, optional `seller_order_id`, `store`, `reason` |
| `payment.submitted` | Customer submits a manual reference | `order_number`, `amount`, `method` |
| `payment.collected` | Manual verification, hosted success, or COD collection | `order_number`, `order_id`, `amount`, `method`, `reference` |
| `payment.rejected` | Staff rejects a reference | `order_number`, `order_id`, `reason` |
| `return.requested` | Customer requests a return | `return_id`, `return_number`, `order_number`, `quantity`, `reason`, `refund_amount` |
| `return.status_changed` | Return workflow transition | `return_id`, `return_number`, `order_number`, `status`, `note` |
| `settlement.paid` | Seller payout recorded | `settlement_id`, `store_id`, `store_name`, `amount`, `method`, `reference` |
| `product.approved` | Admin approves a product | `product_id`, `name`, `sku`, `store_id`, `store_name` |

Only allow-listed events can ever be dispatched (`WebhookService::EVENTS`). Adding a new event requires a code change in both the service and its dispatch site.

### Delivery format

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
X-BD-Event: payment.collected
X-BD-Delivery: 42
X-BD-Signature: sha256=5f0c...
```

```json
{
  "id": 42,
  "event": "payment.collected",
  "sent_at": "2026-10-26T16:12:19+06:00",
  "data": {
    "order_number": "BDP-261026-K3XXID",
    "amount": "5490.00",
    "method": "bkash",
    "reference": "VERIFIED-SMOKE-001"
  }
}
```

### Verify the signature

The signature is `HMAC-SHA256(raw_request_body, secret)` hex-encoded, prefixed with `sha256=`. Compute it over the **exact bytes received**, not a re-serialized JSON object.

PHP:

```php
$raw = file_get_contents('php://input');
$expected = 'sha256='.hash_hmac('sha256', $raw, $secret);
if (! hash_equals($expected, $_SERVER['HTTP_X_BD_SIGNATURE'] ?? '')) {
    http_response_code(401);
    exit;
}
$event = $_SERVER['HTTP_X_BD_EVENT'] ?? '';
$deliveryId = $_SERVER['HTTP_X_BD_DELIVERY'] ?? '';
```

Node.js:

```js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
if (rawBody.length !== Buffer.byteLength(rawBody) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
  return res.status(401).end();
}
```

### Retries and logging

- Delivery is queued (`DeliverWebhook`); the endpoint has **10 seconds** to respond.
- Any `2xx` marks the delivery successful. Anything else (or a transport error) is a failure.
- **3 attempts** with a **60-second backoff**.
- Every attempt updates `attempts`, `response_status`, and up to 2,000 chars of `response_body`; success sets `delivered_at`, failure sets `failed_at`.
- There is **no automatic pause** and **no replay UI**. Inspect the deliveries, fix the endpoint, and send a new test or wait for the next event.
- Delivery is **at-least-once**; make handlers idempotent using `X-BD-Delivery` / the payload `id`.

### Security guidance

- Treat the signing secret like a password; store it in a secret manager.
- Reject requests whose signature does not match; do not log secrets.
- Allow-list your egress/ingress if possible and respond quickly (enqueue work before doing slow processing).
- Rotate by setting a new secret via `PATCH` (the old one stops working immediately).
- Webhook URLs are currently allowed over HTTP for staging convenience. Require HTTPS in production.

## Verified in staging

- Token create → plaintext returned once → list does not expose it → revoke (`200`) all succeeded.
- Webhook create → secret generated (48 chars) → test queued → delivery attempted → connection failure logged with `attempts=1`, `failed_at` set → webhook deleted (`200`).
- Automated coverage: `tests/Feature/WebhookTest.php`.
- The `return.*`, `settlement.paid`, and `product.approved` events are wired at their service/controller dispatch sites but were **not** exercised over HTTP in staging; only `order.placed` was.

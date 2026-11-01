# Receipts

Every order, confirmed payment, and processed refund gets a persisted, printable receipt. Receipts are stored as immutable snapshots, so a later product, price, or address change never rewrites history.

## What is issued

| Receipt type | Issued when | Amount |
| --- | --- | --- |
| `order` | Order is placed (checkout) | Order `grand_total` |
| `payment` | Payment is confirmed (manual verify, COD collection, bKash, SSLCommerz) | Payment transaction `amount` |
| `refund` | A refund is processed | Refund `amount` |

Issuing is idempotent per order/type/transaction, so retries and callbacks cannot create duplicates. Refunds can legitimately create more than one receipt per order.

Receipt numbers use the format `RCPT-YYMMDD-XXXXXX` (for example `RCPT-261026-J6UHZA`).

## Customer access

- **Account → Receipts** (`/account/receipts`) lists the signed-in customer's receipts with type, order number, amount, and issue date.
- **Order detail** shows a **Receipt** button whenever the order has one.
- The printable page is `/receipts/{receiptNumber}` and includes a **Print / Save as PDF** button (A4 print styles, navigation hidden when printing).

A receipt is reachable in two ways:

1. **Public token link** — `/receipts/{receiptNumber}?token={public_token}`. This is the link placed in transactional email. The token is 48 random characters and is compared with `hash_equals`. Anyone with the link can view the receipt; treat it like the email itself.
2. **Authenticated owner or staff** — `GET /api/v1/receipts/{receiptNumber}` with a Sanctum session; the API returns `404` to anyone else.

A wrong or missing token without an authorised session also returns `404` (not `403`), so receipt numbers cannot be enumerated.

## Printable content

The page renders a stable snapshot of:

- store name, tagline, logo, support email/phone, website;
- receipt number, type, status, issue time, amount, currency;
- order number, order status, payment method, payment reference, placed/paid time;
- customer and shipping address;
- line items with variant, SKU, store, quantity, unit price, line total;
- subtotal, discount, delivery, tax, payment fee, grand total;
- footer text and return policy from platform settings;
- return number / refund ID where applicable.

## Email integration

These transactional templates include `{receipt_url}` and are seeded with the link:

| Event | Link |
| --- | --- |
| `order_placed` | Order receipt |
| `payment_collected` | Payment receipt |
| `refund_processed` | Refund receipt |

`{receipt_url}` is also available in the admin email template preview and sample data. If a store edits a template and removes the placeholder, the receipt still exists in the customer account; only the email link is lost.

## API

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/receipts` | Customer session | Paginated receipts for the signed-in user (20/page) |
| `GET` | `/api/v1/receipts/{receiptNumber}` | Public token **or** owner/staff | Full printable payload |
| `GET` | `/api/v1/orders/{orderNumber}/receipt` | Owner/staff | Issue or fetch the order receipt |

Order API responses include a `receipt` object with `number`, `type`, `type_label`, `amount`, `currency`, `issued_at`, and `url` when receipts are loaded.

## Data model

`receipts` table:

| Column | Notes |
| --- | --- |
| `receipt_number` | Unique, human-readable |
| `public_token` | Unique 48-char token for email links |
| `order_id`, `user_id`, `payment_transaction_id` | Relationships; transaction is null for order/refund receipts |
| `type` | `order`, `payment`, `refund` |
| `status` | `issued` (reserved for future void/reissue) |
| `amount`, `currency` | Decimal string; BDT |
| `meta` | Snapshot JSON (store, order, customer, shipping, items, totals, payment) |
| `issued_at` | Timestamp |

Migration: `2026_10_26_120000_create_receipts_table.php`.

## Operations notes

- Receipts contain customer name, email, phone, and address. Do not post public receipt links in shared channels.
- If a customer loses the email, they can sign in and open **Account → Receipts**; staff can also open the receipt from the admin order view.
- Receipts are not deleted when an order is cancelled; the snapshot records what was issued. A cancellation email does not create a refund receipt.
- There is no PDF library dependency: printing uses the browser's "Save as PDF". This keeps the server light and the output selectable/searchable.
- Tampering: the API only reads stored snapshots. Changing an order after issuance does not change an existing receipt.

## Verified in staging

- Order and payment receipts issued for a live order; printable page rendered with store branding, items, totals, payment reference, and print button.
- Account receipts list rendered the issued payment receipt.
- Public token access works; a wrong token returns `404`; another customer cannot read the receipt.
- Automated coverage: `tests/Feature/BkashAndReceiptTest.php`.

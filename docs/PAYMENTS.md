# Payments

The marketplace supports Cash on Delivery, manual mobile wallets, Bangla QR, bKash Pay Bill, bKash hosted checkout, and a hosted SSLCommerz gateway. Manual methods are **customer-submitted, staff-verified**; hosted gateways are confirmed against the provider API before an order is marked paid.

## Seeded methods

| Code | Name | Provider | Type | Mode | Enabled | Destination |
| --- | --- | --- | --- | --- | --- | --- |
| `cod` | Cash on Delivery | `cod` | `cod` | `manual` | Yes | Courier |
| `bkash` | bKash (Send Money) | `bkash` | `mfs` | `manual` | Yes | `01700000001` |
| `nagad` | Nagad | `nagad` | `mfs` | `manual` | Yes | `01700000002` |
| `rocket` | Rocket (DBBL) | `rocket` | `mfs` | `manual` | Yes | `01700000003` |
| `banglaqr` | Bangla QR | `banglaqr` | `qr` | `manual` | Yes | `01700000004` |
| `online` | Card / Online Banking | `sslcommerz` | `hosted` | `sandbox` | **No** | SSLCommerz |
| `bkash_online` | bKash Online Checkout | `bkash` | `hosted` | `sandbox` | **No** | bKash tokenized API |
| `bkash_paybill` | bKash Pay Bill | `bkash_paybill` | `mfs` | `manual` | Yes (demo biller) | Biller `DEMO-BILLER` |

> **Replace the wallet numbers and Pay Bill biller before production.** `01700000001`–`01700000004` and `DEMO-BILLER` are demo placeholders. Update them in **Admin → Payment methods** or with `PaymentMethodSeeder`.

## Payment status values

`unpaid`, `awaiting_verification`, `cod_pending`, `paid`, `failed`, `refunded`, `partially_refunded`.

## Checkout flows

### Cash on Delivery
1. Customer chooses `cod` at checkout.
2. Order is created with payment status `cod_pending`; stock is reserved.
3. Courier collects cash. Staff record collection with `POST /api/v1/admin/orders/{order}/cod-collected`, which creates/updates the payment transaction and marks the order paid.
4. COD collection is a **record**, not a movement of money.

### Manual mobile wallet / Bangla QR
1. Customer chooses a method; checkout creates a payment transaction with status `pending` and the order becomes `unpaid`.
2. Customer sees merchant instructions (number, account type, amount, order reference) and — for `banglaqr` — a QR payload.
3. Customer pays in their wallet/bank app, then submits `transaction_id` (4–100 chars) and optional `sender_number` via `POST /api/v1/orders/{orderNumber}/payment/submit`.
4. Transaction becomes `submitted`; order becomes `awaiting_verification`. Customer and staff see it in **Admin → Payment verification**.
5. Staff cross-check the merchant statement:
   - **Verify** → transaction `collected`, order `paid`, `paid_at` set, receipt issued, customer emailed/SMS'd, `payment.collected` webhook queued.
   - **Reject** (reason 4–300 chars) → transaction `failed`, order returns to `unpaid`, customer notified with the reason, `payment.rejected` webhook queued.
6. A verified payment cannot be rejected. A rejected reference can be resubmitted from the order page.

### bKash Pay Bill (manual biller)
1. The admin configures a **Biller ID** and **biller display name** under **Admin → Payment methods → bKash Pay Bill**. Checkout shows these in the instructions and in the payment panel.
2. Customer opens the bKash app → **Pay Bill**, selects the biller, enters the order amount and order number, and confirms with the PIN.
3. Customer submits the Pay Bill transaction ID at checkout or from the order page.
4. The transaction becomes `submitted` and the order `awaiting_verification`, exactly like a Send Money payment.
5. Staff match the reference against the bKash merchant/biller statement and verify or reject under **Admin → Payment verification**.

Automatic reconciliation with bKash's Pay Bill settlement feed is **not** enabled. It requires bKash merchant onboarding and API approval. Until then, verification is a human step and should be staffed during business hours.

### bKash Online Checkout (hosted tokenized)
1. Admin enables `bkash_online` and saves the merchant **App Key**, **App Secret**, **API Username**, and **API Password** from the bKash merchant dashboard.
2. `POST /api/v1/checkout` (or `POST /api/v1/orders/{orderNumber}/payment/retry` for an existing order) creates a bKash payment session via `/tokenized/checkout/create` and returns a `bkashURL`.
3. The customer approves the payment on bKash and is redirected to
   `GET|POST /api/v1/payments/bkash/{orderNumber}/callback`.
4. The service:
   - rejects the callback when the returned `paymentID` does not match the stored one;
   - executes the payment with `/tokenized/checkout/execute` (falling back to `/tokenized/checkout/payment/status`);
   - requires `transactionStatus=Completed`, `currency=BDT`, an exact amount match, and a `merchantInvoiceNumber` beginning with the order number;
   - marks the transaction `collected`, the order `paid`, issues a payment receipt, and sends the payment email.
5. Failure/cancel redirects back to the order with `?payment=cancel`; validation failures return `?payment=invalid`.

Endpoints:

| Environment | Base URL |
| --- | --- |
| Sandbox | `https://tokenized.sandbox.bka.sh/v1.2.0-beta` |
| Live | `https://tokenized.pay.bka.sh/v1.2.0-beta` |

Token grant is cached for 50 minutes. `sandbox` in the method config selects the endpoint.

**This path is unverified against bKash** — no merchant credentials are configured in staging, and the method ships disabled. bKash requires public HTTPS for callbacks, so it cannot complete on the current HTTP staging host.

### Hosted SSLCommerz (disabled)
1. `POST /api/v1/checkout` with `payment_method=online` creates the order and returns a `redirect_url`.
2. Customer pays on SSLCommerz and returns through `/api/v1/payments/sslcommerz/{orderNumber}/success`, `/fail`, `/cancel`; IPN goes to `/ipn`.
3. The service validates the gateway response with `val_id` before marking the transaction collected.
4. **This path is unverified in staging** — no merchant account has been connected, and the method is seeded disabled with blank `store_id` / `store_password`.

## Fees and limits

Each method supports:

- `fee_amount` — fixed BDT fee.
- `fee_percent` — percentage of the order subtotal.
- `min_amount` / `max_amount` — reject the method outside this order total.

The fee is added at quote/checkout as `payment_fee` and is included in `grand_total`. The checkout UI shows it before the order is placed. COD defaults to zero fee.

> Fee arithmetic is server-side (`Money` helpers, BCMath, 2 decimals). Never compute totals in the browser.

## Bangla QR payload

`PaymentService::qrPayload()` generates an EMVCo-style payload:

| Tag | Value |
| --- | --- |
| `00` | `01` (payload format) |
| `01` | `12` (dynamic QR) |
| `26` | Merchant account info: `00=bd.banglaqr`, `01=merchant_number`, `02=order_number` |
| `52` | `5999` (merchant category) |
| `53` | `050` (BDT numeric currency code) |
| `54` | Order grand total |
| `58` | `BD` |
| `59` | Merchant name (max 25 chars) |
| `60` | Merchant city (max 15 chars; default `Dhaka`) |
| `62` | Additional data: `01=order_number` |
| `63` | CRC16-CCITT checksum, uppercase hex |

A production payload was generated during smoke testing:

```
00020101021226510011bd.banglaqr0111017000000040217BDP-261026-OOV9MX5204599953030505405
5490.005802BD5914BD Marketplace6005Dhaka63046A2A
```

**Caveat:** the GUI `bd.banglaqr` and tag layout follow the public Bangla QR convention, but exact issuer/bank compatibility has **not** been certified. Confirm the payload with your acquiring bank/PSP before relying on scan-to-pay. Until then, manual reference submission is the source of truth.

## API reference

### Customer
| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/payment-methods` | Enabled methods with public config (never secrets) |
| `POST` | `/api/v1/checkout/quote` | Totals including `payment_fee`, method availability |
| `POST` | `/api/v1/checkout` | Create order; returns payment instructions/transaction or hosted `redirect_url` |
| `POST` | `/api/v1/orders/{orderNumber}/payment/submit` | Submit wallet/QR/Pay Bill reference (throttle 6/min) |
| `POST` | `/api/v1/orders/{orderNumber}/payment/retry` | Restart a hosted gateway session |
| `GET` | `/api/v1/orders/{orderNumber}/payment` | Payment instructions for an order |

### Gateway callbacks
| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/v1/payments/bkash/{orderNumber}/callback` | bKash return URL |
| `POST` | `/api/v1/payments/sslcommerz/{orderNumber}/success` | SSLCommerz success |
| `POST` | `/api/v1/payments/sslcommerz/{orderNumber}/fail` | SSLCommerz failure |
| `POST` | `/api/v1/payments/sslcommerz/{orderNumber}/cancel` | SSLCommerz cancel |
| `POST` | `/api/v1/payments/sslcommerz/{orderNumber}/ipn` | SSLCommerz IPN |

### Staff
All require `auth:sanctum` + `permission:payments.manage` (methods require `settings.manage`).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/payments/pending` | Submitted/pending manual payments, paginated 15 |
| `POST` | `/api/v1/admin/payments/{transaction}/verify` | Body: optional `reference` |
| `POST` | `/api/v1/admin/payments/{transaction}/reject` | Body: required `reason` |
| `GET` | `/api/v1/admin/payment-methods` | All methods; secrets masked with `has_*` flags |
| `PATCH` | `/api/v1/admin/payment-methods/{id}` | Update method, fees, limits, config |
| `POST` | `/api/v1/admin/orders/{order}/cod-collected` | Record COD collection |

Secret handling: `store_password`, `api_key`, `api_secret`, `app_secret`, and `password` are stored encrypted. The admin API returns them blank plus `has_app_secret` / `has_password` flags. Sending a blank secret on update **keeps** the existing value; omit the key or send a new value to change it.

## bKash configuration

Enable `bkash_online` under **Admin → Payment methods** and fill:

| Key | Meaning |
| --- | --- |
| `app_key` | bKash tokenized checkout App Key |
| `app_secret` | bKash App Secret (masked after save) |
| `username` | bKash API username |
| `password` | bKash API password (masked after save) |
| `sandbox` | `true` for sandbox, `false` for live |

For `bkash_paybill`, fill the wallet fields plus:

| Key | Meaning |
| --- | --- |
| `biller_id` | Biller ID issued during bKash merchant/Pay Bill onboarding |
| `biller_name` | Name shown to the customer in the instructions |
| `merchant_number` / `merchant_name` | Merchant wallet shown in the payment panel |

Checklist before enabling bKash Online Checkout:

1. Merchant account approved and callback URL whitelisted: `https://<your-domain>/api/v1/payments/bkash/<orderNumber>/callback` (the service builds it from `APP_URL`).
2. Public HTTPS domain and valid TLS. bKash will not call back to plain HTTP or a private IP.
3. `APP_URL` and `FRONTEND_URL` set to the public HTTPS origin.
4. Run a sandbox payment end-to-end: success, cancel, failure, amount mismatch, and callback replay.
5. Switch `sandbox` off only after sandbox verification.
6. Refunds are recorded manually; the platform does not call a bKash refund API.

## SSLCommerz configuration

Set `online.enabled = true` and fill:

| Key | Meaning |
| --- | --- |
| `store_id` | SSLCommerz store ID |
| `store_password` | SSLCommerz store password |
| `sandbox` | `true` for sandbox, `false` for live |

Checklist before enabling:

1. Merchant account approved and IPN/success URLs whitelisted for the real domain.
2. Public HTTPS domain and valid TLS (currently missing).
3. Test a sandbox payment end-to-end, including failure/cancel and IPN replay.
4. Confirm refunds are handled manually or via the SSLCommerz dashboard; the platform records refunds but does not call a gateway refund API.

## Operational checklist

- [ ] Replace demo merchant numbers and the demo Pay Bill biller.
- [ ] Confirm each wallet account type (Merchant/Agent/Personal) and instructions.
- [ ] Set realistic fees/limits.
- [ ] Verify a small real payment per method and record the reference.
- [ ] Keep "Payment verification" staffed during business hours; customers are told verification takes up to one business day.
- [ ] Never verify from a screenshot alone — match the merchant statement.
- [ ] Reconcile `payment_transactions` against merchant statements daily.
- [ ] Configure bKash/SSLCommerz credentials and test callbacks over public HTTPS before enabling hosted methods.

## Verified in staging

- Manual bKash checkout → order `BDP-261026-K3XXID`, transaction `submitted`/`awaiting_verification`; staff verification → `collected`, order `paid`, receipt issued.
- Bangla QR checkout → `qr_payload` generated with valid CRC16 and merchant `01700000004`; order remains `unpaid` until verified.
- bKash Pay Bill live flow: order `BDP-261027-OPCIVH` for `৳240.00` showed biller `DEMO-BILLER` and the exact order reference at checkout; the submitted reference entered the verification queue, staff verification marked it `collected`/`paid`, and a payment receipt plus email were issued.
- Payment instructions render correctly **before** checkout (`the order total`, `your order number`) and switch to the exact amount/order number on the order page.
- bKash hosted checkout is covered by automated tests with a faked bKash API (success, amount mismatch, callback validation). **No live bKash transaction has been run.**
- All admin payment endpoints return `200` with the correct permissions.
- Automated coverage: `tests/Feature/PaymentFlowTest.php`, `tests/Feature/BkashAndReceiptTest.php`.

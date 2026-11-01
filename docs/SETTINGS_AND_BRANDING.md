# Settings and branding

Platform settings are stored in `platform_settings` (`key`, `value`, `type`, `group`, `label`) and edited in **Admin → Settings**. Every change is audited. Settings are exposed to the storefront through `GET /api/v1/settings/public` (a safe subset) and drive the logo, announcement bar, footer, SEO tags, legal copy, maintenance gate, and theme colours.

## Settings reference

### Branding and general
| Key | Notes |
| --- | --- |
| `store_name` | Header, footer, SMS templates (`{site_name}`), page title |
| `tagline` | Line under the logo |
| `store_logo_path` | Internal media path (e.g. `branding/2026/10/abc.jpg`) |
| `store_favicon_path` | Internal media path |
| `announcement` | Announcement bar text; also filtered by plugins (see below) |
| `footer_text` | Footer description |
| `about` | About page/fallback footer copy |

### Contact and social
`support_phone`, `support_email`, `support_hours`, `support_address`, `whatsapp_number`, `facebook_url`, `instagram_url`, `youtube_url`, `tiktok_url`, `linkedin_url`.

### Appearance
| Key | Default | Notes |
| --- | --- | --- |
| `primary_color` | `#f85606` | Hex colour; generates the Tailwind `brand-50`…`brand-900` palette at runtime. Drives the marketplace header, prices, badges, and buttons |
| `secondary_color` | `#1f2937` | Hex colour for the announcement bar and dark accents |
| `currency_symbol` | `৳` | Price prefix across the storefront |
| `font_family` | `inter` | Body font (`inter`, `dm-sans`, `manrope`, `plus-jakarta`, `sora`) |
| `heading_font_family` | `inter` | Heading font; falls back to `font_family` |
| `font_scale` | `1` | Global text scale multiplier |
| `content_width` | `wide` | `narrow`, `normal`, or `wide` container width |
| `card_radius` | `lg` | Corner radius for cards and panels |
| `product_columns` | `5` | Storefront product grid columns on desktop (2–6) |
| `sticky_header` | `1` | Keep the storefront header pinned while scrolling |
| `show_announcement` | `1` | Show the utility/announcement strip |
| `newsletter_enabled` | `1` | Show the footer newsletter block |
| `newsletter_title`, `newsletter_text` | — | Newsletter copy |

These are applied at runtime by `frontend/src/lib/settings.ts` (`applyAppearance()`), so
branding and layout changes take effect without rebuilding the SPA.

### Commerce
`cod_enabled`, `tax_enabled`, `tax_percent`, `min_order_amount`, `free_shipping_note`, `order_prefix`, `return_policy`.

### SEO
`meta_title`, `meta_description`, `meta_keywords` — injected into the SPA `<head>` by the storefront layout. `meta_title` **overrides** the fallback `${store_name} — Bangladesh's multi-vendor marketplace`; after renaming the store, update or clear `meta_title` so the browser tab does not keep the old name.

### Legal
`privacy_policy`, `terms_conditions` — rendered by the legal pages.

### Notifications
`sms_enabled` — master switch for the SMS system (see [SMS.md](SMS.md)).

### Maintenance
`maintenance_mode`, `maintenance_message`.

## Logo and favicon uploads

1. In **Admin → Settings → Branding & general**, choose **Upload image** for the logo or favicon.
2. The browser uploads to `POST /api/v1/uploads` with `folder=branding`.
3. The server validates:
   - MIME is JPEG, PNG, or WebP (checked server-side);
   - max **5 MB**;
   - random 32-character filename;
   - stored under `storage/app/uploads/branding/YYYY/MM/`, outside the document root.
4. The returned path is saved to `store_logo_path` / `store_favicon_path` and served at `/media/...`.
5. Saving settings publishes the new logo/favicon to `/settings/public`; the storefront picks it up on the next settings fetch.

Remove clears the path but leaves the file on disk. Old files are not garbage-collected automatically.

> Nginx must keep the `location ^~ /media/` rule ahead of the static-file regex; otherwise `/media/...` returns 404. This exact bug was fixed and verified (images return `200` with the correct content type).

## Dynamic theme

The storefront does **not** use hard-coded brand colours:

1. `settings.primary_color` is parsed (`#rgb` or `#rrggbb`).
2. `applyBrandColor()` generates tints/shades 50–900 and sets `--brand-50` … `--brand-900` as RGB channel variables on `<html>`.
3. Tailwind's `brand` palette resolves to those variables (`rgb(var(--brand-500) / <alpha-value>)`), so opacity modifiers keep working.
4. A contrast value `--brand-contrast` is computed from luminance. A CSS rule applies it to white text on `bg-brand-500`/`bg-brand-600`, so a bright colour like `#00ff88` gets black text instead of unreadable white.
5. `secondary_color` is applied inline to the announcement bar.
6. The palette is applied by both the storefront layout and the admin/seller portal layout, including on a full page reload.

Example: the shipped defaults are `primary_color=#f85606` and `secondary_color=#1f2937`, which produce the Daraz-style orange marketplace header, orange price text, orange badges, and a dark announcement strip. Administrators can change these at any time in **Admin → Settings → Appearance**; treat the values shown in the UI as authoritative rather than this document.

## Storefront design system (Daraz-inspired)

The customer-facing shop uses a marketplace layout rather than a generic storefront:

- **Orange header** (`.store-header`) with the logo, search bar and category selector,
  wishlist/messages/alerts/cart shortcuts, and an account dropdown.
- **Utility strip** (`.store-topbar`) with help, order tracking, seller signup, and login links.
- **Category navigation** (`.store-catnav`) with an "All Categories" mega menu.
- **Hero carousel** with side promo cards, dots, and arrow controls.
- **Circular category strip** (`.dz-cat-circle`) for the top eight departments.
- **Flash-sale rail** (`.dz-flash-head`, `.dz-countdown`, `.dz-progress`) with a live
  countdown and sold/stock progress bars.
- **"Just For You" feed** with Featured / New arrivals / Best sellers tabs and load-more.
- **Product cards** (`.dz-card`, `.dz-discount`) with a discount corner badge, compact BDT
  price, strike-through compare price, rating stars, sold count, and a COD tag.
- **Listing page** with breadcrumb, result bar, sort dropdown, filter rail, active filter
  chips, and pagination.

Tokens live in `frontend/src/index.css`:

| Token / class | Purpose |
| --- | --- |
| `--brand-50` … `--brand-900` | RGB channels generated from `primary_color` |
| `--brand-contrast` | Readable text colour on brand backgrounds |
| `.store-shell` | Page background (`#f5f5f5`) |
| `.store-header`, `.store-topbar`, `.store-catnav` | Header bands |
| `.store-search-shell`, `.store-search-btn` | Search bar |
| `.dz-card`, `.dz-discount` | Product card and discount badge |
| `.dz-section`, `.dz-section-head` | White content panels |
| `.dz-flash-head`, `.dz-countdown`, `.dz-progress` | Flash sale |
| `.dz-chip`, `.dz-chip-active` | Tabs and filter chips |
| `.dz-payment-badge` | bKash/Nagad/Rocket/QR/COD badges |

Product grid density comes from the `product-grid` utility in
`frontend/tailwind.config.js`, which respects `product_columns`.

If a colour is invalid, the previous/default palette remains. Changing a colour takes effect for users on their next settings fetch (React Query caches it for 10 minutes).

## Announcement plugin filter

The public announcement is:

```php
Hook::applyFilters('home.announcement', PlatformSetting::get('announcement', ''))
```

If a plugin supplies a default (the bundled Free Delivery Banner does), it can appear even when `announcement` is empty in the database. Disable the plugin to fall back to the platform value. This is expected behaviour, not a settings bug.

## Maintenance mode

- When `maintenance_mode` is on, the **storefront** renders a maintenance screen with the configured message and a staff sign-in link.
- Staff can still sign in and use the admin/seller portals.
- This is a **frontend gate only**. The public API remains reachable; it is not a security boundary. Use a real maintenance mode at the web server/CDN layer if you need to block all traffic.

## Updating settings

- UI: **Admin → Settings** → choose a tab → **Save all settings**.
- API:

```http
PATCH /api/v1/admin/settings
Content-Type: application/json

{
  "settings": [
    { "key": "store_name", "value": "BD Marketplace" },
    { "key": "primary_color", "value": "#00a651" },
    { "key": "announcement", "value": "Eid sale is live" }
  ]
}
```

Requires `auth:sanctum` + `permission:settings.manage`. `settings` must be an array of `{key, value}` objects. Only allow-listed keys are accepted; unknown keys fail validation. Updates are audited.

## Public payload

`GET /api/v1/settings/public` returns booleans as booleans, adds `store_logo_url` / `store_favicon_url`, filters the announcement, and **never** returns gateway credentials or internal secrets. Values such as `tax_percent` and `min_order_amount` are included for display; authoritative pricing is computed server-side at checkout.

## Verified in staging

- Logo/favicon upload succeeded; media served with `200`/correct MIME; test file cleaned up.
- Primary colour changed storefront buttons and links; secondary colour changed the announcement bar.
- Plugin filter toggling changed the announcement as described.
- Automated coverage: `tests/Feature/SettingsBrandingTest.php`.

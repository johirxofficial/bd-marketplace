# Plugins

Plugins are server-side add-ons installed by a developer with filesystem access. Administrators can enable, disable, configure, and resync them, but **cannot upload plugin code** — that would be a remote-code-execution feature and is deliberately omitted.

## How it works

1. Each plugin is a folder under `backend/plugins/<plugin-id>/` containing `plugin.json` and a PHP class.
2. The folder is included in Composer's `classmap` (`"classmap": ["plugins/"]`) because dashed folder names are not valid PSR-4 namespaces.
3. On boot, `PluginManager` loads enabled database rows and calls `boot()` on each class implementing `App\Plugins\Plugin`.
4. Plugins register filters/actions on the `Hook` bus. A plugin that throws during boot is logged and skipped; a throwing hook callback is reported and ignored.

## Manifest

```json
{
  "id": "free-delivery-banner",
  "name": "Free Delivery Banner",
  "version": "1.0.0",
  "description": "Adds a storefront announcement through the home.announcement filter and logs order placement events.",
  "author": "BD Marketplace",
  "class": "Plugins\\FreeDeliveryBanner\\Plugin"
}
```

Required: `id`, `class`. Optional: `name`, `version`, `description`, `author`. Invalid manifests are ignored with a warning in the Laravel log.

## Contract

```php
namespace App\Plugins;

interface Plugin
{
    public function id(): string;
    public function boot(): void;
}
```

## Hook API

```php
use App\Plugins\Hook;

// Filter: transform a value. Return the (possibly modified) value.
Hook::addFilter('home.announcement', fn ($value) => $value ?: 'Default announcement', priority: 10);

// Action: side effect. Return value ignored.
Hook::addAction('order.placed', fn ($order) => logger()->info('Order placed', [
    'order' => $order->order_number,
]), priority: 10);
```

- Lower priority numbers run first.
- Exceptions are caught, reported, and do not break the request.
- Hooks are registered per request; changes take effect on the **next request**.

### Hook points currently available

| Type | Tag | Argument(s) | Used by |
| --- | --- | --- | --- |
| Filter | `home.announcement` | `string $announcement` | Public settings + home payload |
| Action | `order.placed` | `Order $order` | Checkout completion |

The bus is generic; add new `applyFilters()` / `doAction()` calls in application code where an extension point is needed, and document the tag here.

## Example plugin

The bundled example (`plugins/free-delivery-banner/`) shows both hook types and is enabled by default in staging:

```php
namespace Plugins\FreeDeliveryBanner;

use App\Plugins\Hook;
use App\Plugins\Plugin as PluginContract;
use Illuminate\Support\Facades\Log;

class Plugin implements PluginContract
{
    public function id(): string { return 'free-delivery-banner'; }

    public function boot(): void
    {
        Hook::addFilter('home.announcement', fn ($value) => $value
            ?: 'Free delivery on orders over ৳2,000 — shop verified sellers across Bangladesh.');

        Hook::addAction('order.placed', function ($order) {
            Log::info('FreeDeliveryBanner observed order.placed', [
                'order' => $order->order_number ?? null,
            ]);
        });
    }
}
```

## Installing a plugin

1. Create `backend/plugins/<plugin-id>/plugin.json` and the class file. Folder name and `id` should match.
2. Namespace must match the folder layout (`Plugins\MyPlugin\Plugin` → `plugins/my-plugin/Plugin.php` if declared in the manifest).
3. Rebuild the autoloader:

   ```bash
   cd /var/www/bd-marketplace/backend
   composer dump-autoload -o
   ```

4. Sync manifests (registers/updates DB rows, preserving enabled state):
   - **Admin → Plugins → Sync manifests**, or `POST /api/v1/admin/plugins/sync`.
5. Enable the plugin in **Admin → Plugins**.
6. Rebuild caches/redeploy so the next request boots it:

   ```bash
   cd /var/www/bd-marketplace
   sudo bash scripts/deploy.sh
   ```

7. Verify the hook effect (e.g. announcement appears) and check `backend/storage/logs/laravel.log` for plugin warnings.

## Configuration

Per-plugin configuration is a JSON object stored **encrypted** (`plugins.config`). Edit it in **Admin → Plugins → Configure**; invalid JSON is rejected client-side and server-side expects an array. Configuration never appears in public APIs unless the plugin explicitly uses it.

A plugin record whose folder is deleted stays visible with `missing: true`; disable it or restore the files. Enabled-but-missing classes are logged and skipped at boot.

## Admin API

Requires `auth:sanctum` + `permission:plugins.manage`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/admin/plugins` | Manifests + installed state, config, hook counts, plugin path |
| `POST` | `/api/v1/admin/plugins/sync` | Register/update manifests from disk |
| `PATCH` | `/api/v1/admin/plugins/{plugin}` | Body: `enabled` (bool), optional `config` (object) |

All actions are audited (`plugins.synced`, `plugin.updated`).

## Security notes

- No upload endpoint, no ZIP extraction, no admin code editing.
- Plugins run with full application privileges — only install code you have reviewed.
- Plugin config may contain secrets; keep it minimal and encrypted-by-default (already enforced by the model cast).
- Hook handlers must be idempotent where they cause side effects; they can run on every request.
- Removing a plugin folder is not enough: disable the DB row too, or boot will log missing-class warnings.

## Verified in staging

- Manifest discovered and synced (`1 plugin manifest synchronized`).
- Disabling removed the filter (public announcement became `null`); re-enabling restored it with `1 filter · 1 action` registered.
- Automated coverage: `tests/Feature/PluginTest.php`.

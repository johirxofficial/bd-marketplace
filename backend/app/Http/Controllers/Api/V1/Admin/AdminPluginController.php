<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plugin;
use App\Plugins\Hook;
use App\Plugins\PluginManager;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPluginController extends Controller
{
    public function __construct(
        private readonly PluginManager $plugins,
        private readonly AuditService $audit,
    ) {}

    public function index(): JsonResponse
    {
        $installed = Plugin::orderBy('name')->get()->keyBy('plugin_id');
        $manifests = $this->plugins->manifests();

        $items = collect($manifests)->map(function (array $manifest, string $id) use ($installed) {
            $record = $installed->get($id);

            return [
                'plugin_id' => $id,
                'name' => $manifest['name'] ?? $id,
                'version' => $manifest['version'] ?? '1.0.0',
                'description' => $manifest['description'] ?? null,
                'author' => $manifest['author'] ?? null,
                'class' => $manifest['class'],
                'installed' => (bool) $record,
                'enabled' => (bool) ($record?->enabled ?? false),
                'config' => $record?->config,
                'discovered_at' => $record?->discovered_at?->toIso8601String(),
            ];
        })->values();

        // Enabled database rows whose folder has been removed are still shown.
        $installed->each(function (Plugin $record, string $id) use (&$items) {
            if (! $items->contains(fn ($item) => $item['plugin_id'] === $id)) {
                $items->push([
                    'plugin_id' => $id,
                    'name' => $record->name,
                    'version' => $record->version,
                    'description' => $record->description,
                    'author' => $record->author,
                    'class' => $record->class,
                    'installed' => true,
                    'enabled' => $record->enabled,
                    'config' => $record->config,
                    'discovered_at' => $record->discovered_at?->toIso8601String(),
                    'missing' => true,
                ]);
            }
        });

        return response()->json([
            'plugins' => $items->values(),
            'hooks' => Hook::registered(),
            'plugin_path' => base_path('plugins'),
        ]);
    }

    public function sync(): JsonResponse
    {
        $result = $this->plugins->sync();
        $this->audit->log('plugins.synced', null, [], ['synced' => $result['synced']]);

        return response()->json(['message' => "{$result['synced']} plugin manifest(s) synchronized."]);
    }

    public function update(Request $request, Plugin $plugin): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'config' => ['nullable', 'array'],
        ]);

        $plugin->update([
            'enabled' => $data['enabled'],
            'config' => $data['config'] ?? $plugin->config,
        ]);

        $this->plugins->flush();
        $this->plugins->boot();

        $this->audit->log('plugin.updated', $plugin, [], ['enabled' => $plugin->enabled]);

        return response()->json([
            'message' => $plugin->enabled ? 'Plugin enabled. Its hooks are now active.' : 'Plugin disabled.',
            'plugin' => ['plugin_id' => $plugin->plugin_id, 'enabled' => $plugin->enabled],
            'hooks' => Hook::registered(),
        ]);
    }
}

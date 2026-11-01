<?php

namespace App\Plugins;

use App\Models\Plugin as PluginModel;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class PluginManager
{
    private bool $booted = false;

    /**
     * Read every plugins/{folder}/plugin.json manifest.
     *
     * @return array<string, array<string, mixed>>
     */
    public function manifests(): array
    {
        $manifests = [];

        foreach (glob(base_path('plugins/*/plugin.json')) ?: [] as $file) {
            $data = json_decode((string) file_get_contents($file), true);

            if (! is_array($data) || empty($data['id']) || empty($data['class'])) {
                Log::warning('Ignoring invalid plugin manifest', ['file' => $file]);

                continue;
            }

            $data['_path'] = dirname($file);
            $manifests[$data['id']] = $data;
        }

        return $manifests;
    }

    /**
     * Persist discovered manifests. Existing rows keep their enabled state.
     *
     * @return array{synced: int, manifests: array<string, array<string, mixed>>}
     */
    public function sync(): array
    {
        $manifests = $this->manifests();

        foreach ($manifests as $id => $manifest) {
            PluginModel::updateOrCreate(
                ['plugin_id' => $id],
                [
                    'name' => $manifest['name'] ?? $id,
                    'version' => $manifest['version'] ?? '1.0.0',
                    'description' => $manifest['description'] ?? null,
                    'author' => $manifest['author'] ?? null,
                    'class' => $manifest['class'],
                    'discovered_at' => now(),
                ],
            );
        }

        return ['synced' => count($manifests), 'manifests' => $manifests];
    }

    public function boot(): void
    {
        if ($this->booted || ! Schema::hasTable('plugins')) {
            return;
        }

        $this->booted = true;

        $plugins = PluginModel::where('enabled', true)->get();

        foreach ($plugins as $record) {
            if (! class_exists($record->class)) {
                Log::warning('Enabled plugin class is missing', ['plugin' => $record->plugin_id, 'class' => $record->class]);

                continue;
            }

            try {
                $instance = app($record->class);

                if (! $instance instanceof Plugin) {
                    Log::warning('Plugin does not implement the Plugin contract', ['plugin' => $record->plugin_id]);

                    continue;
                }

                $instance->boot();
            } catch (\Throwable $e) {
                report($e);
                Log::error('Plugin failed to boot', ['plugin' => $record->plugin_id, 'error' => $e->getMessage()]);
            }
        }
    }

    public function flush(): void
    {
        Hook::flush();
        $this->booted = false;
    }
}

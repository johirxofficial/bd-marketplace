<?php

namespace App\Plugins;

/**
 * Minimal WordPress-style hook bus. Plugins register filters (transform a
 * value) and actions (side effects) during boot.
 */
final class Hook
{
    /** @var array<string, array<int, array{priority: int, callback: callable}>> */
    private static array $filters = [];

    /** @var array<string, array<int, array{priority: int, callback: callable}>> */
    private static array $actions = [];

    public static function addFilter(string $tag, callable $callback, int $priority = 10): void
    {
        self::$filters[$tag][] = ['priority' => $priority, 'callback' => $callback];
    }

    public static function addAction(string $tag, callable $callback, int $priority = 10): void
    {
        self::$actions[$tag][] = ['priority' => $priority, 'callback' => $callback];
    }

    public static function applyFilters(string $tag, mixed $value, mixed ...$args): mixed
    {
        $callbacks = self::$filters[$tag] ?? [];
        usort($callbacks, fn ($a, $b) => $a['priority'] <=> $b['priority']);

        foreach ($callbacks as $entry) {
            try {
                $value = ($entry['callback'])($value, ...$args);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $value;
    }

    public static function doAction(string $tag, mixed ...$args): void
    {
        $callbacks = self::$actions[$tag] ?? [];
        usort($callbacks, fn ($a, $b) => $a['priority'] <=> $b['priority']);

        foreach ($callbacks as $entry) {
            try {
                ($entry['callback'])(...$args);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    public static function flush(): void
    {
        self::$filters = [];
        self::$actions = [];
    }

    /**
     * @return array<string, int>
     */
    public static function registered(): array
    {
        return [
            'filters' => array_sum(array_map('count', self::$filters)),
            'actions' => array_sum(array_map('count', self::$actions)),
        ];
    }
}

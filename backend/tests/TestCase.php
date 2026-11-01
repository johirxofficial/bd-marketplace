<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Hard guard: the suite runs on an in-memory SQLite database. This makes
     * it impossible for a mistaken phpunit configuration to wipe the live
     * MySQL marketplace database.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");

        if ($connection !== 'sqlite' || $database !== ':memory:') {
            $this->fail(sprintf(
                'Refusing to run tests against %s/%s. Tests must use sqlite :memory:.',
                $connection,
                $database,
            ));
        }
    }
}

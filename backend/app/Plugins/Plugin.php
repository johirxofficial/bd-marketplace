<?php

namespace App\Plugins;

interface Plugin
{
    public function id(): string;

    public function boot(): void;
}

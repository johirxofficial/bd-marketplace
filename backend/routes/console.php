<?php

use Illuminate\Support\Facades\Schedule;

Schedule::call(function () {
    \App\Models\MarketplaceNotification::where('created_at', '<', now()->subDays(90))->delete();
})->daily()->description('Prune old marketplace notifications');

Schedule::call(function () {
    \App\Models\Cart::where('updated_at', '<', now()->subDays(60))
        ->whereHas('items')
        ->each(function ($cart) { $cart->items()->delete(); });
})->weekly()->description('Clear abandoned cart items older than 60 days');

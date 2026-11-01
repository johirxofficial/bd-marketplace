<?php

namespace Plugins\FreeDeliveryBanner;

use App\Plugins\Hook;
use App\Plugins\Plugin as PluginContract;
use Illuminate\Support\Facades\Log;

class Plugin implements PluginContract
{
    public function id(): string
    {
        return 'free-delivery-banner';
    }

    public function boot(): void
    {
        Hook::addFilter('home.announcement', function ($value) {
            return $value ?: 'Free delivery on orders over ৳2,000 — shop verified sellers across Bangladesh.';
        });

        Hook::addAction('order.placed', function ($order) {
            Log::info('FreeDeliveryBanner plugin observed order.placed', [
                'order' => $order->order_number ?? null,
            ]);
        });
    }
}

<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Models\ShippingZone;
use Illuminate\Http\JsonResponse;

class ShippingZoneController extends Controller
{
    public function index(): JsonResponse
    {
        $zones = ShippingZone::where('is_active', true)->orderBy('division')->orderBy('district')->get();

        return response()->json([
            'zones' => $zones->map(fn ($z) => [
                'id' => $z->id, 'name' => $z->name, 'division' => $z->division, 'district' => $z->district,
                'inside_dhaka' => $z->inside_dhaka, 'base_fee' => $z->base_fee,
                'free_shipping_threshold' => $z->free_shipping_threshold,
                'estimated_days_min' => $z->estimated_days_min, 'estimated_days_max' => $z->estimated_days_max,
            ]),
            'divisions' => $zones->pluck('division')->unique()->values(),
        ]);
    }
}

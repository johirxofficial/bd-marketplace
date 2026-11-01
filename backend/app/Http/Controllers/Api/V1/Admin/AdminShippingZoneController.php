<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ShippingZone;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminShippingZoneController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['zones' => ShippingZone::orderBy('division')->orderBy('district')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $zone = ShippingZone::create($this->validated($request));
        $this->audit->log('shipping_zone.created', $zone, [], $zone->toArray());

        return response()->json(['message' => 'Shipping zone created.', 'zone' => $zone], 201);
    }

    public function update(Request $request, ShippingZone $zone): JsonResponse
    {
        $old = $zone->toArray();
        $zone->update($this->validated($request));
        $this->audit->log('shipping_zone.updated', $zone, $old, $zone->toArray());

        return response()->json(['message' => 'Shipping zone updated.', 'zone' => $zone->fresh()]);
    }

    public function destroy(ShippingZone $zone): JsonResponse
    {
        $zone->delete();
        $this->audit->log('shipping_zone.deleted', $zone, $zone->toArray(), []);

        return response()->json(['message' => 'Shipping zone deleted.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'division' => ['required', 'string', 'max:50'],
            'district' => ['nullable', 'string', 'max:60'],
            'inside_dhaka' => ['sometimes', 'boolean'],
            'base_fee' => ['required', 'numeric', 'min:0', 'max:10000'],
            'free_shipping_threshold' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'estimated_days_min' => ['required', 'integer', 'min:0', 'max:30'],
            'estimated_days_max' => ['required', 'integer', 'min:0', 'max:60', 'gte:estimated_days_min'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Http\Controllers\Controller;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SellerStoreController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function show(Request $request): JsonResponse
    {
        $store = $request->user()->sellerProfile->store;

        return response()->json(['store' => $store]);
    }

    public function update(Request $request): JsonResponse
    {
        $store = $request->user()->sellerProfile->store;
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'description' => ['required', 'string', 'min:20', 'max:2000'],
            'logo_path' => ['nullable', 'string', 'max:255', 'starts_with:products/'],
            'banner_path' => ['nullable', 'string', 'max:255', 'starts_with:products/'],
        ]);
        $old = $store->only(['name', 'description', 'logo_path', 'banner_path']);
        $store->update($data);
        $this->audit->log('store.updated', $store, $old, $store->only(['name', 'description', 'logo_path', 'banner_path']));

        return response()->json(['message' => 'Store profile updated.', 'store' => $store]);
    }
}

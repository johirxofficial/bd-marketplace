<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddressRequest;
use App\Models\Address;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AddressController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $addresses = $request->user()->addresses()->orderByDesc('is_default')->latest()->get();

        return response()->json(['addresses' => $addresses]);
    }

    public function store(AddressRequest $request): JsonResponse
    {
        $address = DB::transaction(function () use ($request) {
            $isDefault = $request->boolean('is_default') || $request->user()->addresses()->count() === 0;
            if ($isDefault) {
                $request->user()->addresses()->update(['is_default' => false]);
            }
            $address = $request->user()->addresses()->create(array_merge($request->validated(), ['is_default' => $isDefault]));

            return $address;
        });

        return response()->json(['message' => 'Address saved.', 'address' => $address], 201);
    }

    public function update(AddressRequest $request, Address $address): JsonResponse
    {
        $this->owner($request, $address);
        DB::transaction(function () use ($request, $address) {
            if ($request->boolean('is_default')) {
                $request->user()->addresses()->where('id', '!=', $address->id)->update(['is_default' => false]);
            }
            $address->update($request->validated());
        });

        return response()->json(['message' => 'Address updated.', 'address' => $address->fresh()]);
    }

    public function destroy(Request $request, Address $address): JsonResponse
    {
        $this->owner($request, $address);
        $wasDefault = $address->is_default;
        $address->delete();
        if ($wasDefault) {
            $next = $request->user()->addresses()->latest()->first();
            $next?->update(['is_default' => true]);
        }

        return response()->json(['message' => 'Address removed.']);
    }

    public function setDefault(Request $request, Address $address): JsonResponse
    {
        $this->owner($request, $address);
        DB::transaction(function () use ($request, $address) {
            $request->user()->addresses()->update(['is_default' => false]);
            $address->update(['is_default' => true]);
        });

        return response()->json(['message' => 'Default address updated.', 'address' => $address->fresh()]);
    }

    private function owner(Request $request, Address $address): void
    {
        abort_unless($address->user_id === $request->user()->id, 403, 'You do not own this address.');
    }
}

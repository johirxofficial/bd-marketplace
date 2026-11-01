<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SellerProfile;
use App\Models\Store;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SellerOnboardingController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $profile = $request->user()->sellerProfile()->with('store')->first();

        return response()->json(['seller' => $profile ? [
            'business_name' => $profile->business_name,
            'business_type' => $profile->business_type,
            'phone' => $profile->phone,
            'status' => $profile->status,
            'commission_rate' => $profile->commission_rate,
            'rejection_reason' => $profile->rejection_reason,
            'store' => $profile->store ? [
                'id' => $profile->store->id, 'name' => $profile->store->name,
                'slug' => $profile->store->slug, 'status' => $profile->store->status,
            ] : null,
            'created_at' => $profile->created_at?->toIso8601String(),
        ] : null]);
    }

    public function apply(Request $request): JsonResponse
    {
        if ($request->user()->sellerProfile) {
            throw ValidationException::withMessages(['seller' => 'You already have a seller application.']);
        }

        $data = $request->validate([
            'business_name' => ['required', 'string', 'min:2', 'max:160'],
            'business_type' => ['required', 'in:individual,sole_proprietorship,partnership,limited_company'],
            'national_id' => ['nullable', 'string', 'max:50'],
            'phone' => ['required', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/'],
            'business_address' => ['required', 'string', 'min:10', 'max:1000'],
            'store_name' => ['required', 'string', 'min:2', 'max:120', 'unique:stores,name'],
            'store_description' => ['required', 'string', 'min:20', 'max:2000'],
        ]);

        $profile = DB::transaction(function () use ($request, $data) {
            $profile = SellerProfile::create([
                'user_id' => $request->user()->id,
                'business_name' => $data['business_name'],
                'business_type' => $data['business_type'],
                'national_id' => $data['national_id'] ?? null,
                'phone' => $data['phone'],
                'business_address' => $data['business_address'],
                'status' => 'pending',
            ]);
            Store::create([
                'seller_id' => $profile->id,
                'name' => $data['store_name'],
                'slug' => $this->uniqueSlug($data['store_name']),
                'description' => $data['store_description'],
                'status' => 'pending',
            ]);

            return $profile;
        });

        $staff = \App\Models\User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'manager']))->get();
        $this->notifications->sendMany($staff, 'seller.application', 'New seller application',
            "{$data['business_name']} applied to open {$data['store_name']}.", '/admin/sellers',
            ['message' => "{$data['business_name']} applied to open {$data['store_name']}."],
            'seller_application_staff');

        $this->notifications->send(
            $request->user(),
            'seller.application.received',
            'Seller application received',
            "We received your application for {$data['store_name']}.",
            '/seller/application',
            ['store_name' => $data['store_name'], 'message' => "Application for {$data['store_name']} received."],
            'seller_application',
        );

        $this->audit->log('seller.applied', $profile, [], ['business_name' => $data['business_name']]);

        return response()->json([
            'message' => 'Application submitted. Our team will review it shortly.',
            'seller' => ['status' => 'pending'],
        ], 201);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'store';
        $slug = $base;
        $i = 2;
        while (Store::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}

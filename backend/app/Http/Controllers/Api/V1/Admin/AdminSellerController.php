<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SellerProfile;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminSellerController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $sellers = SellerProfile::with(['user:id,name,email,phone,status', 'store'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('business_name', 'like', '%'.$request->string('search').'%')->orWhereHas('user', fn ($u) => $u->where('email', 'like', '%'.$request->string('search').'%'))))
            ->latest()->paginate(15);

        return response()->json(['sellers' => $sellers->through(fn ($s) => [
            'id' => $s->id,
            'business_name' => $s->business_name,
            'business_type' => $s->business_type,
            'phone' => $s->phone,
            'status' => $s->status,
            'commission_rate' => $s->commission_rate,
            'rejection_reason' => $s->rejection_reason,
            'user' => $s->user,
            'store' => $s->store,
            'created_at' => $s->created_at?->toIso8601String(),
            'approved_at' => $s->approved_at?->toIso8601String(),
        ])]);
    }

    public function approve(Request $request, SellerProfile $seller): JsonResponse
    {
        $data = $request->validate([
            'commission_rate' => ['sometimes', 'numeric', 'min:0', 'max:50'],
        ]);
        if ($seller->status === 'approved') {
            throw ValidationException::withMessages(['seller' => 'This seller is already approved.']);
        }

        DB::transaction(function () use ($seller, $request, $data) {
            $sellerRole = Role::where('name', 'seller')->firstOrFail();
            $seller->update([
                'status' => 'approved',
                'commission_rate' => $data['commission_rate'] ?? $seller->commission_rate,
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
                'rejection_reason' => null,
            ]);
            $seller->store?->update(['status' => 'active']);
            $seller->user->update(['role_id' => $sellerRole->id, 'status' => 'active']);
        });

        $this->notifications->send($seller->user_id, 'seller.approved', 'Seller account approved',
            "Your store {$seller->store?->name} is approved. You can now publish products.", '/seller');
        $this->audit->log('seller.approved', $seller, ['status' => 'pending'], ['status' => 'approved']);

        return response()->json(['message' => 'Seller approved and store activated.', 'seller' => $seller->fresh(['user', 'store'])]);
    }

    public function reject(Request $request, SellerProfile $seller): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);
        $seller->update(['status' => 'rejected', 'rejection_reason' => $data['reason']]);
        $seller->store?->update(['status' => 'rejected']);
        $this->notifications->send($seller->user_id, 'seller.rejected', 'Seller application not approved',
            'Your application was not approved. Reason: '.$data['reason'], '/seller/application',
            ['reason' => $data['reason']], 'seller_rejected');
        $this->audit->log('seller.rejected', $seller, ['status' => $seller->getOriginal('status')], ['status' => 'rejected', 'reason' => $data['reason']]);

        return response()->json(['message' => 'Seller application rejected.']);
    }

    public function suspend(Request $request, SellerProfile $seller): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);
        $seller->update(['status' => 'suspended', 'rejection_reason' => $data['reason']]);
        $seller->store?->update(['status' => 'suspended']);
        $this->notifications->send($seller->user_id, 'seller.suspended', 'Store suspended',
            'Your store has been suspended. Reason: '.$data['reason'], '/support',
            ['reason' => $data['reason']], 'seller_suspended');
        $this->audit->log('seller.suspended', $seller, [], ['status' => 'suspended', 'reason' => $data['reason']]);

        return response()->json(['message' => 'Seller suspended.']);
    }

    public function updateCommission(Request $request, SellerProfile $seller): JsonResponse
    {
        $data = $request->validate(['commission_rate' => ['required', 'numeric', 'min:0', 'max:50']]);
        $old = $seller->commission_rate;
        $seller->update(['commission_rate' => $data['commission_rate']]);
        $this->audit->log('seller.commission_updated', $seller, ['commission_rate' => $old], ['commission_rate' => $data['commission_rate']]);

        return response()->json(['message' => 'Commission rate updated.', 'seller' => $seller]);
    }
}

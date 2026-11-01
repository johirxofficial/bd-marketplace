<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Requests\Admin\CouponRequest;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminCouponController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['coupons' => Coupon::latest()->paginate(20)]);
    }

    public function store(CouponRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['code'] = strtoupper($data['code']);
        if (Coupon::where('code', $data['code'])->exists()) {
            return response()->json(['message' => 'This coupon code already exists.'], 422);
        }
        $data['created_by'] = $request->user()->id;
        $coupon = Coupon::create($data);
        $this->audit->log('coupon.created', $coupon, [], $coupon->toArray());

        return response()->json(['message' => 'Coupon created.', 'coupon' => $coupon], 201);
    }

    public function update(CouponRequest $request, Coupon $coupon): JsonResponse
    {
        $data = $request->validated();
        $data['code'] = strtoupper($data['code']);
        if (Coupon::where('code', $data['code'])->where('id', '!=', $coupon->id)->exists()) {
            return response()->json(['message' => 'This coupon code already exists.'], 422);
        }
        $old = $coupon->toArray();
        $coupon->update($data);
        $this->audit->log('coupon.updated', $coupon, $old, $data);

        return response()->json(['message' => 'Coupon updated.', 'coupon' => $coupon->fresh()]);
    }

    public function destroy(Coupon $coupon): JsonResponse
    {
        $coupon->delete();
        $this->audit->log('coupon.deleted', $coupon, $coupon->toArray(), []);

        return response()->json(['message' => 'Coupon deleted.']);
    }
}

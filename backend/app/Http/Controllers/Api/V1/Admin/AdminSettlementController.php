<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\SellerSettlement;
use App\Models\Store;
use App\Services\SettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSettlementController extends Controller
{
    public function __construct(private readonly SettlementService $settlements) {}

    public function index(Request $request): JsonResponse
    {
        $settlements = SellerSettlement::with('store:id,name')->withCount('orders')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest()->paginate(20);

        return response()->json(['settlements' => $settlements->through(fn ($s) => [
            'id' => $s->id, 'store' => $s->store?->name,
            'period_start' => $s->period_start->toDateString(), 'period_end' => $s->period_end->toDateString(),
            'gross_sales' => $s->gross_sales, 'commission_total' => $s->commission_total,
            'refund_total' => $s->refund_total, 'net_payable' => $s->net_payable,
            'status' => $s->status, 'orders_count' => $s->orders_count,
            'paid_at' => $s->paid_at?->toIso8601String(),
        ])]);
    }

    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
        ]);
        $store = Store::findOrFail($data['store_id']);
        $settlement = $this->settlements->create($store, $data['period_start'], $data['period_end'], $request->user());

        return response()->json(['message' => 'Settlement prepared.', 'settlement' => $settlement], 201);
    }

    public function approve(Request $request, SellerSettlement $settlement): JsonResponse
    {
        $settlement = $this->settlements->approve($settlement, $request->user());

        return response()->json(['message' => 'Settlement approved.', 'settlement' => $settlement]);
    }

    public function pay(Request $request, SellerSettlement $settlement): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', 'in:bank_transfer,bkash,nagad,cash,other'],
            'reference' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $payout = $this->settlements->pay($settlement, $request->user(), $data);

        return response()->json(['message' => 'Settlement marked paid.', 'payout' => $payout]);
    }
}

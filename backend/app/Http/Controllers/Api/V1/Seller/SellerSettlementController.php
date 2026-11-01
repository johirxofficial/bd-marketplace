<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Http\Controllers\Controller;
use App\Models\SellerSettlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SellerSettlementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->sellerProfile->store;
        $settlements = SellerSettlement::where('store_id', $store->id)
            ->with('payouts')->latest()->paginate(15);

        return response()->json(['settlements' => $settlements->through(fn ($s) => [
            'id' => $s->id,
            'period_start' => $s->period_start->toDateString(),
            'period_end' => $s->period_end->toDateString(),
            'gross_sales' => $s->gross_sales,
            'commission_total' => $s->commission_total,
            'refund_total' => $s->refund_total,
            'net_payable' => $s->net_payable,
            'status' => $s->status,
            'paid_at' => $s->paid_at?->toIso8601String(),
            'payouts' => $s->payouts->map(fn ($p) => [
                'id' => $p->id, 'amount' => $p->amount, 'method' => $p->method,
                'reference' => $p->reference, 'status' => $p->status, 'paid_at' => $p->paid_at?->toIso8601String(),
            ]),
        ])]);
    }
}

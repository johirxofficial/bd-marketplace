<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\SellerOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SellerReportController extends Controller
{
    public function sales(Request $request): JsonResponse
    {
        $store = $request->user()->sellerProfile->store;
        $from = $request->date('from')?->startOfDay() ?? now()->subDays(29)->startOfDay();
        $to = $request->date('to')?->endOfDay() ?? now()->endOfDay();
        if ($from->gt($to)) {
            abort(422, 'The start date must be before the end date.');
        }

        $base = SellerOrder::where('store_id', $store->id)
            ->whereNotIn('status', [OrderStatus::Cancelled->value])
            ->whereBetween('created_at', [$from, $to]);

        $daily = (clone $base)->selectRaw('DATE(created_at) as day, COUNT(*) as orders, SUM(subtotal - discount_total) as sales, SUM(commission_amount) as commission, SUM(seller_payable) as payable')
            ->groupBy('day')->orderBy('day')->get();

        $topProducts = OrderItem::whereHas('sellerOrder', fn ($q) => $q->where('store_id', $store->id)->whereNotIn('status', [OrderStatus::Cancelled->value])->whereBetween('created_at', [$from, $to]))
            ->selectRaw('product_name, sku, SUM(quantity) as units, SUM(line_total) as revenue')
            ->groupBy('product_name', 'sku')->orderByDesc('revenue')->limit(10)->get();

        $statusCounts = (clone $base)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $totals = (clone $base)->selectRaw('COUNT(*) as orders, COALESCE(SUM(subtotal - discount_total),0) as gross, COALESCE(SUM(commission_amount),0) as commission, COALESCE(SUM(seller_payable),0) as payable')->first();

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'totals' => $totals,
            'daily' => $daily,
            'top_products' => $topProducts,
            'status_counts' => $statusCounts,
        ]);
    }
}

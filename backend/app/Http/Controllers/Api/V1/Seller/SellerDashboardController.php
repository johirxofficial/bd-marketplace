<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\SellerOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SellerDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->sellerProfile->store;
        $base = SellerOrder::where('store_id', $store->id);

        $counts = (clone $base)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $gross = (clone $base)->whereNotIn('status', [OrderStatus::Cancelled->value])
            ->selectRaw('COALESCE(SUM(subtotal - discount_total), 0) as gross, COALESCE(SUM(seller_payable), 0) as payable, COALESCE(SUM(commission_amount), 0) as commission')
            ->first();
        $recent = (clone $base)->with(['order.user:id,name', 'items'])->latest()->limit(6)->get();
        $lowStock = Inventory::whereHas('variant.product', fn ($q) => $q->where('store_id', $store->id)->where('status', 'approved'))
            ->whereColumn('quantity', '<=', 'low_stock_threshold')
            ->with('variant.product:id,name,slug')
            ->limit(10)->get();

        $months = collect(range(5, 0))->map(function ($offset) use ($store) {
            $start = now()->subMonths($offset)->startOfMonth();
            $end = now()->subMonths($offset)->endOfMonth();
            $sales = SellerOrder::where('store_id', $store->id)
                ->whereNotIn('status', [OrderStatus::Cancelled->value])
                ->whereBetween('created_at', [$start, $end])
                ->sum(\Illuminate\Support\Facades\DB::raw('subtotal - discount_total'));

            return ['month' => $start->format('M Y'), 'sales' => number_format((float) $sales, 2, '.', '')];
        });

        return response()->json([
            'store' => ['id' => $store->id, 'name' => $store->name, 'status' => $store->status],
            'stats' => [
                'orders_total' => (clone $base)->count(),
                'pending_orders' => (clone $base)->whereIn('status', [OrderStatus::PendingConfirmation->value, OrderStatus::Confirmed->value, OrderStatus::Processing->value, OrderStatus::ReadyToShip->value])->count(),
                'delivered_orders' => (clone $base)->whereIn('status', [OrderStatus::Delivered->value, OrderStatus::Completed->value])->count(),
                'returns_open' => \App\Models\ReturnRequest::whereHas('sellerOrder', fn ($q) => $q->where('store_id', $store->id))->whereIn('status', ['requested', 'approved', 'received'])->count(),
                'gross_sales' => $gross->gross,
                'net_payable' => $gross->payable,
                'commission' => $gross->commission,
                'products' => Product::where('store_id', $store->id)->count(),
                'products_pending' => Product::where('store_id', $store->id)->where('status', 'pending')->count(),
                'low_stock' => $lowStock->count(),
            ],
            'status_counts' => $counts,
            'monthly_sales' => $months,
            'recent_orders' => $recent->map(fn ($so) => [
                'id' => $so->id, 'order_number' => $so->order->order_number,
                'customer' => $so->order->user?->name, 'status' => $so->status->value,
                'status_label' => $so->status->label(), 'items_count' => $so->items->sum('quantity'),
                'seller_payable' => $so->seller_payable, 'placed_at' => $so->order->placed_at?->toIso8601String(),
            ]),
            'low_stock_items' => $lowStock->map(fn ($i) => [
                'variant_id' => $i->variant_id,
                'product_name' => $i->variant->product?->name,
                'variant_name' => $i->variant->name,
                'available' => $i->available,
                'threshold' => $i->low_stock_threshold,
            ]),
        ]);
    }
}

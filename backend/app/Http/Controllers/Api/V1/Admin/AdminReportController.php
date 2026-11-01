<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentTransaction;
use App\Models\Refund;
use App\Models\SellerOrder;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $from = $request->date('from')?->startOfDay() ?? now()->subDays(29)->startOfDay();
        $to = $request->date('to')?->endOfDay() ?? now()->endOfDay();
        if ($from->gt($to)) {
            abort(422, 'The start date must be before the end date.');
        }

        $orders = Order::whereNotIn('status', [OrderStatus::Cancelled->value])->whereBetween('placed_at', [$from, $to]);
        $totals = (clone $orders)->selectRaw('COUNT(*) as orders, COALESCE(SUM(subtotal - discount_total),0) as gmv, COALESCE(SUM(discount_total),0) as discounts, COALESCE(SUM(shipping_total),0) as shipping, COALESCE(SUM(grand_total),0) as order_value')->first();
        $collected = PaymentTransaction::where('type', 'payment')->where('status', 'collected')->whereBetween('collected_at', [$from, $to])->sum('amount');
        $refunds = Refund::where('status', 'processed')->whereBetween('processed_at', [$from, $to])->sum('amount');
        $commission = SellerOrder::whereNotIn('status', [OrderStatus::Cancelled->value])->whereBetween('created_at', [$from, $to])->sum('commission_amount');
        $sellerPayable = SellerOrder::whereNotIn('status', [OrderStatus::Cancelled->value])->whereBetween('created_at', [$from, $to])->sum('seller_payable');

        $daily = (clone $orders)->selectRaw('DATE(placed_at) as day, COUNT(*) as orders, SUM(subtotal - discount_total) as gmv, SUM(grand_total) as order_value')
            ->groupBy('day')->orderBy('day')->get();

        $topStores = SellerOrder::whereNotIn('status', [OrderStatus::Cancelled->value])
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('store_id, COUNT(*) as orders, SUM(subtotal - discount_total) as gross, SUM(commission_amount) as commission')
            ->with('store:id,name')->groupBy('store_id')->orderByDesc('gross')->limit(8)->get();

        $topProducts = OrderItem::whereHas('sellerOrder', fn ($q) => $q->whereNotIn('status', [OrderStatus::Cancelled->value])->whereBetween('created_at', [$from, $to]))
            ->selectRaw('product_name, sku, SUM(quantity) as units, SUM(line_total) as revenue')
            ->groupBy('product_name', 'sku')->orderByDesc('revenue')->limit(10)->get();

        $byCategory = DB::table('order_items')
            ->join('seller_orders', 'order_items.seller_order_id', '=', 'seller_orders.id')
            ->leftJoin('products', 'order_items.product_id', '=', 'products.id')
            ->leftJoin('categories', 'products.category_id', '=', 'categories.id')
            ->whereNotIn('seller_orders.status', [OrderStatus::Cancelled->value])
            ->whereBetween('seller_orders.created_at', [$from, $to])
            ->selectRaw('COALESCE(categories.name, "Uncategorised") as category, SUM(order_items.line_total) as revenue, SUM(order_items.quantity) as units')
            ->groupBy('category')->orderByDesc('revenue')->get();

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'totals' => [
                'orders' => (int) $totals->orders,
                'gmv' => number_format((float) $totals->gmv, 2, '.', ''),
                'gross_order_value' => number_format((float) $totals->order_value, 2, '.', ''),
                'average_order_value' => $totals->orders > 0 ? number_format((float) $totals->gmv / $totals->orders, 2, '.', '') : '0.00',
                'discounts' => number_format((float) $totals->discounts, 2, '.', ''),
                'shipping_revenue' => number_format((float) $totals->shipping, 2, '.', ''),
                'collected' => number_format((float) $collected, 2, '.', ''),
                'refunds' => number_format((float) $refunds, 2, '.', ''),
                'commission' => number_format((float) $commission, 2, '.', ''),
                'seller_payable' => number_format((float) $sellerPayable, 2, '.', ''),
                'new_customers' => User::whereHas('role', fn ($q) => $q->where('name', 'customer'))->whereBetween('created_at', [$from, $to])->count(),
            ],
            'daily' => $daily,
            'top_stores' => $topStores,
            'top_products' => $topProducts,
            'by_category' => $byCategory,
            'payment_status_counts' => (clone $orders)->selectRaw('payment_status, COUNT(*) as total')->groupBy('payment_status')->pluck('total', 'payment_status'),
        ]);
    }
}

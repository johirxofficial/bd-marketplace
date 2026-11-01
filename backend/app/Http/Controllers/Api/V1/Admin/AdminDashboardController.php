<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\PaymentTransaction;
use App\Models\Product;
use App\Models\Refund;
use App\Models\ReturnRequest;
use App\Models\SellerOrder;
use App\Models\SellerProfile;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminDashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $activeOrders = Order::whereNotIn('status', [OrderStatus::Cancelled->value]);
        $gmv = (clone $activeOrders)->selectRaw('COALESCE(SUM(subtotal - discount_total), 0) as total')->value('total');
        $collected = PaymentTransaction::where('type', 'payment')->where('status', 'collected')->sum('amount');
        $refunds = Refund::where('status', 'processed')->sum('amount');
        $commission = SellerOrder::whereNotIn('status', [OrderStatus::Cancelled->value])->sum('commission_amount');
        $sellerPayable = SellerOrder::whereNotIn('status', [OrderStatus::Cancelled->value])->whereNull('settlement_id')->sum('seller_payable');

        $trend = collect(range(13, 0))->map(function ($offset) {
            $date = now()->subDays($offset);
            $row = Order::whereNotIn('status', [OrderStatus::Cancelled->value])
                ->whereBetween('placed_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
                ->selectRaw('COUNT(*) as orders, COALESCE(SUM(grand_total), 0) as revenue')->first();

            return ['date' => $date->toDateString(), 'orders' => (int) $row->orders, 'revenue' => number_format((float) $row->revenue, 2, '.', '')];
        });

        return response()->json([
            'stats' => [
                'orders_total' => (clone $activeOrders)->count(),
                'orders_today' => Order::whereDate('placed_at', today())->count(),
                'orders_pending' => Order::whereIn('status', [OrderStatus::PendingConfirmation->value, OrderStatus::Confirmed->value])->count(),
                'gmv' => number_format((float) $gmv, 2, '.', ''),
                'collected' => number_format((float) $collected, 2, '.', ''),
                'refunds' => number_format((float) $refunds, 2, '.', ''),
                'commission' => number_format((float) $commission, 2, '.', ''),
                'seller_payable' => number_format((float) $sellerPayable, 2, '.', ''),
                'cod_pending' => Order::where('payment_status', 'cod_pending')->whereIn('status', [OrderStatus::Delivered->value, OrderStatus::Completed->value])->count(),
                'customers' => User::whereHas('role', fn ($q) => $q->where('name', 'customer'))->count(),
                'sellers' => SellerProfile::where('status', 'approved')->count(),
                'seller_queue' => SellerProfile::where('status', 'pending')->count(),
                'products_pending' => Product::where('status', 'pending')->count(),
                'returns_pending' => ReturnRequest::whereIn('status', ['requested', 'approved', 'received'])->count(),
                'tickets_open' => SupportTicket::whereIn('status', ['open', 'pending'])->count(),
                'low_stock' => Inventory::whereColumn('quantity', '<=', 'low_stock_threshold')->count(),
            ],
            'sales_trend' => $trend,
            'order_status_counts' => Order::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status'),
            'payment_status_counts' => Order::selectRaw('payment_status, COUNT(*) as total')->groupBy('payment_status')->pluck('total', 'payment_status'),
            'seller_queue' => SellerProfile::where('status', 'pending')->with('user:id,name,email', 'store')->latest()->limit(5)->get(),
            'recent_orders' => Order::with('user:id,name')->latest()->limit(8)->get()->map(fn ($o) => [
                'id' => $o->id, 'order_number' => $o->order_number, 'customer' => $o->user?->name,
                'status' => $o->status->value, 'status_label' => $o->status->label(),
                'payment_status' => $o->payment_status->value, 'grand_total' => $o->grand_total,
                'placed_at' => $o->placed_at?->toIso8601String(),
            ]),
            'low_stock_items' => Inventory::whereColumn('quantity', '<=', 'low_stock_threshold')
                ->with('variant.product.store:id,name')->limit(8)->get()->map(fn ($i) => [
                    'variant_id' => $i->variant_id,
                    'product' => $i->variant->product?->name,
                    'variant' => $i->variant->name,
                    'store' => $i->variant->product?->store?->name,
                    'available' => $i->available,
                ]),
        ]);
    }
}

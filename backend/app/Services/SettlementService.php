<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Commission;
use App\Models\Refund;
use App\Models\SellerOrder;
use App\Models\SellerPayout;
use App\Models\SellerSettlement;
use App\Models\Store;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SettlementService
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
        private readonly WebhookService $webhooks,
    ) {}

    public function create(Store $store, string $start, string $end, User $actor): SellerSettlement
    {
        return DB::transaction(function () use ($store, $start, $end, $actor) {
            $orders = SellerOrder::where('store_id', $store->id)
                ->whereNull('settlement_id')
                ->whereIn('status', [OrderStatus::Delivered->value, OrderStatus::Completed->value])
                ->whereBetween('updated_at', [$start.' 00:00:00', $end.' 23:59:59'])
                ->lockForUpdate()
                ->get();

            if ($orders->isEmpty()) {
                throw ValidationException::withMessages(['period' => 'No unsettled delivered orders were found for this store and period.']);
            }

            $gross = Money::add(...$orders->map(fn ($o) => Money::sub($o->subtotal, $o->discount_total))->all());
            $commission = Money::add(...$orders->map(fn ($o) => $o->commission_amount)->all());
            $orderIds = $orders->pluck('order_id');
            $refundTotal = Money::of(Refund::whereIn('order_id', $orderIds)->where('status', 'processed')->sum('amount'));
            $net = Money::sub(Money::sub($gross, $commission), $refundTotal);

            $settlement = SellerSettlement::create([
                'store_id' => $store->id,
                'period_start' => $start,
                'period_end' => $end,
                'gross_sales' => $gross,
                'commission_total' => $commission,
                'refund_total' => $refundTotal,
                'adjustments' => 0,
                'net_payable' => $net,
                'status' => 'pending',
            ]);

            SellerOrder::whereIn('id', $orders->pluck('id'))->update(['settlement_id' => $settlement->id]);
            Commission::whereIn('seller_order_id', $orders->pluck('id'))->update(['status' => 'settled']);

            $this->notifications->send($store->seller->user_id, 'settlement.created', 'Settlement prepared',
                "A settlement of ৳{$net} was prepared for {$store->name}.",
                '/seller/settlements',
                ['settlement_id' => $settlement->id, 'amount' => '৳'.$net, 'store_name' => $store->name],
                'settlement_created');
            $this->audit->log('settlement.created', $settlement, [], ['store_id' => $store->id, 'net' => $net]);

            return $settlement->load('store', 'orders');
        });
    }

    public function approve(SellerSettlement $settlement, User $actor): SellerSettlement
    {
        if ($settlement->status !== 'pending') {
            throw ValidationException::withMessages(['settlement' => 'Only pending settlements can be approved.']);
        }
        $settlement->update(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now()]);
        $this->audit->log('settlement.approved', $settlement, ['status' => 'pending'], ['status' => 'approved']);

        return $settlement;
    }

    public function pay(SellerSettlement $settlement, User $actor, array $data): SellerPayout
    {
        if (! in_array($settlement->status, ['pending', 'approved'], true)) {
            throw ValidationException::withMessages(['settlement' => 'This settlement is already paid.']);
        }

        $payout = DB::transaction(function () use ($settlement, $actor, $data) {
            $payout = SellerPayout::create([
                'settlement_id' => $settlement->id,
                'store_id' => $settlement->store_id,
                'amount' => $settlement->net_payable,
                'method' => $data['method'] ?? 'bank_transfer',
                'reference' => $data['reference'] ?? null,
                'status' => 'paid',
                'paid_by' => $actor->id,
                'paid_at' => now(),
                'note' => $data['note'] ?? null,
            ]);

            $settlement->update(['status' => 'paid', 'approved_by' => $settlement->approved_by ?? $actor->id, 'approved_at' => $settlement->approved_at ?? now(), 'paid_at' => now()]);

            $this->notifications->send($settlement->store->seller->user_id, 'settlement.paid', 'Settlement paid',
                "Settlement #{$settlement->id} was paid: ৳{$settlement->net_payable}.",
                '/seller/settlements',
                [
                    'settlement_id' => $settlement->id,
                    'amount' => '৳'.$settlement->net_payable,
                    'payment_method' => $payout->method,
                    'store_name' => $settlement->store?->name,
                ],
                'settlement_paid');
            $this->audit->log('settlement.paid', $settlement, [], ['amount' => $settlement->net_payable, 'method' => $payout->method]);

            return $payout->load('settlement', 'store');
        });

        $this->webhooks->dispatch('settlement.paid', [
            'settlement_id' => $settlement->id,
            'store_id' => $settlement->store_id,
            'store_name' => $settlement->store?->name,
            'amount' => $payout->amount,
            'method' => $payout->method,
            'reference' => $payout->reference,
        ]);

        return $payout;
    }
}

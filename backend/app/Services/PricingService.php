<?php

namespace App\Services;

use App\Models\Address;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\ShippingZone;
use App\Support\Money;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PricingService
{
    public function quote(Cart $cart, ?Address $address, ?Coupon $coupon = null, ?string $paymentMethodCode = null): array
    {
        $cart->loadMissing(['items.variant.product.store.seller', 'items.product']);
        $items = $cart->items;

        if ($items->isEmpty()) {
            return $this->emptyQuote($paymentMethodCode);
        }

        $productIds = $items->pluck('product_id')->unique()->values();
        $categoryIds = $items->pluck('product.category_id')->filter()->unique()->values();
        $storeIds = $items->pluck('product.store_id')->filter()->unique()->values();

        $promotions = Promotion::live()
            ->where(function ($q) use ($productIds, $categoryIds, $storeIds) {
                $q->whereIn('product_id', $productIds)
                    ->orWhereIn('category_id', $categoryIds)
                    ->orWhereIn('store_id', $storeIds);
            })->get();

        $promotionPercent = function (Product $product) use ($promotions): string {
            return $promotions
                ->filter(fn (Promotion $p) => (! $p->product_id || $p->product_id === $product->id)
                    && (! $p->category_id || $p->category_id === $product->category_id)
                    && (! $p->store_id || $p->store_id === $product->store_id))
                ->max(fn (Promotion $p) => (float) $p->value) ?? 0;
        };

        $lines = [];
        foreach ($items as $item) {
            $product = $item->product;
            $variant = $item->variant;
            if (! $product || ! $variant || ! $variant->is_active) {
                continue;
            }
            $qty = (int) $item->quantity;
            $unit = Money::of($variant->price);
            $gross = Money::mul($unit, $qty);
            $percent = $promotionPercent($product);
            $promoDiscount = $percent > 0 ? Money::percent($gross, $percent) : '0.00';
            $net = Money::sub($gross, $promoDiscount);

            $lines[] = [
                'cart_item_id' => $item->id,
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'store_id' => $product->store_id,
                'store_name' => $product->store?->name,
                'product_name' => $product->name,
                'variant_name' => $variant->name,
                'sku' => $variant->sku,
                'image_url' => $product->image_url,
                'unit_price' => $unit,
                'compare_at_price' => $variant->compare_at_price ? Money::of($variant->compare_at_price) : null,
                'quantity' => $qty,
                'gross_total' => $gross,
                'promotion_percent' => $percent,
                'promotion_discount' => $promoDiscount,
                'net_total' => $net,
                'coupon_discount' => '0.00',
                'discount_total' => $promoDiscount,
                'line_total' => $net,
                'available_stock' => $variant->available,
                'commission_rate' => Money::of($product->store?->seller?->commission_rate ?? 10),
            ];
        }

        if (empty($lines)) {
            return $this->emptyQuote();
        }

        $grossSubtotal = Money::add(...array_column($lines, 'gross_total'));
        $promotionTotal = Money::add(...array_column($lines, 'promotion_discount'));
        $netSubtotal = Money::sub($grossSubtotal, $promotionTotal);
        $couponDiscount = '0.00';
        $couponInfo = null;
        $couponError = null;

        if ($coupon) {
            try {
                $this->validateCoupon($coupon, $cart, $grossSubtotal);
                $eligibleIndexes = [];
                foreach ($lines as $index => $line) {
                    if ($this->couponApplies($coupon, $line)) {
                        $eligibleIndexes[] = $index;
                    }
                }
                $eligibleNet = Money::add(...array_map(fn ($i) => $lines[$i]['net_total'], $eligibleIndexes));
                $raw = $coupon->type === 'percent'
                    ? Money::percent($eligibleNet, $coupon->value)
                    : Money::of($coupon->value);
                if ($coupon->max_discount !== null && $coupon->type === 'percent') {
                    $raw = Money::min($raw, $coupon->max_discount);
                }
                $couponDiscount = Money::min($raw, $eligibleNet);
                $this->allocateCoupon($lines, $eligibleIndexes, $couponDiscount);
                $couponInfo = [
                    'id' => $coupon->id,
                    'code' => $coupon->code,
                    'description' => $coupon->description,
                    'type' => $coupon->type,
                    'value' => Money::of($coupon->value),
                    'discount' => $couponDiscount,
                ];
            } catch (ValidationException $e) {
                $couponError = $e->validator->errors()->first('coupon');
            }
        }

        $discountTotal = Money::add($promotionTotal, $couponDiscount);
        $taxTotal = '0.00';
        $groups = [];

        foreach ($lines as $line) {
            $sid = $line['store_id'];
            if (! isset($groups[$sid])) {
                $groups[$sid] = [
                    'store_id' => $sid,
                    'store_name' => $line['store_name'],
                    'seller_id' => null,
                    'subtotal' => '0.00',
                    'promotion_discount' => '0.00',
                    'coupon_discount' => '0.00',
                    'discount_total' => '0.00',
                    'shipping_total' => '0.00',
                    'total' => '0.00',
                    'commission_rate' => $line['commission_rate'],
                    'commission_amount' => '0.00',
                    'seller_payable' => '0.00',
                    'free_shipping_threshold' => null,
                    'estimated_days_min' => 2,
                    'estimated_days_max' => 5,
                    'items' => [],
                ];
            }
            $g = &$groups[$sid];
            $g['subtotal'] = Money::add($g['subtotal'], $line['gross_total']);
            $g['promotion_discount'] = Money::add($g['promotion_discount'], $line['promotion_discount']);
            $g['coupon_discount'] = Money::add($g['coupon_discount'], $line['coupon_discount']);
            $g['items'][] = $line;
            unset($g);
        }

        $shippingTotal = '0.00';
        foreach ($groups as $sid => &$group) {
            $group['discount_total'] = Money::add($group['promotion_discount'], $group['coupon_discount']);
            $net = Money::sub($group['subtotal'], $group['discount_total']);
            $zone = $this->resolveShippingZone($address);
            $fee = Money::of($zone->base_fee);
            if ($zone->free_shipping_threshold !== null && bccomp($net, Money::of($zone->free_shipping_threshold), 2) >= 0) {
                $fee = '0.00';
            }
            $group['shipping_total'] = $fee;
            $group['total'] = Money::add(Money::sub($group['subtotal'], $group['discount_total']), $fee);
            $group['commission_amount'] = Money::percent($net, $group['commission_rate']);
            $group['seller_payable'] = Money::sub($net, $group['commission_amount']);
            $group['free_shipping_threshold'] = $zone->free_shipping_threshold ? Money::of($zone->free_shipping_threshold) : null;
            $group['shipping_zone'] = $zone->name;
            $group['estimated_days_min'] = $zone->estimated_days_min;
            $group['estimated_days_max'] = $zone->estimated_days_max;
            $shippingTotal = Money::add($shippingTotal, $fee);
        }
        unset($group);

        $baseGrandTotal = Money::add(Money::sub($grossSubtotal, $discountTotal), $shippingTotal, $taxTotal);

        $paymentMethodCode = $paymentMethodCode ?: 'cod';
        $method = PaymentMethod::where('code', $paymentMethodCode)->first();

        if (! $method) {
            if ($paymentMethodCode !== 'cod') {
                throw ValidationException::withMessages(['payment_method' => 'The selected payment method is not available.']);
            }
            $paymentFee = '0.00';
        } else {
            if (! $method->enabled) {
                throw ValidationException::withMessages(['payment_method' => 'The selected payment method is currently disabled.']);
            }
            if (! $method->acceptsAmount($baseGrandTotal)) {
                throw ValidationException::withMessages([
                    'payment_method' => 'This payment method is not available for the order total of ৳'.Money::of($baseGrandTotal).'.',
                ]);
            }
            $paymentFee = $method->feeFor($baseGrandTotal);
        }

        $grandTotal = Money::add($baseGrandTotal, $paymentFee);

        return [
            'items' => array_values($lines),
            'stores' => array_values($groups),
            'subtotal' => $grossSubtotal,
            'promotion_discount' => $promotionTotal,
            'coupon_discount' => $couponDiscount,
            'discount_total' => $discountTotal,
            'shipping_total' => $shippingTotal,
            'tax_total' => $taxTotal,
            'payment_fee' => $paymentFee,
            'grand_total' => $grandTotal,
            'coupon' => $couponInfo,
            'coupon_error' => $couponError,
            'payment_method' => $paymentMethodCode,
            'payment_method_name' => $method?->name ?? 'Cash on Delivery',
            'shipping_zone' => isset($zone) ? [
                'name' => $zone->name,
                'division' => $zone->division,
                'district' => $zone->district,
                'estimated_days_min' => $zone->estimated_days_min,
                'estimated_days_max' => $zone->estimated_days_max,
            ] : null,
        ];
    }

    public function validateCoupon(Coupon $coupon, Cart $cart, ?string $subtotal = null): void
    {
        $subtotal ??= $cart->subtotal;
        $fail = function (string $message) {
            throw ValidationException::withMessages(['coupon' => $message]);
        };

        if (! $coupon->is_active) {
            $fail('This coupon is not active.');
        }
        if ($coupon->starts_at && $coupon->starts_at->isFuture()) {
            $fail('This coupon is not valid yet.');
        }
        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            $fail('This coupon has expired.');
        }
        if ($coupon->usage_limit !== null && $coupon->used_count >= $coupon->usage_limit) {
            $fail('This coupon has reached its usage limit.');
        }
        if (bccomp(Money::of($subtotal), Money::of($coupon->min_order_amount), 2) < 0) {
            $fail('This coupon requires a minimum order of ৳'.Money::of($coupon->min_order_amount).'.');
        }
        $used = Order::where('user_id', $cart->user_id)
            ->where('coupon_id', $coupon->id)
            ->where('status', '!=', 'cancelled')
            ->count();
        if ($used >= $coupon->per_user_limit) {
            $fail('You have already used this coupon the maximum number of times.');
        }
    }

    private function couponApplies(Coupon $coupon, array $line): bool
    {
        return match ($coupon->applies_to) {
            'product' => (int) $coupon->scope_id === (int) $line['product_id'],
            'category' => $this->categoryInScope((int) $line['product_id'], (int) $coupon->scope_id),
            'store' => (int) $coupon->scope_id === (int) $line['store_id'],
            default => true,
        };
    }

    private function categoryInScope(int $productId, int $categoryId): bool
    {
        $category = Product::with('category')->find($productId)?->category;

        return $category && ($category->id === $categoryId || $category->parent_id === $categoryId);
    }

    private function allocateCoupon(array &$lines, array $indexes, string $discount): void
    {
        if (empty($indexes) || Money::isZero($discount)) {
            return;
        }

        $netCents = [];
        $totalNet = 0;
        foreach ($indexes as $i) {
            $netCents[$i] = (int) round((float) $lines[$i]['net_total'] * 100);
            $totalNet += $netCents[$i];
        }
        if ($totalNet <= 0) {
            return;
        }

        $couponCents = (int) round((float) $discount * 100);
        $allocated = 0;
        $last = end($indexes);
        foreach ($indexes as $i) {
            if ($i === $last) {
                $share = $couponCents - $allocated;
            } else {
                $share = intdiv($couponCents * $netCents[$i], $totalNet);
                $allocated += $share;
            }
            $lines[$i]['coupon_discount'] = Money::of($share / 100);
            $lines[$i]['discount_total'] = Money::add($lines[$i]['promotion_discount'], $lines[$i]['coupon_discount']);
            $lines[$i]['line_total'] = Money::sub($lines[$i]['net_total'], $lines[$i]['coupon_discount']);
        }
    }

    public function resolveShippingZone(?Address $address): ShippingZone
    {
        if (! $address) {
            throw ValidationException::withMessages(['address_id' => 'Select a delivery address before checkout.']);
        }

        $base = ShippingZone::where('is_active', true)->where('division', $address->division);

        $zone = (clone $base)->where('district', $address->district)->first()
            ?? (clone $base)->whereNull('district')->first()
            ?? ShippingZone::where('is_active', true)->where('division', '*')->whereNull('district')->first();

        if (! $zone) {
            throw ValidationException::withMessages([
                'address_id' => 'Delivery is not currently available for '.$address->district.', '.$address->division.'.',
            ]);
        }

        return $zone;
    }

    private function emptyQuote(?string $paymentMethodCode = null): array
    {
        return [
            'items' => [], 'stores' => [], 'subtotal' => '0.00', 'promotion_discount' => '0.00',
            'coupon_discount' => '0.00', 'discount_total' => '0.00', 'shipping_total' => '0.00',
            'tax_total' => '0.00', 'payment_fee' => '0.00', 'grand_total' => '0.00', 'coupon' => null,
            'coupon_error' => null, 'payment_method' => $paymentMethodCode ?: 'cod',
            'payment_method_name' => 'Cash on Delivery', 'shipping_zone' => null,
        ];
    }
}

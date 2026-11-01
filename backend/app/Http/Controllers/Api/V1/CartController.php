<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\ProductVariant;
use App\Services\PricingService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CartController extends Controller
{
    public function __construct(private readonly PricingService $pricing) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->payload($request));
    }

    public function add(Request $request): JsonResponse
    {
        $data = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:20'],
        ]);

        $variant = ProductVariant::with(['product.store.seller', 'inventory'])->findOrFail($data['variant_id']);
        $product = $variant->product;
        if (! $variant->is_active || ! $product || $product->status->value !== 'approved'
            || $product->store?->status !== 'active' || $product->store?->seller?->status !== 'approved') {
            throw ValidationException::withMessages(['variant_id' => 'This item is not available for purchase.']);
        }
        $available = $variant->available;
        if ($available < $data['quantity']) {
            throw ValidationException::withMessages(['quantity' => "Only {$available} unit(s) are available."]);
        }

        $cart = Cart::firstOrCreate(['user_id' => $request->user()->id], ['status' => 'active']);
        $item = $cart->items()->where('variant_id', $variant->id)->first();
        $newQuantity = ($item?->quantity ?? 0) + $data['quantity'];
        if ($newQuantity > 10) {
            throw ValidationException::withMessages(['quantity' => 'You can order at most 10 units of one variant per order.']);
        }
        if ($newQuantity > $available) {
            throw ValidationException::withMessages(['quantity' => "Only {$available} unit(s) are available."]);
        }
        if ($item) {
            $item->update(['quantity' => $newQuantity]);
        } else {
            $cart->items()->create([
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'quantity' => $data['quantity'],
            ]);
        }

        return response()->json(['message' => 'Added to cart.', 'cart' => $this->payload($request)['cart']]);
    }

    public function update(Request $request, int $item): JsonResponse
    {
        $data = $request->validate(['quantity' => ['required', 'integer', 'min:0', 'max:10']]);
        $cart = $request->user()->cart()->firstOrFail();
        $cartItem = $cart->items()->with('variant.inventory')->findOrFail($item);

        if ($data['quantity'] === 0) {
            $cartItem->delete();
        } else {
            if ($data['quantity'] > $cartItem->variant->available) {
                throw ValidationException::withMessages(['quantity' => "Only {$cartItem->variant->available} unit(s) are available."]);
            }
            $cartItem->update(['quantity' => $data['quantity']]);
        }

        return response()->json(['message' => 'Cart updated.', 'cart' => $this->payload($request)['cart']]);
    }

    public function remove(Request $request, int $item): JsonResponse
    {
        $request->user()->cart()->firstOrFail()->items()->findOrFail($item)->delete();

        return response()->json(['message' => 'Item removed.', 'cart' => $this->payload($request)['cart']]);
    }

    public function applyCoupon(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:40']]);
        $cart = $request->user()->cart()->firstOrFail();
        $coupon = Coupon::whereRaw('UPPER(code) = ?', [strtoupper(trim($data['code']))])->first();
        if (! $coupon) {
            throw ValidationException::withMessages(['coupon' => 'This coupon code is not valid.']);
        }
        $this->pricing->validateCoupon($coupon, $cart);
        $cart->update(['coupon_id' => $coupon->id]);

        return response()->json([
            'message' => 'Coupon applied. The exact discount is calculated at checkout.',
            'coupon' => ['code' => $coupon->code, 'description' => $coupon->description],
            'cart' => $this->payload($request)['cart'],
        ]);
    }

    public function removeCoupon(Request $request): JsonResponse
    {
        $request->user()->cart()->firstOrFail()->update(['coupon_id' => null]);

        return response()->json(['message' => 'Coupon removed.', 'cart' => $this->payload($request)['cart']]);
    }

    public function payload(Request $request): array
    {
        $cart = $request->user()->cart()->firstOrCreate([], ['status' => 'active']);
        $cart->load(['items.variant.product.store', 'items.product.images', 'items.product.promotions', 'coupon']);

        $items = $cart->items->filter(fn ($item) => $item->variant?->is_active)->map(function ($item) {
            $product = $item->product;
            $variant = $item->variant;
            $promo = $product->promotions->filter(fn ($p) => $p->is_active && $p->starts_at->isPast() && $p->ends_at->isFuture())->max('value') ?? 0;
            $unit = Money::of($variant->price);
            $effective = $promo > 0 ? Money::sub($unit, Money::percent($unit, $promo)) : $unit;
            $image = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

            return [
                'id' => $item->id,
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'product_name' => $product->name,
                'product_slug' => $product->slug,
                'variant_name' => $variant->name,
                'sku' => $variant->sku,
                'image_url' => $image ? url('/media/'.$image->path) : null,
                'store_name' => $product->store?->name,
                'price' => $effective,
                'original_price' => $unit,
                'quantity' => $item->quantity,
                'line_total' => Money::mul($effective, $item->quantity),
                'available_stock' => $variant->available,
                'max_quantity' => min(10, $variant->available),
            ];
        })->values();

        $subtotal = Money::add(...($items->pluck('line_total')->all() ?: ['0']));

        return [
            'cart' => [
                'items' => $items,
                'item_count' => $items->sum('quantity'),
                'subtotal' => $subtotal,
                'coupon' => $cart->coupon ? [
                    'id' => $cart->coupon->id,
                    'code' => $cart->coupon->code,
                    'description' => $cart->coupon->description,
                    'type' => $cart->coupon->type,
                    'value' => Money::of($cart->coupon->value),
                ] : null,
                'coupon_id' => $cart->coupon_id,
            ],
        ];
    }
}

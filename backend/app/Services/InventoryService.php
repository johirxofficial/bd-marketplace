<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryService
{
    public function reserve(ProductVariant $variant, int $quantity, Order $order): void
    {
        /** @var Inventory $inventory */
        $inventory = Inventory::where('variant_id', $variant->id)->lockForUpdate()->firstOrFail();

        if ($inventory->quantity - $inventory->reserved_quantity < $quantity) {
            throw ValidationException::withMessages([
                'cart' => "Only {$inventory->available} unit(s) of {$variant->product->name} ({$variant->name}) are available.",
            ]);
        }

        $inventory->increment('reserved_quantity', $quantity);

        InventoryMovement::create([
            'variant_id' => $variant->id,
            'type' => 'reservation',
            'quantity' => -$quantity,
            'reference_type' => Order::class,
            'reference_id' => $order->id,
            'note' => 'Reserved for order '.$order->order_number,
        ]);
    }

    public function release(ProductVariant $variant, int $quantity, Order $order, ?User $actor = null): void
    {
        $inventory = Inventory::where('variant_id', $variant->id)->lockForUpdate()->firstOrFail();
        $release = min($quantity, $inventory->reserved_quantity);
        if ($release > 0) {
            $inventory->decrement('reserved_quantity', $release);
        }

        InventoryMovement::create([
            'variant_id' => $variant->id,
            'type' => 'release',
            'quantity' => $release,
            'reference_type' => Order::class,
            'reference_id' => $order->id,
            'note' => 'Reservation released for order '.$order->order_number,
            'created_by' => $actor?->id,
        ]);
    }

    public function commit(ProductVariant $variant, int $quantity, Order $order, ?User $actor = null): void
    {
        $inventory = Inventory::where('variant_id', $variant->id)->lockForUpdate()->firstOrFail();

        if ($inventory->reserved_quantity < $quantity || $inventory->quantity < $quantity) {
            throw ValidationException::withMessages([
                'cart' => 'Inventory reservation is no longer valid for '.$variant->name.'.',
            ]);
        }

        $inventory->decrement('reserved_quantity', $quantity);
        $inventory->decrement('quantity', $quantity);

        InventoryMovement::create([
            'variant_id' => $variant->id,
            'type' => 'sale',
            'quantity' => -$quantity,
            'reference_type' => Order::class,
            'reference_id' => $order->id,
            'note' => 'Committed on shipment of '.$order->order_number,
            'created_by' => $actor?->id,
        ]);
    }

    public function restock(ProductVariant $variant, int $quantity, string $reason, ?int $referenceId = null, ?User $actor = null): void
    {
        $inventory = Inventory::where('variant_id', $variant->id)->lockForUpdate()->firstOrFail();
        $inventory->increment('quantity', $quantity);

        InventoryMovement::create([
            'variant_id' => $variant->id,
            'type' => 'return',
            'quantity' => $quantity,
            'reference_type' => $reason,
            'reference_id' => $referenceId,
            'note' => 'Restocked: '.$reason,
            'created_by' => $actor?->id,
        ]);
    }

    public function adjust(ProductVariant $variant, int $newQuantity, string $note, User $actor): void
    {
        DB::transaction(function () use ($variant, $newQuantity, $note, $actor) {
            $inventory = Inventory::where('variant_id', $variant->id)->lockForUpdate()->firstOrFail();
            $delta = $newQuantity - $inventory->quantity;
            $inventory->update(['quantity' => max(0, $newQuantity)]);

            InventoryMovement::create([
                'variant_id' => $variant->id,
                'type' => 'adjustment',
                'quantity' => $delta,
                'note' => $note,
                'created_by' => $actor->id,
            ]);
        });
    }
}

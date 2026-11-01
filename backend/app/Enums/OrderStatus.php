<?php

namespace App\Enums;

enum OrderStatus: string
{
    case PendingConfirmation = 'pending_confirmation';
    case Confirmed = 'confirmed';
    case Processing = 'processing';
    case ReadyToShip = 'ready_to_ship';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Completed = 'completed';
    case CancellationRequested = 'cancellation_requested';
    case Cancelled = 'cancelled';
    case ReturnRequested = 'return_requested';
    case Returned = 'returned';

    public function label(): string
    {
        return match ($this) {
            self::PendingConfirmation => 'Pending confirmation',
            self::Confirmed => 'Confirmed',
            self::Processing => 'Processing',
            self::ReadyToShip => 'Ready to ship',
            self::Shipped => 'Shipped',
            self::Delivered => 'Delivered',
            self::Completed => 'Completed',
            self::CancellationRequested => 'Cancellation requested',
            self::Cancelled => 'Cancelled',
            self::ReturnRequested => 'Return requested',
            self::Returned => 'Returned',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::PendingConfirmation, self::CancellationRequested, self::ReturnRequested => 'amber',
            self::Confirmed, self::Processing, self::ReadyToShip => 'blue',
            self::Shipped => 'indigo',
            self::Delivered, self::Completed, self::Returned => 'green',
            self::Cancelled => 'red',
        };
    }

    public static function labels(): array
    {
        return collect(self::cases())->mapWithKeys(fn (self $s) => [$s->value => $s->label()])->all();
    }
}

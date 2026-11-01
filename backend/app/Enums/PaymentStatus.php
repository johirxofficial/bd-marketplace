<?php

namespace App\Enums;

enum PaymentStatus: string
{
    case Unpaid = 'unpaid';
    case AwaitingVerification = 'awaiting_verification';
    case CodPending = 'cod_pending';
    case Paid = 'paid';
    case Failed = 'failed';
    case Refunded = 'refunded';
    case PartiallyRefunded = 'partially_refunded';

    public function label(): string
    {
        return match ($this) {
            self::Unpaid => 'Payment pending',
            self::AwaitingVerification => 'Awaiting verification',
            self::CodPending => 'COD collection pending',
            self::Paid => 'Paid',
            self::Failed => 'Failed',
            self::Refunded => 'Refunded',
            self::PartiallyRefunded => 'Partially refunded',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Paid => 'green',
            self::CodPending, self::Unpaid, self::AwaitingVerification => 'amber',
            self::Failed => 'red',
            self::Refunded, self::PartiallyRefunded => 'blue',
        };
    }
}

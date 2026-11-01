<?php

namespace App\Enums;

enum ReturnStatus: string
{
    case Requested = 'requested';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Received = 'received';
    case Refunded = 'refunded';
    case Completed = 'completed';

    public function label(): string
    {
        return ucfirst($this->value);
    }

    public function tone(): string
    {
        return match ($this) {
            self::Requested => 'amber',
            self::Approved, self::Received => 'blue',
            self::Refunded, self::Completed => 'green',
            self::Rejected => 'red',
        };
    }
}

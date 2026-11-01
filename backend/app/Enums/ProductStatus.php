<?php

namespace App\Enums;

enum ProductStatus: string
{
    case Draft = 'draft';
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Archived = 'archived';

    public function label(): string
    {
        return ucfirst($this->value);
    }

    public function tone(): string
    {
        return match ($this) {
            self::Approved => 'green',
            self::Pending, self::Draft => 'amber',
            self::Rejected => 'red',
            self::Archived => 'slate',
        };
    }
}

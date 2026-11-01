<?php

namespace App\Support;

/**
 * Decimal money helpers backed by BCMath. All values are treated as BDT
 * with two decimal places; intermediate multiplication uses four places.
 */
final class Money
{
    public const SCALE = 2;

    public static function of(string|int|float|null $value): string
    {
        return number_format((float) ($value ?? 0), self::SCALE, '.', '');
    }

    public static function add(string|int|float ...$values): string
    {
        $total = '0';
        foreach ($values as $value) {
            $total = bcadd($total, self::of($value), 4);
        }

        return self::round($total);
    }

    public static function sub(string|int|float $a, string|int|float ...$values): string
    {
        $total = self::of($a);
        foreach ($values as $value) {
            $total = bcsub($total, self::of($value), 4);
        }

        return self::round($total);
    }

    public static function mul(string|int|float $amount, string|int|float $quantity): string
    {
        return self::round(bcmul(self::of($amount), (string) $quantity, 4));
    }

    public static function percent(string|int|float $amount, string|int|float $percent): string
    {
        return self::round(bcdiv(bcmul(self::of($amount), self::of($percent), 6), '100', 4));
    }

    public static function min(string|int|float $a, string|int|float $b): string
    {
        return bccomp(self::of($a), self::of($b), 2) <= 0 ? self::of($a) : self::of($b);
    }

    public static function max(string|int|float $a, string|int|float $b): string
    {
        return bccomp(self::of($a), self::of($b), 2) >= 0 ? self::of($a) : self::of($b);
    }

    public static function isZero(string|int|float $value): bool
    {
        return bccomp(self::of($value), '0', 2) === 0;
    }

    public static function round(string|int|float $value, int $scale = self::SCALE): string
    {
        return number_format(round((float) $value, $scale, PHP_ROUND_HALF_UP), $scale, '.', '');
    }
}

<?php

namespace Tests\Unit;

use App\Support\Money;
use PHPUnit\Framework\TestCase;

class MoneyTest extends TestCase
{
    public function test_it_normalises_values_to_two_decimal_places(): void
    {
        $this->assertSame('0.00', Money::of(null));
        $this->assertSame('1250.50', Money::of('1250.5'));
        $this->assertSame('99.99', Money::of(99.99));
    }

    public function test_addition_and_subtraction_are_exact(): void
    {
        $this->assertSame('0.30', Money::add('0.10', '0.20'));
        $this->assertSame('1000.00', Money::sub('1200.00', '100.00', '100.00'));
        $this->assertSame('-10.00', Money::sub('90.00', '100.00'));
    }

    public function test_multiplication_rounds_half_up(): void
    {
        $this->assertSame('1999.98', Money::mul('999.99', 2));
        $this->assertSame('0.01', Money::mul('0.005', 1));
    }

    public function test_percentage_discount(): void
    {
        $this->assertSame('200.00', Money::percent('2000.00', 10));
        $this->assertSame('0.00', Money::percent('1000.00', 0));
        $this->assertSame('1000.00', Money::percent('1000.00', 100));
    }

    public function test_min_max_and_zero_helpers(): void
    {
        $this->assertSame('100.00', Money::min('100.00', '250.00'));
        $this->assertSame('250.00', Money::max('100.00', '250.00'));
        $this->assertTrue(Money::isZero('0.00'));
        $this->assertFalse(Money::isZero('0.01'));
    }

    public function test_no_floating_point_drift_across_many_additions(): void
    {
        $total = '0.00';
        for ($i = 0; $i < 100; $i++) {
            $total = Money::add($total, '0.10');
        }

        $this->assertSame('10.00', $total);
    }
}

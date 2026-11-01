<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receipts', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_number', 40)->unique();
            $table->string('public_token', 64)->unique();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payment_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 20)->default('order'); // order, payment, refund
            $table->string('status', 20)->default('issued'); // issued, void
            $table->decimal('amount', 12, 2)->default(0);
            $table->char('currency', 3)->default('BDT');
            $table->json('meta')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'type']);
            $table->index(['user_id', 'issued_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipts');
    }
};

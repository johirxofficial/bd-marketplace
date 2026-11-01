<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 100);
            $table->string('provider', 40)->default('custom');
            $table->string('type', 20)->default('cod'); // cod, mfs, qr, hosted
            $table->string('mode', 20)->default('manual'); // manual, sandbox, live
            $table->text('description')->nullable();
            $table->text('instructions')->nullable();
            $table->string('logo_path')->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->decimal('fee_amount', 12, 2)->default(0);
            $table->decimal('fee_percent', 5, 2)->default(0);
            $table->decimal('min_amount', 12, 2)->nullable();
            $table->decimal('max_amount', 12, 2)->nullable();
            $table->text('config')->nullable(); // encrypted JSON
            $table->timestamps();
            $table->index(['enabled', 'sort_order']);
        });

        Schema::create('sms_gateways', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('driver', 40);
            $table->string('sender_id', 60)->nullable();
            $table->boolean('enabled')->default(false);
            $table->boolean('is_default')->default(false);
            $table->text('config')->nullable(); // encrypted JSON
            $table->timestamps();
            $table->index(['enabled', 'is_default']);
        });

        Schema::create('sms_templates', function (Blueprint $table) {
            $table->id();
            $table->string('event', 60)->unique();
            $table->string('name', 120);
            $table->text('body');
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        Schema::create('sms_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sms_gateway_id')->nullable()->constrained('sms_gateways')->nullOnDelete();
            $table->string('to', 30);
            $table->text('body');
            $table->string('event', 60)->nullable();
            $table->string('status', 20)->default('queued'); // queued, sent, failed
            $table->string('provider_ref')->nullable();
            $table->text('error')->nullable();
            $table->nullableMorphs('messageable');
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index('event');
        });

        Schema::create('plugins', function (Blueprint $table) {
            $table->id();
            $table->string('plugin_id', 100)->unique();
            $table->string('name', 150);
            $table->string('version', 30)->default('1.0.0');
            $table->text('description')->nullable();
            $table->string('author')->nullable();
            $table->string('class');
            $table->boolean('enabled')->default(false);
            $table->text('config')->nullable(); // encrypted JSON
            $table->timestamp('discovered_at')->nullable();
            $table->timestamps();
        });

        Schema::create('webhooks', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('url', 500);
            $table->text('secret'); // encrypted
            $table->json('events');
            $table->boolean('active')->default(true);
            $table->timestamp('last_triggered_at')->nullable();
            $table->timestamps();
        });

        Schema::create('webhook_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('webhook_id')->constrained()->cascadeOnDelete();
            $table->string('event', 80);
            $table->json('payload');
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->text('response_body')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
            $table->index(['event', 'created_at']);
            $table->index(['webhook_id', 'created_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('payment_fee', 12, 2)->default(0);
            $table->timestamp('paid_at')->nullable();
        });

        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->string('method_code', 40)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->index('method_code');
        });
    }

    public function down(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->dropIndex(['method_code']);
            $table->dropColumn(['method_code', 'submitted_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['payment_fee', 'paid_at']);
        });

        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhooks');
        Schema::dropIfExists('plugins');
        Schema::dropIfExists('sms_messages');
        Schema::dropIfExists('sms_templates');
        Schema::dropIfExists('sms_gateways');
        Schema::dropIfExists('payment_methods');
    }
};

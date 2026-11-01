<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mail_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('enabled')->default(true);
            $table->string('driver', 20)->default('log'); // log, smtp
            $table->string('host', 190)->nullable();
            $table->unsignedSmallInteger('port')->nullable();
            $table->string('encryption', 20)->nullable(); // tls, ssl, none
            $table->string('username', 190)->nullable();
            $table->text('password')->nullable(); // encrypted
            $table->string('from_address', 190);
            $table->string('from_name', 190);
            $table->string('reply_to', 190)->nullable();
            $table->text('footer_note')->nullable();
            $table->timestamps();
        });

        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('event', 80)->unique();
            $table->string('name', 150);
            $table->string('subject', 255);
            $table->longText('body');
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        Schema::create('email_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('subject', 255);
            $table->longText('body');
            $table->string('audience', 40)->default('custom'); // all, customers, sellers, staff, subscribers, custom
            $table->string('status', 20)->default('queued'); // queued, sending, sent, failed
            $table->unsignedInteger('recipients_count')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('email_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('campaign_id')->nullable()->constrained('email_campaigns')->nullOnDelete();
            $table->string('to_email', 190);
            $table->string('to_name', 190)->nullable();
            $table->string('subject', 255);
            $table->longText('body');
            $table->string('event', 80)->nullable();
            $table->string('status', 20)->default('queued'); // queued, sent, failed
            $table->string('provider_ref', 190)->nullable();
            $table->text('error')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->nullableMorphs('messageable');
            $table->json('metadata')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index('event');
            $table->index('to_email');
        });

        Schema::create('newsletter_subscribers', function (Blueprint $table) {
            $table->id();
            $table->string('email', 190)->unique();
            $table->string('name', 190)->nullable();
            $table->string('token', 64)->unique();
            $table->string('status', 20)->default('subscribed'); // subscribed, unsubscribed
            $table->string('source', 40)->default('storefront');
            $table->timestamp('subscribed_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_subscribers');
        Schema::dropIfExists('email_messages');
        Schema::dropIfExists('email_campaigns');
        Schema::dropIfExists('email_templates');
        Schema::dropIfExists('mail_settings');
    }
};

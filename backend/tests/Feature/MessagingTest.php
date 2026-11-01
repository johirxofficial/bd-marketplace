<?php

namespace Tests\Feature;

use App\Models\Message;
use App\Services\MessagingService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class MessagingTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_customer_and_seller_can_exchange_direct_messages_and_unread_counts_update(): void
    {
        $customer = $this->makeUser('customer');
        $seller = $this->makeSeller()['user'];

        $start = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $seller->id])
            ->assertCreated()
            ->assertJsonPath('conversation.other_user.id', $seller->id)
            ->assertJsonPath('conversation.other_user.role', 'seller');

        $conversationId = $start->json('conversation.id');

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversationId}/messages", ['body' => 'Hello, is this item in stock?'])
            ->assertCreated()
            ->assertJsonPath('data.mine', true);

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversationId,
            'sender_id' => $customer->id,
            'body' => 'Hello, is this item in stock?',
        ]);

        // The seller now has one unread conversation.
        $this->actingAs($seller, 'sanctum')
            ->getJson('/api/v1/messages/conversations')
            ->assertOk()
            ->assertJsonPath('conversations.0.unread_count', 1)
            ->assertJsonPath('conversations.0.other_user.id', $customer->id);

        $this->actingAs($seller, 'sanctum')
            ->getJson('/api/v1/messages/unread')
            ->assertOk()
            ->assertJsonPath('unread_conversations', 1)
            ->assertJsonPath('unread_messages', 1);

        // Opening the conversation returns the thread and marks it read.
        $thread = $this->actingAs($seller, 'sanctum')
            ->getJson("/api/v1/messages/conversations/{$conversationId}")
            ->assertOk()
            ->assertJsonPath('messages.0.body', 'Hello, is this item in stock?')
            ->assertJsonPath('messages.0.mine', false);

        $this->assertSame(1, count($thread->json('messages')));

        $this->actingAs($seller, 'sanctum')
            ->getJson('/api/v1/messages/unread')
            ->assertJsonPath('unread_conversations', 0)
            ->assertJsonPath('unread_messages', 0);

        // The seller replies and the customer sees the unread badge.
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversationId}/messages", ['body' => 'Yes, it is available.'])
            ->assertCreated();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/messages/unread')
            ->assertJsonPath('unread_conversations', 1)
            ->assertJsonPath('unread_messages', 1);

        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/messages/conversations/{$conversationId}")
            ->assertOk()
            ->assertJsonPath('messages.1.body', 'Yes, it is available.');
    }

    public function test_starting_a_conversation_twice_reuses_the_same_thread(): void
    {
        $customer = $this->makeUser('customer');
        $seller = $this->makeSeller()['user'];

        $first = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $seller->id])
            ->assertCreated();

        $second = $this->actingAs($seller, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $customer->id])
            ->assertCreated();

        $this->assertSame($first->json('conversation.id'), $second->json('conversation.id'));
        $this->assertDatabaseCount('conversations', 1);
    }

    public function test_users_outside_a_conversation_cannot_read_or_write_to_it(): void
    {
        $seller = $this->makeSeller()['user'];
        $admin = $this->makeUser('admin');
        $stranger = $this->makeUser('customer');

        $conversation = app(MessagingService::class)->findOrCreateDirect($admin, $seller);

        $this->actingAs($stranger, 'sanctum')
            ->getJson("/api/v1/messages/conversations/{$conversation->id}")
            ->assertForbidden();

        $this->actingAs($stranger, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversation->id}/messages", ['body' => 'Let me in'])
            ->assertForbidden();

        $this->assertSame(0, Message::where('conversation_id', $conversation->id)->count());
    }

    public function test_users_can_be_searched_by_name_email_or_phone(): void
    {
        $customer = $this->makeUser('customer');
        $seller = $this->makeSeller(['name' => 'Nadia Seller'])['user'];

        $byEmail = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/messages/users?search='.urlencode($seller->email))
            ->assertOk();

        $this->assertSame([$seller->id], collect($byEmail->json('users'))->pluck('id')->all());

        $byName = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/messages/users?search=Nadia')
            ->assertOk();

        $this->assertTrue(collect($byName->json('users'))->pluck('id')->contains($seller->id));

        // The signed-in user is never returned, and very short terms are ignored.
        $all = collect($byName->json('users'))->pluck('id');
        $this->assertFalse($all->contains($customer->id));

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/messages/users?search=a')
            ->assertOk()
            ->assertJsonCount(0, 'users');
    }

    public function test_suspended_accounts_do_not_appear_in_search_results(): void
    {
        $customer = $this->makeUser('customer');
        $suspended = $this->makeUser('customer', ['name' => 'Suspended Person', 'status' => 'suspended']);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/messages/users?search=Suspended')
            ->assertOk()
            ->assertJsonCount(0, 'users');

        $this->assertSame('suspended', $suspended->fresh()->status);
    }

    public function test_empty_and_oversized_messages_are_rejected(): void
    {
        $customer = $this->makeUser('customer');
        $seller = $this->makeSeller()['user'];

        $conversationId = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $seller->id])
            ->json('conversation.id');

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversationId}/messages", ['body' => ''])
            ->assertStatus(422);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversationId}/messages", ['body' => str_repeat('a', 2001)])
            ->assertStatus(422);

        // Whitespace-only messages pass the length rule but are trimmed away.
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/messages/conversations/{$conversationId}/messages", ['body' => '    '])
            ->assertStatus(422);
    }

    public function test_a_user_cannot_start_a_conversation_with_themselves(): void
    {
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $customer->id])
            ->assertStatus(422);
    }

    public function test_starting_a_conversation_with_a_suspended_account_is_rejected(): void
    {
        $customer = $this->makeUser('customer');
        $suspended = $this->makeUser('customer', ['status' => 'suspended']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/messages/conversations', ['user_id' => $suspended->id])
            ->assertStatus(422);
    }
}

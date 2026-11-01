<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MessagingService
{
    /**
     * Find an existing one-to-one conversation between two users or create one.
     * Group conversations are not exposed yet, so a direct conversation must
     * have exactly two participants.
     */
    public function findOrCreateDirect(User $me, User $other): Conversation
    {
        if ($me->id === $other->id) {
            throw ValidationException::withMessages(['user_id' => 'You cannot start a conversation with yourself.']);
        }

        $existing = Conversation::query()
            ->whereHas('participants', fn ($q) => $q->where('user_id', $me->id))
            ->whereHas('participants', fn ($q) => $q->where('user_id', $other->id))
            ->withCount('participants')
            ->get()
            ->first(fn (Conversation $conversation) => $conversation->participants_count === 2);

        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($me, $other) {
            $conversation = Conversation::create(['created_by' => $me->id]);

            $conversation->participants()->createMany([
                ['user_id' => $me->id, 'last_read_at' => now()],
                ['user_id' => $other->id],
            ]);

            return $conversation;
        });
    }

    public function send(Conversation $conversation, User $sender, string $body): Message
    {
        return DB::transaction(function () use ($conversation, $sender, $body) {
            $message = $conversation->messages()->create([
                'sender_id' => $sender->id,
                'body' => $body,
            ]);

            $conversation->forceFill(['last_message_at' => $message->created_at])->save();

            $conversation->participants()
                ->where('user_id', $sender->id)
                ->update(['last_read_at' => now(), 'last_read_message_id' => $message->id]);

            return $message;
        });
    }

    public function markRead(Conversation $conversation, User $user): void
    {
        $conversation->participants()
            ->where('user_id', $user->id)
            ->update([
                'last_read_at' => now(),
                'last_read_message_id' => $conversation->messages()->max('id'),
            ]);
    }

    public function isParticipant(Conversation $conversation, User $user): bool
    {
        return $conversation->participants()->where('user_id', $user->id)->exists();
    }

    /**
     * Number of messages in this conversation the user has not read yet.
     */
    public function conversationUnreadCount(Conversation $conversation, User $user): int
    {
        $participant = $conversation->participants->firstWhere('user_id', $user->id)
            ?? $conversation->participants()->where('user_id', $user->id)->first();

        if (! $participant) {
            return 0;
        }

        return $conversation->messages()
            ->where('sender_id', '!=', $user->id)
            ->when($participant->last_read_message_id, fn ($query, $lastId) => $query->where('id', '>', $lastId))
            ->count();
    }

    /**
     * Badge counts used by the storefront header and the messages page.
     *
     * @return array{unread_conversations: int, unread_messages: int}
     */
    public function unreadTotals(User $user): array
    {
        $participants = ConversationParticipant::where('user_id', $user->id)
            ->get(['conversation_id', 'last_read_message_id']);

        $conversations = 0;
        $messages = 0;

        foreach ($participants as $participant) {
            $count = Message::where('conversation_id', $participant->conversation_id)
                ->where('sender_id', '!=', $user->id)
                ->when($participant->last_read_message_id, fn ($query, $lastId) => $query->where('id', '>', $lastId))
                ->count();

            if ($count > 0) {
                $conversations++;
                $messages += $count;
            }
        }

        return [
            'unread_conversations' => $conversations,
            'unread_messages' => $messages,
        ];
    }
}

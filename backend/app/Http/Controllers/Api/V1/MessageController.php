<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    public function __construct(private readonly MessagingService $messaging) {}

    /**
     * Conversation list for the signed-in user, newest activity first.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $conversations = Conversation::forUser($user->id)
            ->with(['participants.user.role', 'lastMessage.sender:id,name'])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'conversations' => $conversations->map(fn (Conversation $conversation) => $this->summary($conversation, $user))->values(),
        ]);
    }

    /**
     * Search active users by name, email, or phone to start a conversation.
     */
    public function users(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('search', ''));

        if (mb_strlen($term) < 2) {
            return response()->json(['users' => [], 'query' => $term]);
        }

        $like = '%'.$term.'%';

        $users = User::with('role:id,name,label')
            ->where('status', 'active')
            ->whereKeyNot($request->user()->id)
            ->where(fn ($query) => $query
                ->where('name', 'like', $like)
                ->orWhere('email', 'like', $like)
                ->orWhere('phone', 'like', $like))
            ->orderBy('name')
            ->limit(12)
            ->get()
            ->map(fn (User $user) => $this->userSummary($user))
            ->values();

        return response()->json(['users' => $users, 'query' => $term]);
    }

    /**
     * Start (or reopen) a direct conversation with another user.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $other = User::with('role:id,name,label')->findOrFail($data['user_id']);

        if ($other->status !== 'active') {
            return response()->json(['message' => 'This account is not available for messaging.'], 422);
        }

        $conversation = $this->messaging->findOrCreateDirect($request->user(), $other);
        $conversation->load(['participants.user.role', 'lastMessage.sender:id,name']);

        return response()->json([
            'message' => 'Conversation ready.',
            'conversation' => $this->summary($conversation, $request->user()),
        ], 201);
    }

    /**
     * Read a conversation and mark it as read for the current user.
     */
    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        $this->authorizeParticipant($conversation, $user);

        $this->messaging->markRead($conversation, $user);

        $conversation->load(['participants.user.role', 'lastMessage.sender:id,name']);
        $messages = $conversation->messages()
            ->with('sender:id,name')
            ->latest('id')
            ->limit(100)
            ->get()
            ->reverse()
            ->values();

        return response()->json([
            'conversation' => $this->summary($conversation->fresh(['participants.user.role', 'lastMessage.sender:id,name']), $user),
            'messages' => $messages->map(fn (Message $message) => $this->messagePayload($message, $user))->values(),
        ]);
    }

    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        $this->authorizeParticipant($conversation, $user);

        $data = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:2000'],
        ]);

        $body = trim($data['body']);

        if ($body === '') {
            return response()->json([
                'message' => 'Write a message before sending.',
                'errors' => ['body' => ['Write a message before sending.']],
            ], 422);
        }

        $message = $this->messaging->send($conversation, $user, $body);

        return response()->json([
            'message' => 'Message sent.',
            'data' => $this->messagePayload($message->load('sender:id,name'), $user),
        ], 201);
    }

    public function read(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        $this->authorizeParticipant($conversation, $user);
        $this->messaging->markRead($conversation, $user);

        return response()->json([
            'message' => 'Conversation marked as read.',
            'unread' => $this->messaging->unreadTotals($user),
        ]);
    }

    public function unread(Request $request): JsonResponse
    {
        return response()->json($this->messaging->unreadTotals($request->user()));
    }

    private function authorizeParticipant(Conversation $conversation, User $user): void
    {
        abort_unless($this->messaging->isParticipant($conversation, $user), 403, 'You are not part of this conversation.');
    }

    private function summary(Conversation $conversation, User $me): array
    {
        $other = $conversation->participants
            ->first(fn ($participant) => $participant->user_id !== $me->id)
            ?->user;

        return [
            'id' => $conversation->id,
            'other_user' => $other ? $this->userSummary($other) : null,
            'participants' => $conversation->participants
                ->map(fn ($participant) => $participant->user ? $this->userSummary($participant->user) : null)
                ->filter()
                ->values(),
            'last_message' => $conversation->lastMessage
                ? $this->messagePayload($conversation->lastMessage, $me)
                : null,
            'last_message_at' => $conversation->last_message_at?->toIso8601String(),
            'unread_count' => $this->messaging->conversationUnreadCount($conversation, $me),
        ];
    }

    private function messagePayload(Message $message, User $me): array
    {
        return [
            'id' => $message->id,
            'body' => $message->body,
            'sender_id' => $message->sender_id,
            'sender_name' => $message->sender?->name ?? 'Deleted user',
            'mine' => $message->sender_id === $me->id,
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    private function userSummary(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role?->name,
            'role_label' => $user->role?->label,
            'avatar_url' => $user->avatar_url,
        ];
    }
}

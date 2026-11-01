<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SupportTicketRequest;
use App\Models\SupportTicket;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SupportTicketController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tickets = $request->user()->hasMany(SupportTicket::class)
            ->withCount('messages')->latest()->paginate(15);

        return response()->json(['tickets' => $tickets->through(fn ($t) => $this->summary($t))]);
    }

    public function store(SupportTicketRequest $request): JsonResponse
    {
        $ticket = SupportTicket::create([
            'ticket_number' => 'TKT-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
            'user_id' => $request->user()->id,
            'order_id' => $request->input('order_id'),
            'subject' => $request->string('subject')->value(),
            'category' => $request->string('category')->value(),
            'priority' => $request->string('priority')->value() ?: 'normal',
            'status' => 'open',
            'last_reply_at' => now(),
        ]);
        $ticket->messages()->create([
            'user_id' => $request->user()->id,
            'message' => $request->string('message')->value(),
            'is_staff' => false,
        ]);
        $this->audit->log('support.ticket_created', $ticket, [], ['subject' => $ticket->subject]);

        $this->notifications->send(
            $request->user(),
            'support.created',
            'Support ticket received',
            "We received your support ticket {$ticket->ticket_number}.",
            '/account/support',
            [
                'ticket_number' => $ticket->ticket_number,
                'message' => $ticket->subject,
            ],
            'support_created',
        );

        return response()->json([
            'message' => 'Support ticket created.',
            'ticket' => ['id' => $ticket->id, 'ticket_number' => $ticket->ticket_number, 'status' => $ticket->status],
        ], 201);
    }

    public function show(Request $request, SupportTicket $ticket): JsonResponse
    {
        abort_unless($ticket->user_id === $request->user()->id, 403, 'You do not own this ticket.');
        $ticket->load(['messages.user:id,name', 'order:id,order_number']);

        return response()->json(['ticket' => array_merge($this->summary($ticket), [
            'messages' => $ticket->messages->map(fn ($m) => [
                'id' => $m->id, 'message' => $m->message, 'is_staff' => $m->is_staff,
                'author' => $m->user?->name ?? 'Support', 'created_at' => $m->created_at?->toIso8601String(),
                'attachment_url' => $m->attachment_path ? url('/media/'.$m->attachment_path) : null,
            ]),
        ])]);
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        abort_unless($ticket->user_id === $request->user()->id, 403);
        $data = $request->validate(['message' => ['required', 'string', 'min:2', 'max:5000']]);
        $ticket->messages()->create(['user_id' => $request->user()->id, 'message' => $data['message'], 'is_staff' => false]);
        $ticket->update(['status' => $ticket->status === 'resolved' ? 'open' : $ticket->status, 'last_reply_at' => now()]);

        return response()->json(['message' => 'Reply sent.']);
    }

    private function summary(SupportTicket $ticket): array
    {
        return [
            'id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
            'category' => $ticket->category,
            'priority' => $ticket->priority,
            'status' => $ticket->status,
            'messages_count' => $ticket->messages_count ?? $ticket->messages()->count(),
            'last_reply_at' => $ticket->last_reply_at?->toIso8601String(),
            'created_at' => $ticket->created_at?->toIso8601String(),
        ];
    }
}

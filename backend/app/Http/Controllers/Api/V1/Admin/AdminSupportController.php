<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminSupportController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tickets = SupportTicket::with(['user:id,name,email', 'assignee:id,name', 'order:id,order_number'])
            ->withCount('messages')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('ticket_number', 'like', '%'.$request->string('search').'%')->orWhere('subject', 'like', '%'.$request->string('search').'%')))
            ->latest()->paginate(20);

        return response()->json(['tickets' => $tickets->through(fn ($t) => [
            'id' => $t->id, 'ticket_number' => $t->ticket_number, 'subject' => $t->subject,
            'category' => $t->category, 'priority' => $t->priority, 'status' => $t->status,
            'messages_count' => $t->messages_count, 'customer' => $t->user?->only(['id', 'name', 'email']),
            'assignee' => $t->assignee?->name, 'order_number' => $t->order?->order_number,
            'last_reply_at' => $t->last_reply_at?->toIso8601String(), 'created_at' => $t->created_at?->toIso8601String(),
        ])]);
    }

    public function show(SupportTicket $ticket): JsonResponse
    {
        $ticket->load(['messages.user:id,name,role_id', 'user:id,name,email', 'order:id,order_number', 'assignee:id,name']);

        return response()->json(['ticket' => [
            'id' => $ticket->id, 'ticket_number' => $ticket->ticket_number, 'subject' => $ticket->subject,
            'category' => $ticket->category, 'priority' => $ticket->priority, 'status' => $ticket->status,
            'customer' => $ticket->user?->only(['id', 'name', 'email']), 'order_number' => $ticket->order?->order_number,
            'assignee' => $ticket->assignee?->name,
            'messages' => $ticket->messages->map(fn ($m) => [
                'id' => $m->id, 'message' => $m->message, 'is_staff' => $m->is_staff,
                'author' => $m->user?->name ?? 'System', 'created_at' => $m->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        $data = $request->validate(['message' => ['required', 'string', 'min:2', 'max:5000']]);
        $ticket->messages()->create([
            'user_id' => $request->user()->id,
            'message' => $data['message'],
            'is_staff' => true,
        ]);
        $ticket->update(['status' => 'pending', 'assigned_to' => $ticket->assigned_to ?? $request->user()->id, 'last_reply_at' => now()]);
        $this->notifications->send($ticket->user_id, 'support.reply', 'Support replied to your ticket',
            "Ticket {$ticket->ticket_number}: {$ticket->subject}", '/account/support',
            ['ticket_number' => $ticket->ticket_number, 'message' => $data['message']], 'support_reply');
        $this->audit->log('support.replied', $ticket, [], ['message' => $data['message']]);

        return response()->json(['message' => 'Reply sent.']);
    }

    public function update(Request $request, SupportTicket $ticket): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['open', 'pending', 'resolved', 'closed'])],
            'priority' => ['sometimes', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'assigned_to' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);
        $ticket->update($data);
        $this->audit->log('support.ticket_updated', $ticket, [], $data);

        return response()->json(['message' => 'Ticket updated.', 'ticket' => $ticket->fresh()]);
    }
}

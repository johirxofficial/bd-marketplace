<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()->marketplaceNotifications()->latest()->paginate(20);

        return response()->json([
            'notifications' => $notifications->through(fn ($n) => [
                'id' => $n->id, 'type' => $n->type, 'title' => $n->title, 'message' => $n->message,
                'action_url' => $n->action_url, 'read_at' => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]),
            'unread_count' => $request->user()->marketplaceNotifications()->whereNull('read_at')->count(),
        ]);
    }

    public function markRead(Request $request, int $notification): JsonResponse
    {
        $item = $request->user()->marketplaceNotifications()->findOrFail($notification);
        $item->update(['read_at' => now()]);

        return response()->json(['message' => 'Notification marked as read.']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->marketplaceNotifications()->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read.']);
    }
}

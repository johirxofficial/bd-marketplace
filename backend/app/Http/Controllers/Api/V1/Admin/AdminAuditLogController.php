<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminAuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $logs = AuditLog::with('user:id,name,email')
            ->when($request->filled('action'), fn ($q) => $q->where('action', 'like', '%'.$request->string('action').'%'))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->date('to')))
            ->latest()->paginate(30);

        return response()->json(['logs' => $logs->through(fn ($l) => [
            'id' => $l->id, 'action' => $l->action, 'user' => $l->user?->only(['id', 'name', 'email']),
            'auditable_type' => $l->auditable_type ? class_basename($l->auditable_type) : null,
            'auditable_id' => $l->auditable_id, 'old_values' => $l->old_values, 'new_values' => $l->new_values,
            'ip_address' => $l->ip_address, 'created_at' => $l->created_at?->toIso8601String(),
        ])]);
    }
}

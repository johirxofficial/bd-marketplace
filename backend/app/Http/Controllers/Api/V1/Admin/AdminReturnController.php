<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ReturnStatus;
use App\Http\Controllers\Controller;
use App\Models\Refund;
use App\Models\ReturnRequest;
use App\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returns) {}

    public function index(Request $request): JsonResponse
    {
        $returns = ReturnRequest::with(['order:id,order_number,status', 'orderItem:id,product_name,variant_name', 'user:id,name,email', 'sellerOrder.store:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest()->paginate(15);

        return response()->json(['returns' => $returns->through(fn ($r) => [
            'id' => $r->id, 'return_number' => $r->return_number, 'status' => $r->status->value,
            'status_label' => $r->status->label(), 'status_tone' => $r->status->tone(),
            'order_number' => $r->order?->order_number, 'product_name' => $r->orderItem?->product_name,
            'variant_name' => $r->orderItem?->variant_name, 'quantity' => $r->quantity,
            'reason' => $r->reason, 'description' => $r->description, 'refund_amount' => $r->refund_amount,
            'customer' => $r->user?->name, 'store' => $r->sellerOrder?->store?->name,
            'created_at' => $r->created_at?->toIso8601String(),
        ])]);
    }

    public function update(Request $request, ReturnRequest $return): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'received', 'refunded', 'completed'])],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $return = $this->returns->updateStatus($return, ReturnStatus::from($data['status']), $request->user(), $data['note'] ?? null);

        return response()->json(['message' => 'Return updated to '.$return->status->label().'.', 'return' => $return]);
    }

    public function refunds(): JsonResponse
    {
        return response()->json(['refunds' => Refund::with('order:id,order_number')->latest()->paginate(20)->through(fn ($r) => [
            'id' => $r->id, 'order_number' => $r->order?->order_number, 'amount' => $r->amount,
            'status' => $r->status, 'method' => $r->method, 'processed_at' => $r->processed_at?->toIso8601String(),
            'note' => $r->note,
        ])]);
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Receipt;
use App\Services\ReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceiptController extends Controller
{
    public function __construct(private readonly ReceiptService $receipts) {}

    public function index(Request $request): JsonResponse
    {
        $receipts = Receipt::with('order:id,order_number,grand_total,status,payment_status')
            ->where('user_id', $request->user()->id)
            ->latest('issued_at')
            ->paginate(20);

        return response()->json([
            'receipts' => $receipts->through(fn (Receipt $receipt) => [
                'number' => $receipt->receipt_number,
                'type' => $receipt->type,
                'type_label' => $receipt->typeLabel(),
                'amount' => $receipt->amount,
                'currency' => $receipt->currency,
                'issued_at' => $receipt->issued_at?->toIso8601String(),
                'order_number' => $receipt->order?->order_number,
                'url' => $this->receipts->url($receipt),
            ]),
        ]);
    }

    public function forOrder(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();
        abort_unless($order->user_id === $request->user()->id || $request->user()->isStaff(), 404);

        $receipt = $this->receipts->forOrder($order);

        return response()->json(['receipt' => $this->receipts->data($receipt)]);
    }

    /**
     * Printable receipt. Accessible with the public token from transactional
     * email, or by the owning customer and staff.
     */
    public function show(Request $request, string $receiptNumber): JsonResponse
    {
        $token = (string) $request->query('token', '');
        $receipt = $token !== '' ? $this->receipts->findByToken($receiptNumber, $token) : null;

        if (! $receipt) {
            $receipt = Receipt::where('receipt_number', $receiptNumber)->first();

            if (! $receipt) {
                abort(404);
            }

            $user = $request->user('sanctum');
            if (! $user || ($user->id !== $receipt->user_id && ! $user->isStaff())) {
                abort(404);
            }
        }

        return response()->json(['receipt' => $this->receipts->data($receipt)]);
    }
}

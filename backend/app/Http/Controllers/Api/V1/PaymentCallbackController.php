<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PaymentCallbackController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    public function success(Request $request, string $orderNumber)
    {
        return $this->handle($request, $orderNumber, 'success');
    }

    public function fail(Request $request, string $orderNumber)
    {
        return $this->handle($request, $orderNumber, 'fail');
    }

    public function cancel(Request $request, string $orderNumber)
    {
        return $this->handle($request, $orderNumber, 'cancel');
    }

    public function ipn(Request $request, string $orderNumber)
    {
        try {
            $url = $this->payments->handleHostedCallback($request, $orderNumber, 'success');

            return response()->json(['status' => 'ok', 'redirect' => $url]);
        } catch (\Throwable $e) {
            Log::error('Payment IPN failed', ['order' => $orderNumber, 'error' => $e->getMessage()]);

            return response()->json(['status' => 'error'], 500);
        }
    }

    public function bkash(Request $request, string $orderNumber)
    {
        $status = strtolower((string) $request->input('status', ''));
        $result = in_array($status, ['cancel', 'cancelled', 'failure', 'failed'], true) ? 'cancel' : 'success';

        return $this->handle($request, $orderNumber, $result);
    }

    private function handle(Request $request, string $orderNumber, string $result)
    {
        try {
            $url = $this->payments->handleHostedCallback($request, $orderNumber, $result);
        } catch (\Throwable $e) {
            Log::error('Payment callback failed', ['order' => $orderNumber, 'result' => $result, 'error' => $e->getMessage()]);
            $url = rtrim(config('app.frontend_url', config('app.url')), '/')
                .'/account/orders/'.$orderNumber.'?payment=error';
        }

        return redirect()->away($url);
    }
}

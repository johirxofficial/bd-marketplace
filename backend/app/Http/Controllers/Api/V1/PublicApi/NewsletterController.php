<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Models\NewsletterSubscriber;
use App\Services\MailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class NewsletterController extends Controller
{
    public function subscribe(Request $request, MailService $mail): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'name' => ['nullable', 'string', 'max:190'],
            'source' => ['nullable', 'string', 'max:40'],
        ]);

        $email = strtolower($data['email']);
        $subscriber = NewsletterSubscriber::firstOrNew(['email' => $email]);
        $wasSubscribed = $subscriber->exists && $subscriber->status === 'subscribed';

        $subscriber->fill([
            'name' => $data['name'] ?? $subscriber->name,
            'status' => 'subscribed',
            'source' => $data['source'] ?? ($subscriber->source ?: 'storefront'),
            'token' => $subscriber->token ?: Str::random(48),
            'subscribed_at' => $subscriber->subscribed_at ?: now(),
            'unsubscribed_at' => null,
        ])->save();

        if (! $wasSubscribed) {
            $unsubscribeUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/').'/unsubscribe/'.$subscriber->token;

            $mail->sendEvent($subscriber->email, 'newsletter_welcome', [
                'customer_name' => $subscriber->name ?: 'there',
                'action_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/'),
                'unsubscribe_url' => $unsubscribeUrl,
            ], $subscriber);
        }

        return response()->json([
            'message' => 'You are subscribed. Watch your inbox for new arrivals and deals.',
        ], $wasSubscribed ? 200 : 201);
    }

    public function status(string $token): JsonResponse
    {
        $subscriber = NewsletterSubscriber::where('token', $token)->firstOrFail();

        return response()->json(['subscriber' => [
            'email' => $subscriber->email,
            'status' => $subscriber->status,
        ]]);
    }

    public function unsubscribe(string $token): JsonResponse
    {
        $subscriber = NewsletterSubscriber::where('token', $token)->firstOrFail();

        if ($subscriber->status !== 'unsubscribed') {
            $subscriber->update(['status' => 'unsubscribed', 'unsubscribed_at' => now()]);
        }

        return response()->json([
            'message' => 'You have been unsubscribed from marketing emails.',
            'email' => $subscriber->email,
        ]);
    }
}

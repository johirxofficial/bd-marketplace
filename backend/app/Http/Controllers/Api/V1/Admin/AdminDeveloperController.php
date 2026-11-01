<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Services\AuditService;
use App\Services\WebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminDeveloperController extends Controller
{
    public function __construct(
        private readonly WebhookService $webhooks,
        private readonly AuditService $audit,
    ) {}

    public function tokens(Request $request): JsonResponse
    {
        return response()->json([
            'tokens' => $request->user()->tokens()->latest()->get()->map(fn ($token) => [
                'id' => $token->id,
                'name' => $token->name,
                'abilities' => $token->abilities,
                'last_used_at' => $token->last_used_at?->toIso8601String(),
                'expires_at' => $token->expires_at?->toIso8601String(),
                'created_at' => $token->created_at?->toIso8601String(),
            ]),
            'abilities' => ['*' => 'Full access', 'read' => 'Read-only (enforced by your API client)'],
        ]);
    }

    public function createToken(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'abilities' => ['nullable', 'array'],
            'abilities.*' => ['string', 'max:50'],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $token = $request->user()->createToken(
            $data['name'],
            $data['abilities'] ?: ['*'],
            isset($data['expires_in_days']) ? now()->addDays($data['expires_in_days']) : null,
        );

        $this->audit->log('api_token.created', null, [], ['name' => $data['name'], 'abilities' => $data['abilities'] ?? ['*']]);

        return response()->json([
            'message' => 'API token created. Copy it now — it will not be shown again.',
            'plain_text_token' => $token->plainTextToken,
            'token' => [
                'id' => $token->accessToken->id,
                'name' => $token->accessToken->name,
                'abilities' => $token->accessToken->abilities,
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function revokeToken(Request $request, int $token): JsonResponse
    {
        $record = $request->user()->tokens()->whereKey($token)->firstOrFail();
        $record->delete();
        $this->audit->log('api_token.revoked', null, [], ['token_id' => $token]);

        return response()->json(['message' => 'API token revoked.']);
    }

    public function webhooks(): JsonResponse
    {
        return response()->json([
            'webhooks' => Webhook::withCount('deliveries')->latest()->get()->map(fn (Webhook $webhook) => [
                'id' => $webhook->id,
                'name' => $webhook->name,
                'url' => $webhook->url,
                'events' => $webhook->events,
                'active' => $webhook->active,
                'deliveries_count' => $webhook->deliveries_count,
                'last_triggered_at' => $webhook->last_triggered_at?->toIso8601String(),
                'created_at' => $webhook->created_at?->toIso8601String(),
            ]),
            'events' => WebhookService::EVENTS,
        ]);
    }

    public function storeWebhook(Request $request): JsonResponse
    {
        $data = $this->webhookRules($request);
        $data['secret'] = $data['secret'] ?? Str::random(48);
        $webhook = Webhook::create($data);

        $this->audit->log('webhook.created', $webhook, [], ['name' => $webhook->name, 'events' => $webhook->events]);

        return response()->json([
            'message' => 'Webhook created. Store the signing secret securely.',
            'webhook' => $webhook,
            'secret' => $webhook->secret,
        ], 201);
    }

    public function updateWebhook(Request $request, Webhook $webhook): JsonResponse
    {
        $data = $this->webhookRules($request, $webhook);
        $webhook->update($data);

        $this->audit->log('webhook.updated', $webhook, [], ['active' => $webhook->active]);

        return response()->json(['message' => 'Webhook updated.', 'webhook' => $webhook->fresh()]);
    }

    public function destroyWebhook(Webhook $webhook): JsonResponse
    {
        $webhook->delete();
        $this->audit->log('webhook.deleted', null, [], ['name' => $webhook->name]);

        return response()->json(['message' => 'Webhook deleted.']);
    }

    public function testWebhook(Webhook $webhook): JsonResponse
    {
        $this->webhooks->dispatch('order.placed', [
            'order_number' => 'BDP-TEST-'.strtoupper(Str::random(6)),
            'grand_total' => '1000.00',
            'test' => true,
        ]);

        return response()->json(['message' => 'Test delivery queued for matching active webhooks.']);
    }

    public function deliveries(Webhook $webhook): JsonResponse
    {
        return response()->json([
            'deliveries' => $webhook->deliveries()->latest()->limit(50)->get()->map(fn (WebhookDelivery $delivery) => [
                'id' => $delivery->id,
                'event' => $delivery->event,
                'response_status' => $delivery->response_status,
                'attempts' => $delivery->attempts,
                'delivered_at' => $delivery->delivered_at?->toIso8601String(),
                'failed_at' => $delivery->failed_at?->toIso8601String(),
                'response_body' => $delivery->response_body,
                'created_at' => $delivery->created_at?->toIso8601String(),
            ]),
        ]);
    }

    private function webhookRules(Request $request, ?Webhook $webhook = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'url' => ['required', 'url', 'max:500'],
            'events' => ['required', 'array', 'min:1'],
            'events.*' => [Rule::in(WebhookService::EVENTS)],
            'secret' => [$webhook ? 'nullable' : 'nullable', 'string', 'min:16', 'max:200'],
            'active' => ['required', 'boolean'],
        ]);

        if ($webhook && blank($data['secret'] ?? null)) {
            unset($data['secret']);
        }

        return $data;
    }
}

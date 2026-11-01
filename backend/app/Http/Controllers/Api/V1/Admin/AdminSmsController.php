<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Models\SmsTemplate;
use App\Services\AuditService;
use App\Services\Sms\SmsManager;
use App\Services\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminSmsController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly SmsService $sms,
        private readonly SmsManager $manager,
    ) {}

    public function gateways(): JsonResponse
    {
        return response()->json([
            'gateways' => SmsGateway::orderByDesc('is_default')->orderBy('name')->get()
                ->map(fn (SmsGateway $gateway) => $this->serializeGateway($gateway)),
            'drivers' => $this->manager->available(),
        ]);
    }

    public function storeGateway(Request $request): JsonResponse
    {
        $data = $this->gatewayRules($request);
        $gateway = SmsGateway::create($data);

        if ($gateway->is_default) {
            SmsGateway::whereKeyNot($gateway->id)->update(['is_default' => false]);
        }

        $this->audit->log('sms_gateway.created', $gateway, [], ['name' => $gateway->name, 'driver' => $gateway->driver]);

        return response()->json(['message' => 'SMS gateway created.', 'gateway' => $this->serializeGateway($gateway)], 201);
    }

    public function updateGateway(Request $request, SmsGateway $gateway): JsonResponse
    {
        $data = $this->gatewayRules($request, $gateway);
        $gateway->update($data);

        if ($gateway->is_default) {
            SmsGateway::whereKeyNot($gateway->id)->update(['is_default' => false]);
        }

        $this->audit->log('sms_gateway.updated', $gateway, [], ['name' => $gateway->name, 'enabled' => $gateway->enabled]);

        return response()->json(['message' => 'SMS gateway saved.', 'gateway' => $this->serializeGateway($gateway->fresh())]);
    }

    public function templates(): JsonResponse
    {
        return response()->json(['templates' => SmsTemplate::orderBy('event')->get()]);
    }

    public function updateTemplate(Request $request, SmsTemplate $template): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'body' => ['required', 'string', 'max:1000'],
            'enabled' => ['required', 'boolean'],
        ]);

        $template->update($data);
        $this->audit->log('sms_template.updated', $template, [], ['event' => $template->event]);

        return response()->json(['message' => 'SMS template saved.', 'template' => $template->fresh()]);
    }

    public function messages(Request $request): JsonResponse
    {
        $messages = SmsMessage::with('gateway:id,name')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('event'), fn ($q) => $q->where('event', $request->string('event')))
            ->latest()
            ->paginate(20);

        return response()->json([
            'messages' => $messages->through(fn (SmsMessage $message) => [
                'id' => $message->id,
                'to' => $message->to,
                'body' => $message->body,
                'event' => $message->event,
                'status' => $message->status,
                'gateway' => $message->gateway?->name,
                'provider_ref' => $message->provider_ref,
                'error' => $message->error,
                'sent_at' => $message->sent_at?->toIso8601String(),
                'created_at' => $message->created_at?->toIso8601String(),
            ]),
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/'],
            'body' => ['required', 'string', 'max:500'],
        ]);

        $message = $this->sms->sendRaw($data['to'], $data['body'], 'test');

        if (! $message) {
            return response()->json([
                'message' => 'No enabled SMS gateway is configured, or SMS sending is disabled in settings.',
            ], 422);
        }

        return response()->json([
            'message' => 'Test SMS queued.',
            'sms' => ['id' => $message->id, 'status' => $message->status, 'to' => $message->to],
        ], 201);
    }

    private function gatewayRules(Request $request, ?SmsGateway $gateway = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'driver' => ['required', Rule::in(array_keys($this->manager->available()))],
            'sender_id' => ['nullable', 'string', 'max:60'],
            'enabled' => ['required', 'boolean'],
            'is_default' => ['required', 'boolean'],
            'config' => ['nullable', 'array'],
        ]);

        $existing = $gateway?->config ?: [];
        $config = array_merge($existing, $data['config'] ?? []);
        foreach (['api_key', 'api_token', 'password'] as $secret) {
            if (array_key_exists($secret, $config) && blank($config[$secret]) && ! empty($existing[$secret])) {
                $config[$secret] = $existing[$secret];
            }
            if (array_key_exists($secret, $config) && blank($config[$secret])) {
                unset($config[$secret]);
            }
        }

        $data['config'] = $config ?: null;

        return $data;
    }

    private function serializeGateway(SmsGateway $gateway): array
    {
        $config = $gateway->config ?: [];
        foreach (['api_key', 'api_token', 'password'] as $secret) {
            if (! empty($config[$secret])) {
                $config[$secret] = '';
                $config['has_'.$secret] = true;
            }
        }

        return [
            'id' => $gateway->id,
            'name' => $gateway->name,
            'driver' => $gateway->driver,
            'sender_id' => $gateway->sender_id,
            'enabled' => $gateway->enabled,
            'is_default' => $gateway->is_default,
            'config' => $config,
        ];
    }
}

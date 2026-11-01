<?php

namespace App\Services;

use App\Jobs\SendSmsMessage;
use App\Models\PlatformSetting;
use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Models\SmsTemplate;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class SmsService
{
    public function enabled(): bool
    {
        return (bool) PlatformSetting::get('sms_enabled', false);
    }

    public function defaultGateway(): ?SmsGateway
    {
        if (! $this->enabled()) {
            return null;
        }

        return SmsGateway::where('enabled', true)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();
    }

    /**
     * Send an SMS for a known event using the matching template.
     *
     * @param  array<string, string|int|float|null>  $replacements
     */
    public function sendEvent(User|int $user, string $event, array $replacements = [], ?Model $related = null): ?SmsMessage
    {
        $user = $user instanceof User ? $user : User::find($user);

        if (! $user || ! $user->phone) {
            return null;
        }

        $template = SmsTemplate::where('event', $event)->where('enabled', true)->first();

        if (! $template) {
            return null;
        }

        $gateway = $this->defaultGateway();

        if (! $gateway) {
            return null;
        }

        $body = $this->render($template->body, array_merge([
            'customer_name' => $user->name,
            'site_name' => PlatformSetting::get('store_name', 'BD Marketplace'),
        ], $replacements));

        return $this->queue($this->normalizePhone($user->phone), $body, $event, $gateway, $related);
    }

    public function sendRaw(string $to, string $body, ?string $event = 'test', ?Model $related = null): ?SmsMessage
    {
        $gateway = $this->defaultGateway();

        if (! $gateway) {
            return null;
        }

        return $this->queue($this->normalizePhone($to), $body, $event, $gateway, $related);
    }

    public function render(string $body, array $replacements): string
    {
        $map = [];
        foreach ($replacements as $key => $value) {
            $map['{'.$key.'}'] = (string) $value;
        }

        return trim(strtr($body, $map));
    }

    public function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?: '';

        if (str_starts_with($digits, '880')) {
            return $digits;
        }

        if (str_starts_with($digits, '0')) {
            return '880'.substr($digits, 1);
        }

        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            return '880'.$digits;
        }

        return $digits;
    }

    private function queue(string $to, string $body, string $event, SmsGateway $gateway, ?Model $related): SmsMessage
    {
        $message = SmsMessage::create([
            'sms_gateway_id' => $gateway->id,
            'to' => $to,
            'body' => Str::limit($body, 1000, ''),
            'event' => $event,
            'status' => 'queued',
            'messageable_type' => $related?->getMorphClass(),
            'messageable_id' => $related?->getKey(),
        ]);

        SendSmsMessage::dispatch($message->id);

        return $message;
    }
}

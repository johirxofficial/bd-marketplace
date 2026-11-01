<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\SendEmailMessage;
use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use App\Models\EmailTemplate;
use App\Models\MailSetting;
use App\Models\NewsletterSubscriber;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminEmailController extends Controller
{
    public function __construct(
        private readonly MailService $mail,
        private readonly AuditService $audit,
    ) {}

    public function overview(): JsonResponse
    {
        $counts = EmailMessage::query()
            ->selectRaw("status, count(*) as total")
            ->groupBy('status')
            ->pluck('total', 'status');

        $last30 = EmailMessage::where('created_at', '>=', now()->subDays(30))
            ->selectRaw("date(created_at) as day, count(*) as total")
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        return response()->json([
            'overview' => [
                'enabled' => $this->mailEnabled(),
                'driver' => $this->safeDriver(),
                'from_address' => $this->safeSetting()?->from_address,
                'from_name' => $this->safeSetting()?->from_name,
                'queued' => (int) ($counts['queued'] ?? 0),
                'sent' => (int) ($counts['sent'] ?? 0),
                'failed' => (int) ($counts['failed'] ?? 0),
                'templates' => EmailTemplate::count(),
                'active_templates' => EmailTemplate::where('enabled', true)->count(),
                'subscribers' => NewsletterSubscriber::where('status', 'subscribed')->count(),
                'campaigns' => EmailCampaign::count(),
                'last_30_days' => $last30,
            ],
            'recent' => EmailMessage::latest()->limit(8)->get()->map(fn ($m) => $this->messageRow($m)),
            'events' => collect(MailService::EVENTS)->map(fn ($label, $event) => ['event' => $event, 'label' => $label])->values(),
        ]);
    }

    public function settings(): JsonResponse
    {
        $settings = MailSetting::current();

        return response()->json(['settings' => [
            'enabled' => $settings->enabled,
            'driver' => $settings->driver,
            'host' => $settings->host,
            'port' => $settings->port,
            'encryption' => $settings->encryption,
            'username' => $settings->username,
            'password_set' => (bool) $settings->password,
            'from_address' => $settings->from_address,
            'from_name' => $settings->from_name,
            'reply_to' => $settings->reply_to,
            'footer_note' => $settings->footer_note,
        ]]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'driver' => ['required', Rule::in(['log', 'smtp'])],
            'host' => ['nullable', 'string', 'max:190', 'required_if:driver,smtp'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'encryption' => ['nullable', Rule::in(['tls', 'ssl', 'none'])],
            'username' => ['nullable', 'string', 'max:190'],
            'password' => ['nullable', 'string', 'max:500'],
            'from_address' => ['required', 'email', 'max:190'],
            'from_name' => ['required', 'string', 'max:190'],
            'reply_to' => ['nullable', 'email', 'max:190'],
            'footer_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $settings = MailSetting::current();

        if (($data['password'] ?? null) === null || $data['password'] === '') {
            unset($data['password']);
        }

        if ($data['driver'] === 'log') {
            $data['encryption'] = null;
        } elseif (($data['encryption'] ?? null) === 'none') {
            $data['encryption'] = null;
        }

        $old = Arr::except($settings->toArray(), ['password']);
        $settings->update($data);
        $this->audit->log('email.settings_updated', $settings, $old, Arr::except($data, ['password']));

        return response()->json([
            'message' => 'Mail settings saved. Runtime configuration is applied on the next send.',
            'settings' => $this->settings()->getData(true)['settings'],
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'name' => ['nullable', 'string', 'max:190'],
        ]);

        $message = $this->mail->sendTest($data['email'], $data['name'] ?? null);
        $this->audit->log('email.test_sent', $message, [], ['to' => $data['email']]);

        return response()->json([
            'message' => 'Test email queued. Check the message log for the delivery result.',
            'message_id' => $message->id,
        ], 201);
    }

    public function templates(): JsonResponse
    {
        $templates = EmailTemplate::orderBy('name')->get();

        return response()->json([
            'templates' => $templates->map(fn ($t) => [
                'id' => $t->id,
                'event' => $t->event,
                'name' => $t->name,
                'subject' => $t->subject,
                'body' => $t->body,
                'enabled' => $t->enabled,
                'updated_at' => $t->updated_at?->toIso8601String(),
            ]),
            'events' => collect(MailService::EVENTS)->map(fn ($label, $event) => ['event' => $event, 'label' => $label])->values(),
            'placeholders' => array_keys($this->mail->sampleReplacements()),
        ]);
    }

    public function updateTemplate(Request $request, EmailTemplate $template): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'subject' => ['sometimes', 'required', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string', 'max:200000'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $old = Arr::only($template->toArray(), array_keys($data));
        $template->update($data);
        $this->audit->log('email.template_updated', $template, $old, $data);

        return response()->json(['message' => 'Email template saved.', 'template' => $template->fresh()]);
    }

    public function previewTemplate(Request $request, EmailTemplate $template): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:200000'],
            'replacements' => ['nullable', 'array'],
        ]);

        $body = $data['body'] ?? $template->body;
        $html = $this->mail->preview($body, array_map('strval', $data['replacements'] ?? []));

        return response()->json([
            'subject' => $data['subject'] ?? $template->subject,
            'html' => $html,
        ]);
    }

    public function messages(Request $request): JsonResponse
    {
        $messages = EmailMessage::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('event'), fn ($q) => $q->where('event', $request->string('event')))
            ->when($request->filled('campaign_id'), fn ($q) => $q->where('campaign_id', $request->integer('campaign_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($w) => $w->where('to_email', 'like', $term)
                    ->orWhere('to_name', 'like', $term)
                    ->orWhere('subject', 'like', $term));
            })
            ->latest()
            ->paginate(25);

        return response()->json([
            'messages' => $messages->through(fn ($m) => $this->messageRow($m, true)),
            'filters' => [
                'statuses' => ['queued', 'sent', 'failed'],
                'events' => collect(MailService::EVENTS)->map(fn ($label, $event) => ['event' => $event, 'label' => $label])->values(),
            ],
        ]);
    }

    public function showMessage(EmailMessage $message): JsonResponse
    {
        return response()->json(['message' => array_merge($this->messageRow($message, true), [
            'body' => $message->body,
            'html' => $this->mail->preview($message->body, []),
        ])]);
    }

    public function retryMessage(EmailMessage $message): JsonResponse
    {
        abort_if($message->status === 'sent', 422, 'This message was already delivered.');

        $message->update(['status' => 'queued', 'error' => null, 'failed_at' => null]);
        SendEmailMessage::dispatch($message->id);
        $this->audit->log('email.message_retried', $message, [], ['to' => $message->to_email]);

        return response()->json(['message' => 'Message queued for another delivery attempt.']);
    }

    public function compose(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'name' => ['nullable', 'string', 'max:190'],
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:200000'],
        ]);

        $user = User::where('email', $data['email'])->first();
        $subscriber = NewsletterSubscriber::where('email', $data['email'])->first();
        $unsubscribe = $subscriber
            ? rtrim((string) config('app.frontend_url', config('app.url')), '/').'/unsubscribe/'.$subscriber->token
            : null;

        $message = $this->mail->sendManual(
            $data['email'],
            $data['name'] ?? $user?->name,
            $data['subject'],
            $data['body'],
            $user?->id,
            null,
            $unsubscribe,
        );

        $this->audit->log('email.manual_sent', $message, [], ['to' => $data['email'], 'subject' => $data['subject']]);

        return response()->json(['message' => 'Email queued for delivery.', 'message_id' => $message->id], 201);
    }

    public function campaigns(): JsonResponse
    {
        $campaigns = EmailCampaign::with('creator:id,name')->latest()->paginate(20);

        return response()->json(['campaigns' => $campaigns->through(fn ($c) => $this->campaignRow($c))]);
    }

    public function storeCampaign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:200000'],
            'audience' => ['required', Rule::in(['all', 'customers', 'sellers', 'staff', 'subscribers', 'custom'])],
            'emails' => ['required_if:audience,custom', 'array', 'max:2000'],
            'emails.*' => ['email', 'max:190'],
        ]);

        $recipients = $this->recipients($data['audience'], $data['emails'] ?? []);

        if ($recipients->isEmpty()) {
            return response()->json(['message' => 'No recipients matched this audience.'], 422);
        }

        $campaign = DB::transaction(function () use ($data, $recipients, $request) {
            return EmailCampaign::create([
                'subject' => $data['subject'],
                'body' => $data['body'],
                'audience' => $data['audience'],
                'status' => 'sending',
                'recipients_count' => $recipients->count(),
                'created_by' => $request->user()->id,
            ]);
        });

        foreach ($recipients as $recipient) {
            $subscriber = NewsletterSubscriber::where('email', $recipient['email'])->first();
            $unsubscribe = $subscriber
                ? rtrim((string) config('app.frontend_url', config('app.url')), '/').'/unsubscribe/'.$subscriber->token
                : null;

            $this->mail->sendManual(
                $recipient['email'],
                $recipient['name'],
                $data['subject'],
                $data['body'],
                $recipient['user_id'],
                $campaign->id,
                $unsubscribe,
            );
        }

        $campaign->update(['status' => 'queued']);
        $this->audit->log('email.campaign_queued', $campaign, [], [
            'audience' => $data['audience'],
            'recipients' => $recipients->count(),
        ]);

        return response()->json([
            'message' => "Campaign queued for {$recipients->count()} recipient(s).",
            'campaign' => $this->campaignRow($campaign->fresh('creator')),
        ], 201);
    }

    public function showCampaign(EmailCampaign $campaign): JsonResponse
    {
        $messages = $campaign->messages()->latest()->paginate(25);

        return response()->json([
            'campaign' => $this->campaignRow($campaign->load('creator:id,name')),
            'messages' => $messages->through(fn ($m) => $this->messageRow($m, true)),
        ]);
    }

    public function subscribers(Request $request): JsonResponse
    {
        $subscribers = NewsletterSubscriber::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('email', 'like', '%'.$request->string('search').'%')->orWhere('name', 'like', '%'.$request->string('search').'%')))
            ->latest()
            ->paginate(25);

        return response()->json(['subscribers' => $subscribers->through(fn ($s) => [
            'id' => $s->id,
            'email' => $s->email,
            'name' => $s->name,
            'status' => $s->status,
            'source' => $s->source,
            'subscribed_at' => $s->subscribed_at?->toIso8601String(),
            'unsubscribed_at' => $s->unsubscribed_at?->toIso8601String(),
            'created_at' => $s->created_at?->toIso8601String(),
        ])]);
    }

    public function storeSubscriber(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'name' => ['nullable', 'string', 'max:190'],
        ]);

        $subscriber = NewsletterSubscriber::firstOrNew(['email' => strtolower($data['email'])]);
        $subscriber->fill([
            'name' => $data['name'] ?? $subscriber->name,
            'status' => 'subscribed',
            'source' => $subscriber->exists ? $subscriber->source : 'admin',
            'token' => $subscriber->token ?: Str::random(48),
            'subscribed_at' => now(),
            'unsubscribed_at' => null,
        ])->save();

        $this->audit->log('newsletter.subscriber_added', $subscriber, [], ['email' => $subscriber->email]);

        return response()->json(['message' => 'Subscriber saved.', 'subscriber' => $subscriber], 201);
    }

    public function destroySubscriber(NewsletterSubscriber $subscriber): JsonResponse
    {
        $subscriber->update(['status' => 'unsubscribed', 'unsubscribed_at' => now()]);
        $this->audit->log('newsletter.subscriber_removed', $subscriber, [], ['email' => $subscriber->email]);

        return response()->json(['message' => 'Subscriber unsubscribed.']);
    }

    /**
     * @param  array<int, string>  $emails
     * @return \Illuminate\Support\Collection<int, array{email: string, name: ?string, user_id: ?int}>
     */
    private function recipients(string $audience, array $emails)
    {
        if ($audience === 'subscribers') {
            return NewsletterSubscriber::where('status', 'subscribed')
                ->get(['email', 'name'])
                ->map(fn ($s) => ['email' => $s->email, 'name' => $s->name, 'user_id' => User::where('email', $s->email)->value('id')]);
        }

        if ($audience === 'custom') {
            return collect($emails)
                ->map(fn ($email) => strtolower(trim($email)))
                ->filter(fn ($email) => filter_var($email, FILTER_VALIDATE_EMAIL))
                ->unique()
                ->values()
                ->map(function ($email) {
                    $user = User::where('email', $email)->first();

                    return ['email' => $email, 'name' => $user?->name, 'user_id' => $user?->id];
                });
        }

        $query = User::query()->where('status', 'active')->select(['id', 'name', 'email']);

        match ($audience) {
            'customers' => $query->whereHas('role', fn ($q) => $q->where('name', 'customer')),
            'sellers' => $query->whereHas('role', fn ($q) => $q->where('name', 'seller')),
            'staff' => $query->whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'manager', 'support'])),
            default => null,
        };

        return $query->get()->map(fn ($u) => ['email' => $u->email, 'name' => $u->name, 'user_id' => $u->id]);
    }

    /**
     * @return array<string, mixed>
     */
    private function messageRow(EmailMessage $message, bool $withBody = false): array
    {
        $row = [
            'id' => $message->id,
            'to_email' => $message->to_email,
            'to_name' => $message->to_name,
            'subject' => $message->subject,
            'event' => $message->event,
            'event_label' => MailService::EVENTS[$message->event] ?? $message->event,
            'status' => $message->status,
            'attempts' => $message->attempts,
            'error' => $message->error,
            'campaign_id' => $message->campaign_id,
            'sent_at' => $message->sent_at?->toIso8601String(),
            'failed_at' => $message->failed_at?->toIso8601String(),
            'created_at' => $message->created_at?->toIso8601String(),
        ];

        if ($withBody) {
            $row['body'] = $message->body;
        }

        return $row;
    }

    /**
     * @return array<string, mixed>
     */
    private function campaignRow(EmailCampaign $campaign): array
    {
        $counts = $campaign->messages()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $sent = (int) ($counts['sent'] ?? 0);
        $queued = (int) ($counts['queued'] ?? 0);
        $failed = (int) ($counts['failed'] ?? 0);
        $status = $queued > 0 ? 'sending' : ($failed > 0 && $sent === 0 ? 'failed' : ($sent + $failed > 0 ? 'sent' : $campaign->status));

        return [
            'id' => $campaign->id,
            'subject' => $campaign->subject,
            'audience' => $campaign->audience,
            'status' => $status,
            'recipients_count' => $campaign->recipients_count,
            'sent_count' => $sent,
            'queued_count' => $queued,
            'failed_count' => $failed,
            'created_by' => $campaign->creator?->name,
            'completed_at' => $campaign->completed_at?->toIso8601String(),
            'created_at' => $campaign->created_at?->toIso8601String(),
        ];
    }

    private function safeSetting(): ?MailSetting
    {
        try {
            return MailSetting::current();
        } catch (\Throwable) {
            return null;
        }
    }

    private function safeDriver(): string
    {
        return $this->safeSetting()?->driver ?? 'log';
    }

    private function mailEnabled(): bool
    {
        return (bool) $this->safeSetting()?->enabled;
    }
}

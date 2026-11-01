<?php

namespace App\Mail;

use App\Models\PlatformSetting;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class MarketplaceMail extends Mailable
{
    public function __construct(
        public string $mailSubject,
        public string $bodyHtml,
        public ?string $unsubscribeUrl = null,
        public ?string $preheader = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->mailSubject);
    }

    public function content(): Content
    {
        $logoPath = PlatformSetting::get('store_logo_path');

        return new Content(
            view: 'emails.marketplace',
            with: [
                'bodyHtml' => $this->bodyHtml,
                'storeName' => PlatformSetting::get('store_name', config('app.name', 'Marketplace')),
                'storeUrl' => rtrim((string) config('app.frontend_url', config('app.url')), '/'),
                'logoUrl' => $logoPath ? url('/media/'.$logoPath) : null,
                'brandColor' => PlatformSetting::get('primary_color', '#f85606'),
                'footerNote' => \App\Models\MailSetting::current()->footer_note,
                'supportEmail' => PlatformSetting::get('support_email'),
                'unsubscribeUrl' => $this->unsubscribeUrl,
                'preheader' => $this->preheader,
            ],
        );
    }
}

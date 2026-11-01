<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>{{ $storeName }}</title>
    <!--[if mso]>
    <style>table, td, p, a, h1, h2, h3 { font-family: Arial, Helvetica, sans-serif !important; }</style>
    <![endif]-->
    <style>
        body { margin: 0; padding: 0; width: 100% !important; background: #eef2f7; -webkit-text-size-adjust: 100%; }
        table { border-collapse: collapse; }
        img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        a { text-decoration: none; }
        .email-btn { display: inline-block; background: {{ $brandColor }}; color: #ffffff !important; font-weight: 700; font-size: 14px; line-height: 1; padding: 14px 22px; border-radius: 10px; }
        .email-btn:hover { opacity: .92; }
        .email-body p { margin: 0 0 15px; }
        .email-body a { color: {{ $brandColor }}; }
        .email-body h1, .email-body h2, .email-body h3 { color: #0f172a; line-height: 1.25; }
        .email-body ul, .email-body ol { margin: 0 0 15px; padding-left: 20px; }
        .email-body li { margin-bottom: 6px; }
        .email-body table { width: 100%; }
        .email-body blockquote { margin: 0 0 15px; padding: 12px 16px; border-left: 4px solid {{ $brandColor }}; background: #f8fafc; color: #475569; }
        @media only screen and (max-width: 640px) {
            .email-shell { width: 100% !important; }
            .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .email-body { font-size: 15px !important; }
            .email-brand-name { font-size: 18px !important; }
        }
    </style>
</head>
<body>
@if ($preheader)
    <div style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{{ $preheader }}</div>
@endif
<div style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    {{ $storeName }} — order updates, payments, and account notifications.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
    <tr>
        <td align="center" style="padding:28px 12px;">
            <table role="presentation" class="email-shell" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,.10);">
                <tr>
                    <td height="5" style="background:{{ $brandColor }};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                    <td class="email-pad" style="padding:26px 36px 20px;background:#ffffff;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                                <td align="left">
                                    <a href="{{ $storeUrl }}" style="display:inline-block;color:#0f172a;">
                                        @if ($logoUrl)
                                            <img src="{{ $logoUrl }}" alt="{{ $storeName }}" width="46" height="46" style="width:46px;height:46px;border-radius:12px;object-fit:contain;vertical-align:middle;border:1px solid #e2e8f0;background:#fff;">
                                        @endif
                                        <span class="email-brand-name" style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#0f172a;">{{ $storeName }}</span>
                                    </a>
                                </td>
                                <td align="right" style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;">
                                    Account notification
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td class="email-pad" style="padding:6px 36px 0;">
                        <div style="height:1px;background:#e2e8f0;font-size:0;line-height:0;">&nbsp;</div>
                    </td>
                </tr>
                <tr>
                    <td class="email-pad email-body" style="padding:28px 36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155;">
                        {!! $bodyHtml !!}
                    </td>
                </tr>
                <tr>
                    <td class="email-pad" style="padding:0 36px 24px;">
                        <div style="height:1px;background:#e2e8f0;font-size:0;line-height:0;">&nbsp;</div>
                    </td>
                </tr>
                <tr>
                    <td class="email-pad" style="padding:0 36px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">
                        @if ($footerNote)
                            <p style="margin:0 0 10px;color:#64748b;">{{ $footerNote }}</p>
                        @endif
                        <p style="margin:0 0 6px;">
                            Need help? Email
                            @if ($supportEmail)
                                <a href="mailto:{{ $supportEmail }}" style="color:{{ $brandColor }};font-weight:600;">{{ $supportEmail }}</a>
                            @else
                                our support team
                            @endif
                            or visit <a href="{{ $storeUrl }}/support" style="color:{{ $brandColor }};font-weight:600;">the help center</a>.
                        </p>
                        @if ($unsubscribeUrl)
                            <p style="margin:0 0 6px;">You are receiving this email because you subscribed to updates. <a href="{{ $unsubscribeUrl }}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>.</p>
                        @endif
                        <p style="margin:0;">© {{ date('Y') }} {{ $storeName }}. All rights reserved.</p>
                        <p style="margin:6px 0 0;color:#cbd5e1;">This is an automated message from {{ $storeUrl }}.</p>
                    </td>
                </tr>
            </table>
            <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">
                Please do not reply to this automated email unless a reply-to address is shown.
            </p>
        </td>
    </tr>
</table>
</body>
</html>

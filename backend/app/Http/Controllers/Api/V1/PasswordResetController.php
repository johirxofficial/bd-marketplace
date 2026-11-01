<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\MailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class PasswordResetController extends Controller
{
    public function send(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $user = User::where('email', strtolower((string) $request->input('email')))->first();

        if ($user) {
            $token = Password::broker()->createToken($user);
            $frontend = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $resetUrl = $frontend.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email);

            app(MailService::class)->sendEvent($user, 'password_reset', [
                'reset_url' => $resetUrl,
                'action_url' => $resetUrl,
            ], $user);
        }

        return response()->json([
            'message' => 'If an account exists for that email, a password reset link has been sent.',
            'status' => Password::RESET_LINK_SENT,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $status = Password::reset($request->only('email', 'password', 'password_confirmation', 'token'), function (User $user, string $password) {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
            ])->save();

            $user->tokens()->delete();

            app(MailService::class)->sendEvent($user, 'password_changed', [
                'action_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/account',
            ], $user);
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => __($status)], 422);
        }

        return response()->json(['message' => 'Your password has been reset. You can now sign in.']);
    }
}

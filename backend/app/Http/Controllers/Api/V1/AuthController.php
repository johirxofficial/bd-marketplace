<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\Cart;
use App\Models\CustomerProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\MailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request) {
            $role = Role::where('name', 'customer')->firstOrFail();
            $user = User::create([
                'name' => $request->string('name')->trim()->value(),
                'email' => strtolower($request->string('email')->trim()->value()),
                'phone' => $request->input('phone'),
                'password' => $request->input('password'),
                'role_id' => $role->id,
                'status' => 'active',
            ]);
            CustomerProfile::create(['user_id' => $user->id]);
            Cart::create(['user_id' => $user->id, 'status' => 'active']);

            return $user;
        });

        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        app(MailService::class)->sendEvent($user, 'welcome', [
            'action_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/account',
        ], $user);

        return response()->json([
            'message' => 'Your account has been created.',
            'user' => new UserResource($user->load(['role.permissions', 'customerProfile', 'sellerProfile.store'])),
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->only('email', 'password');
        $credentials['email'] = strtolower($credentials['email']);

        if (! Auth::guard('web')->attempt($credentials, (bool) $request->boolean('remember'))) {
            throw ValidationException::withMessages([
                'email' => 'The email address or password is incorrect.',
            ]);
        }

        /** @var User $user */
        $user = Auth::guard('web')->user();
        if ($user->status !== 'active') {
            Auth::guard('web')->logout();
            throw ValidationException::withMessages(['email' => 'This account is suspended. Contact support for help.']);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }
        $user->update(['last_login_at' => now()]);

        return response()->json([
            'message' => 'Welcome back.',
            'user' => new UserResource($user->load(['role.permissions', 'customerProfile', 'sellerProfile.store'])),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        // Stateful SPA requests use a TransientToken, which has no delete().
        if ($token instanceof \Laravel\Sanctum\PersonalAccessToken) {
            $token->delete();
        }
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'You have been logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => new UserResource($request->user()->load(['role.permissions', 'customerProfile', 'sellerProfile.store'])),
        ]);
    }
}

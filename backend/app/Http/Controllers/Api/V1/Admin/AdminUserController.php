<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConversationParticipant;
use App\Models\Role;
use App\Models\SupportTicket;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AdminUserController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $users = User::with('role:id,name,label')
            ->when($request->filled('role'), fn ($q) => $q->whereHas('role', fn ($r) => $r->where('name', $request->string('role'))))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', '%'.$request->string('search').'%')->orWhere('email', 'like', '%'.$request->string('search').'%')->orWhere('phone', 'like', '%'.$request->string('search').'%')))
            ->latest()->paginate(20);

        return response()->json(['users' => $users->through(fn ($u) => [
            'id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'phone' => $u->phone,
            'status' => $u->status, 'role' => $u->role?->name, 'role_label' => $u->role?->label,
            'avatar_url' => $u->avatar_url,
            'last_login_at' => $u->last_login_at?->toIso8601String(), 'created_at' => $u->created_at?->toIso8601String(),
        ]), 'roles' => Role::orderBy('name')->get(['id', 'name', 'label'])]);
    }

    /**
     * Full account view for the administrator. Passwords are one-way hashes
     * and are never returned by the API.
     */
    public function show(User $user): JsonResponse
    {
        $user->load(['role:id,name,label', 'sellerProfile.store', 'customerProfile']);
        $user->loadCount('orders');

        return response()->json(['user' => $this->detail($user)]);
    }

    /**
     * Edit the account's basic details (name, sign-in email, phone).
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/', Rule::unique('users', 'phone')->ignore($user->id)],
        ]);

        $old = $user->only(['name', 'email', 'phone']);

        $user->update([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'phone' => $data['phone'] ?? null,
        ]);

        $this->audit->log('user.details_updated', $user, $old, $user->only(['name', 'email', 'phone']));

        return response()->json([
            'message' => 'User details updated.',
            'user' => $this->detail($user->fresh(['role:id,name,label', 'sellerProfile.store', 'customerProfile'])),
        ]);
    }

    /**
     * Administrator sets a new password directly. The account is signed out of
     * all other devices and the owner is notified by email when mail is enabled.
     */
    public function updatePassword(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        if (Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => 'Choose a password different from the current one.',
            ]);
        }

        $user->forceFill([
            'password' => Hash::make($data['password']),
            'remember_token' => Str::random(60),
        ])->save();

        // Keep the administrator's current token when changing their own
        // password; every other session is revoked.
        $currentToken = $request->user()->currentAccessToken();
        $currentTokenId = $currentToken instanceof \Laravel\Sanctum\PersonalAccessToken ? $currentToken->id : null;
        $tokens = $user->tokens();
        if ($user->id === $request->user()->id && $currentTokenId) {
            $tokens->where('id', '!=', $currentTokenId);
        }
        $tokens->delete();

        $this->audit->log('user.password_changed', $user, [], ['changed_by' => $request->user()->id]);

        app(MailService::class)->sendEvent($user, 'password_changed', [
            'action_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/login',
            'changed_by' => $request->user()->name,
        ], $user);

        return response()->json([
            'message' => 'Password updated. The user has been signed out on other devices.',
        ]);
    }

    /**
     * Email the standard reset link to an account. The administrator never
     * sees the token; the owner completes the reset themselves.
     */
    public function sendPasswordReset(Request $request, User $user): JsonResponse
    {
        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'user' => 'Reactivate this account before sending a password reset link.',
            ]);
        }

        $token = Password::broker()->createToken($user);
        $frontend = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $resetUrl = $frontend.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email);

        $sent = app(MailService::class)->sendEvent($user, 'password_reset', [
            'reset_url' => $resetUrl,
            'action_url' => $resetUrl,
        ], $user);

        $this->audit->log('user.password_reset_sent', $user, [], ['email' => $user->email]);

        return response()->json([
            'message' => $sent
                ? 'A password reset link has been emailed to '.$user->email.'.'
                : 'Email delivery is disabled, so no reset link was sent. Configure email first.',
            'sent' => (bool) $sent,
        ]);
    }

    private function detail(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'role' => $user->role?->name,
            'role_label' => $user->role?->label,
            'avatar_url' => $user->avatar_url,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'created_at' => $user->created_at?->toIso8601String(),
            'orders_count' => $user->orders_count ?? $user->orders()->count(),
            'support_tickets_count' => SupportTicket::where('user_id', $user->id)->count(),
            'conversations_count' => ConversationParticipant::where('user_id', $user->id)->count(),
            'seller_profile' => $user->sellerProfile ? [
                'business_name' => $user->sellerProfile->business_name,
                'status' => $user->sellerProfile->status,
                'store' => $user->sellerProfile->store ? [
                    'id' => $user->sellerProfile->store->id,
                    'name' => $user->sellerProfile->store->name,
                    'slug' => $user->sellerProfile->store->slug,
                    'status' => $user->sellerProfile->store->status,
                ] : null,
            ] : null,
        ];
    }

    public function updateStatus(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['active', 'suspended'])],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);
        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages(['user' => 'You cannot change your own account status.']);
        }
        $user->update(['status' => $data['status'], 'suspended_reason' => $data['status'] === 'suspended' ? ($data['reason'] ?? 'Suspended by administrator') : null]);
        if ($data['status'] === 'suspended') {
            $user->tokens()->delete();
            $this->notifications->send(
                $user,
                'account.suspended',
                'Account suspended',
                'Your account has been suspended. Reason: '.($data['reason'] ?? 'Suspended by administrator'),
                '/support',
                ['reason' => $data['reason'] ?? 'Suspended by administrator'],
                'account_suspended',
            );
        }
        $this->audit->log('user.status_changed', $user, [], ['status' => $data['status'], 'reason' => $data['reason'] ?? null]);

        return response()->json(['message' => 'User status updated.']);
    }

    public function updateRole(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['role' => ['required', 'string', 'exists:roles,name']]);
        if ($user->id === $request->user()->id && $data['role'] !== 'admin') {
            throw ValidationException::withMessages(['role' => 'You cannot remove your own administrator role.']);
        }
        $role = Role::where('name', $data['role'])->firstOrFail();
        $old = $user->role?->name;
        $user->update(['role_id' => $role->id]);
        $this->audit->log('user.role_changed', $user, ['role' => $old], ['role' => $role->name]);

        return response()->json(['message' => 'User role updated.']);
    }
}

<?php

namespace App\Providers;

use App\Plugins\PluginManager;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PluginManager::class);
    }

    public function boot(): void
    {
        Gate::before(function ($user) {
            return $user->isAdmin() ? true : null;
        });

        // Load enabled plugins and register their hooks. Failures are logged
        // by the manager and must never take the storefront down.
        app(PluginManager::class)->boot();

        ResetPassword::createUrlUsing(function ($user, string $token) {
            return rtrim(config('app.frontend_url', config('app.url')), '/')
                .'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email);
        });

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(6)->by(Str::lower($request->input('email')).'|'.$request->ip()));
        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));
        RateLimiter::for('password-reset', fn (Request $request) => Limit::perMinute(4)->by($request->ip()));
        RateLimiter::for('checkout', fn (Request $request) => Limit::perMinute(12)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('support', fn (Request $request) => Limit::perMinute(10)->by($request->user()?->id ?: $request->ip()));
    }
}

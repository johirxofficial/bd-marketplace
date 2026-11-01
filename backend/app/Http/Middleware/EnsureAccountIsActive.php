<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks suspended accounts from every authenticated area, even if they hold
 * a still-valid session or API token. Runs after Sanctum has resolved the user.
 */
class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->status !== 'active') {
            abort(403, 'This account is suspended. Contact support for help.');
        }

        return $next($request);
    }
}

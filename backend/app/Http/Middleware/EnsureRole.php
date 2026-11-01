<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        abort_unless($user, 401, 'Unauthenticated.');
        abort_unless($user->role && in_array($user->role->name, $roles, true), 403, 'You do not have access to this area.');

        return $next($request);
    }
}

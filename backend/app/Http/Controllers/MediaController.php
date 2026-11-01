<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MediaController extends Controller
{
    public function show(Request $request, string $path): BinaryFileResponse
    {
        abort_if(str_contains($path, '..') || str_starts_with($path, '/') || str_contains($path, "\0"), 404);

        $root = realpath(storage_path('app/uploads'));
        $full = realpath(storage_path('app/uploads/'.$path));
        abort_unless($root && $full && str_starts_with($full, $root) && is_file($full), 404);

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($full);
        abort_unless(in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'], true), 404);

        return response()->file($full, [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=604800, immutable',
        ]);
    }
}

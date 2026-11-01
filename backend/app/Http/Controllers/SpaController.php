<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

class SpaController extends Controller
{
    /**
     * Serve the built React single-page application.
     *
     * The frontend is compiled into public/app by Vite. Every non-API,
     * non-media route falls through to the same document so client-side
     * routing works on a hard refresh.
     */
    public function __invoke(): Response
    {
        $index = public_path('app/index.html');

        abort_unless(is_file($index), 503, 'The storefront has not been built yet. Run the production frontend build.');

        return response(
            (string) file_get_contents($index),
            200,
            [
                'Content-Type' => 'text/html; charset=UTF-8',
                'Cache-Control' => 'no-cache, must-revalidate',
            ],
        );
    }
}

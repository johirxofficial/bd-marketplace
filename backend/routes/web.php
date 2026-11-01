<?php

use App\Http\Controllers\MediaController;
use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web routes
|--------------------------------------------------------------------------
|
| The API lives under /api/v1 and is registered separately. Uploaded media
| is streamed through a controller so files can stay outside the public
| document root. Everything else is the React single-page application.
|
*/

Route::get('/', SpaController::class);

Route::get('/media/{path}', [MediaController::class, 'show'])->where('path', '.*');

Route::get('/{any?}', SpaController::class)
    ->where('any', '^(?!api/|sanctum/|media/|up$).*$');

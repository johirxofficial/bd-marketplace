<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    public function __construct(private readonly MediaService $media) {}

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,webp'],
            'folder' => ['nullable', 'in:products,support,branding'],
        ]);

        $path = $this->media->storeImage($request->file('image'), $request->input('folder', 'products'));

        return response()->json([
            'message' => 'Image uploaded.',
            'path' => $path,
            'url' => url('/media/'.$path),
        ], 201);
    }
}

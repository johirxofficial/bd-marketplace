<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;

class BrandController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'brands' => Brand::where('is_active', true)->whereHas('products', fn ($q) => $q->visible())->orderBy('name')->get(),
        ]);
    }
}

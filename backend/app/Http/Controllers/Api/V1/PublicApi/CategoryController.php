<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $categories = Category::where('is_active', true)->whereNull('parent_id')
            ->with(['children' => fn ($q) => $q->where('is_active', true)->withCount(['products' => fn ($p) => $p->visible()])])
            ->orderBy('sort_order')->get();

        return response()->json(['categories' => $categories]);
    }

    public function show(string $slug): JsonResponse
    {
        $category = Category::where('slug', $slug)->where('is_active', true)
            ->with(['children' => fn ($q) => $q->where('is_active', true), 'parent'])->firstOrFail();

        return response()->json(['category' => $category]);
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Requests\Admin\BrandRequest;
use App\Http\Requests\Admin\CategoryRequest;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminCatalogController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function categories(): JsonResponse
    {
        $categories = Category::with('parent:id,name')->withCount(['products', 'children'])->orderBy('sort_order')->get();

        return response()->json(['categories' => $categories]);
    }

    public function storeCategory(CategoryRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['slug'] = $this->uniqueSlug(Category::class, $data['slug'] ?? $data['name']);
        $category = Category::create($data);
        $this->audit->log('category.created', $category, [], $category->toArray());

        return response()->json(['message' => 'Category created.', 'category' => $category], 201);
    }

    public function updateCategory(CategoryRequest $request, Category $category): JsonResponse
    {
        $data = $request->validated();
        if (! empty($data['parent_id']) && (int) $data['parent_id'] === $category->id) {
            throw ValidationException::withMessages(['parent_id' => 'A category cannot be its own parent.']);
        }
        if (! empty($data['parent_id']) && $this->isDescendant($category, (int) $data['parent_id'])) {
            throw ValidationException::withMessages(['parent_id' => 'A category cannot be moved under one of its children.']);
        }
        $data['slug'] = $this->uniqueSlug(Category::class, $data['slug'] ?? $data['name'], $category->id);
        $old = $category->only(['name', 'slug', 'parent_id', 'is_active']);
        $category->update($data);
        $this->audit->log('category.updated', $category, $old, $data);

        return response()->json(['message' => 'Category updated.', 'category' => $category->fresh()]);
    }

    public function destroyCategory(Category $category): JsonResponse
    {
        if ($category->products()->exists()) {
            throw ValidationException::withMessages(['category' => 'Move or remove products before deleting this category.']);
        }
        if ($category->children()->exists()) {
            throw ValidationException::withMessages(['category' => 'Remove child categories before deleting this category.']);
        }
        $category->delete();
        $this->audit->log('category.deleted', $category, $category->toArray(), []);

        return response()->json(['message' => 'Category deleted.']);
    }

    public function brands(): JsonResponse
    {
        return response()->json(['brands' => Brand::withCount('products')->orderBy('name')->get()]);
    }

    public function storeBrand(BrandRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['slug'] = $this->uniqueSlug(Brand::class, $data['slug'] ?? $data['name']);
        $brand = Brand::create($data);
        $this->audit->log('brand.created', $brand, [], $brand->toArray());

        return response()->json(['message' => 'Brand created.', 'brand' => $brand], 201);
    }

    public function updateBrand(BrandRequest $request, Brand $brand): JsonResponse
    {
        $data = $request->validated();
        $data['slug'] = $this->uniqueSlug(Brand::class, $data['slug'] ?? $data['name'], $brand->id);
        $brand->update($data);
        $this->audit->log('brand.updated', $brand, [], $data);

        return response()->json(['message' => 'Brand updated.', 'brand' => $brand->fresh()]);
    }

    public function destroyBrand(Brand $brand): JsonResponse
    {
        if ($brand->products()->exists()) {
            throw ValidationException::withMessages(['brand' => 'Remove products from this brand before deleting it.']);
        }
        $brand->delete();
        $this->audit->log('brand.deleted', $brand, $brand->toArray(), []);

        return response()->json(['message' => 'Brand deleted.']);
    }

    private function uniqueSlug(string $model, string $value, ?int $ignoreId = null): string
    {
        $base = Str::slug($value) ?: 'item';
        $slug = $base;
        $i = 2;
        while ($model::where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    private function isDescendant(Category $category, int $candidateParentId): bool
    {
        return Category::where('id', $candidateParentId)->where('parent_id', $category->id)->exists()
            || Category::where('parent_id', $candidateParentId)->where('parent_id', $category->id)->exists();
    }
}

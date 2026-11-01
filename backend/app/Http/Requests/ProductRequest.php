<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user) {
            return false;
        }

        // Updates must target a product owned by the acting seller. Doing this
        // here means another seller's listing is rejected before validation
        // rules run (and before any write).
        $product = $this->route('product');

        if ($product instanceof \App\Models\Product) {
            $storeId = $user->sellerProfile?->store?->id;

            return $storeId !== null && $product->store_id === $storeId;
        }

        return true;
    }

    public function rules(): array
    {
        $productId = $this->route('product')?->id;

        return [
            'name' => ['required', 'string', 'min:3', 'max:200'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'description' => ['required', 'string', 'min:20', 'max:20000'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'base_price' => ['required', 'numeric', 'min:1', 'max:9999999'],
            'compare_at_price' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'gt:base_price'],
            'specifications' => ['nullable', 'array', 'max:30'],
            'specifications.*.name' => ['required_with:specifications', 'string', 'max:80'],
            'specifications.*.value' => ['required_with:specifications', 'string', 'max:300'],
            'images' => ['nullable', 'array', 'max:6'],
            'images.*' => ['string', 'max:255'],
            'variants' => ['required', 'array', 'min:1', 'max:20'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.name' => ['required', 'string', 'max:100'],
            'variants.*.sku' => ['required', 'string', 'max:80', 'distinct'],
            'variants.*.price' => ['required', 'numeric', 'min:1', 'max:9999999'],
            'variants.*.compare_at_price' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'variants.*.stock' => ['required', 'integer', 'min:0', 'max:1000000'],
            'variants.*.weight_grams' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'variants.*.is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
        ];
    }
}

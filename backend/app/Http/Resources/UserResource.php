<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'status' => $this->status,
            'avatar_path' => $this->avatar_path,
            'avatar_url' => $this->avatar_url,
            'role' => $this->role?->name,
            'role_label' => $this->role?->label,
            'permissions' => $this->role?->permissions->pluck('name')->values() ?? [],
            'seller_profile' => $this->whenLoaded('sellerProfile', fn () => ($this->sellerProfile ? [
                'id' => $this->sellerProfile->id,
                'business_name' => $this->sellerProfile->business_name,
                'business_type' => $this->sellerProfile->business_type,
                'phone' => $this->sellerProfile->phone,
                'status' => $this->sellerProfile->status,
                'commission_rate' => $this->sellerProfile->commission_rate,
                'rejection_reason' => $this->sellerProfile->rejection_reason,
                'store' => $this->sellerProfile->relationLoaded('store') && $this->sellerProfile->store ? [
                    'id' => $this->sellerProfile->store->id,
                    'name' => $this->sellerProfile->store->name,
                    'slug' => $this->sellerProfile->store->slug,
                    'description' => $this->sellerProfile->store->description,
                    'status' => $this->sellerProfile->store->status,
                    'logo_path' => $this->sellerProfile->store->logo_path,
                    'banner_path' => $this->sellerProfile->store->banner_path,
                ] : null,
            ] : null)),
            'customer_profile' => $this->whenLoaded('customerProfile', fn () => ($this->customerProfile ? [
                'date_of_birth' => $this->customerProfile->date_of_birth?->toDateString(),
                'gender' => $this->customerProfile->gender,
            ] : null)),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

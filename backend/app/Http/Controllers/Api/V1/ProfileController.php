<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'user' => new UserResource($request->user()->load(['role.permissions', 'customerProfile', 'sellerProfile.store'])),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/', Rule::unique('users', 'phone')->ignore($user->id)],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', 'in:male,female,other'],
        ]);

        $user->update(['name' => $data['name'], 'phone' => $data['phone'] ?? null]);
        $user->customerProfile()->updateOrCreate([], [
            'date_of_birth' => $data['date_of_birth'] ?? null,
            'gender' => $data['gender'] ?? null,
        ]);

        return response()->json([
            'message' => 'Profile updated.',
            'user' => new UserResource($user->fresh(['role.permissions', 'customerProfile', 'sellerProfile.store'])),
        ]);
    }
}

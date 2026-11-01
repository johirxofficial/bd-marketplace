<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Requests\Admin\BannerRequest;
use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;

class AdminBannerController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['banners' => Banner::orderBy('placement')->orderBy('sort_order')->get()]);
    }

    public function store(BannerRequest $request): JsonResponse
    {
        $banner = Banner::create($request->validated());
        $this->audit->log('banner.created', $banner, [], $banner->toArray());

        return response()->json(['message' => 'Banner created.', 'banner' => $banner], 201);
    }

    public function update(BannerRequest $request, Banner $banner): JsonResponse
    {
        $old = $banner->toArray();
        $banner->update($request->validated());
        $this->audit->log('banner.updated', $banner, $old, $banner->toArray());

        return response()->json(['message' => 'Banner updated.', 'banner' => $banner->fresh()]);
    }

    public function destroy(Banner $banner): JsonResponse
    {
        $banner->delete();
        $this->audit->log('banner.deleted', $banner, $banner->toArray(), []);

        return response()->json(['message' => 'Banner deleted.']);
    }
}

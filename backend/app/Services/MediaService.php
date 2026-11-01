<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MediaService
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    public function storeImage(UploadedFile $file, string $folder = 'products'): string
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages(['image' => 'The upload did not complete.']);
        }

        if ($file->getSize() > self::MAX_BYTES) {
            throw ValidationException::withMessages(['image' => 'Images may not exceed 5 MB.']);
        }

        $mime = $file->getMimeType();
        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        if (! isset($allowed[$mime])) {
            throw ValidationException::withMessages(['image' => 'Only JPG, PNG, and WebP images are allowed.']);
        }

        $dir = storage_path('app/uploads/'.$folder.'/'.now()->format('Y/m'));
        if (! is_dir($dir) && ! mkdir($dir, 0750, true) && ! is_dir($dir)) {
            throw new \RuntimeException('Unable to create upload directory.');
        }

        $name = Str::random(32).'.'.$allowed[$mime];
        $file->move($dir, $name);

        return $folder.'/'.now()->format('Y/m').'/'.$name;
    }

    public function delete(?string $path): void
    {
        if (! $path || (! str_starts_with($path, 'products/') && ! str_starts_with($path, 'support/') && ! str_starts_with($path, 'branding/'))) {
            return;
        }

        $full = realpath(storage_path('app/uploads/'.$path));
        $root = realpath(storage_path('app/uploads'));
        if ($full && $root && str_starts_with($full, $root) && is_file($full)) {
            @unlink($full);
        }
    }
}

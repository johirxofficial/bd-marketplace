<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TrackingEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        return [
            'status' => ['required', 'in:picked_up,in_transit,out_for_delivery,delivered,failed_delivery,returned_to_origin'],
            'location' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:255'],
            'happened_at' => ['nullable', 'date', 'before_or_equal:now'],
        ];
    }
}

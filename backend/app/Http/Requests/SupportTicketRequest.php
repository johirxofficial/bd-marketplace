<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SupportTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'min:5', 'max:160'],
            'category' => ['required', 'in:order,payment,delivery,return,account,product,other'],
            'priority' => ['sometimes', 'in:low,normal,high,urgent'],
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
            'message' => ['required', 'string', 'min:5', 'max:5000'],
        ];
    }
}

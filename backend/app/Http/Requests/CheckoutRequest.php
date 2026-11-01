<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    /**
     * Accept the idempotency key either as a header (preferred by API clients)
     * or in the JSON body, then validate a single normalised value.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->filled('idempotency_key') && $this->header('Idempotency-Key')) {
            $this->merge(['idempotency_key' => $this->header('Idempotency-Key')]);
        }
    }

    public function rules(): array
    {
        return [
            'address_id' => ['required', 'integer', 'exists:addresses,id'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'customer_note' => ['nullable', 'string', 'max:1000'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'sender_number' => ['nullable', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/'],
            'transaction_id' => ['nullable', 'string', 'min:4', 'max:100'],
            'idempotency_key' => ['required', 'string', 'min:10', 'max:100'],
        ];
    }
}

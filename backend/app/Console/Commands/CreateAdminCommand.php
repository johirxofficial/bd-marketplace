<?php

namespace App\Console\Commands;

use App\Models\Cart;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class CreateAdminCommand extends Command
{
    protected $signature = 'marketplace:create-admin
        {--name=Marketplace Administrator : Administrator name}
        {--email= : Administrator email}
        {--password= : Password (omit to generate a random password)}
        {--force : Update the role if the user already exists}';

    protected $description = 'Securely bootstrap or promote an administrator account';

    public function handle(): int
    {
        $email = strtolower((string) ($this->option('email') ?: $this->ask('Administrator email')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('A valid email address is required.');

            return self::FAILURE;
        }

        $password = $this->option('password');
        $generated = false;
        if (! $password) {
            $password = Str::password(20, symbols: true);
            $generated = true;
        }
        if (strlen($password) < 12) {
            $this->error('The password must be at least 12 characters.');

            return self::FAILURE;
        }

        $role = Role::where('name', 'admin')->firstOrFail();
        $existing = User::where('email', $email)->first();

        if ($existing) {
            if (! $this->option('force')) {
                $this->error('A user with this email already exists. Use --force to promote them.');

                return self::FAILURE;
            }
            $existing->update(['role_id' => $role->id, 'status' => 'active', 'password' => Hash::make($password)]);
            $this->info("Existing user {$email} promoted to administrator and password reset.");
        } else {
            $user = User::create([
                'name' => $this->option('name'),
                'email' => $email,
                'password' => Hash::make($password),
                'role_id' => $role->id,
                'status' => 'active',
                'email_verified_at' => now(),
            ]);
            Cart::firstOrCreate(['user_id' => $user->id], ['status' => 'active']);
            $this->info("Administrator {$email} created.");
        }

        if ($generated) {
            $this->warn('Generated password (save it now, it will not be shown again):');
            $this->line($password);
        }

        return self::SUCCESS;
    }
}

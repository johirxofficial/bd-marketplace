<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            ['dashboard.view', 'View dashboard', 'dashboard'],
            ['users.manage', 'Manage users and roles', 'users'],
            ['sellers.manage', 'Manage sellers', 'sellers'],
            ['products.moderate', 'Moderate products', 'catalog'],
            ['catalog.manage', 'Manage categories and brands', 'catalog'],
            ['orders.manage', 'Manage orders', 'orders'],
            ['payments.manage', 'Verify manual payments and configure gateways', 'payments'],
            ['refunds.manage', 'Manage returns and refunds', 'payments'],
            ['shipping.manage', 'Manage shipping zones', 'shipping'],
            ['promotions.manage', 'Manage coupons and banners', 'marketing'],
            ['reviews.moderate', 'Moderate reviews', 'catalog'],
            ['support.manage', 'Manage support tickets', 'support'],
            ['reports.view', 'View reports', 'reports'],
            ['settings.manage', 'Manage platform settings', 'settings'],
            ['audit.view', 'View audit logs', 'security'],
            ['settlements.manage', 'Manage seller settlements', 'finance'],
            ['sms.manage', 'Manage SMS gateways, templates, and messages', 'notifications'],
            ['email.manage', 'Manage email settings, templates, campaigns, and logs', 'notifications'],
            ['plugins.manage', 'Enable, disable, and synchronize plugins', 'plugins'],
            ['developer.manage', 'Manage API tokens and webhooks', 'developer'],
        ];

        foreach ($permissions as [$name, $label, $group]) {
            Permission::updateOrCreate(['name' => $name], ['label' => $label, 'group' => $group]);
        }

        $roles = [
            'admin' => ['label' => 'Administrator', 'description' => 'Full platform access.', 'permissions' => '*'],
            'manager' => ['label' => 'Marketplace Manager', 'description' => 'Operations and catalog management.', 'permissions' => [
                'dashboard.view', 'sellers.manage', 'products.moderate', 'catalog.manage', 'orders.manage',
                'payments.manage', 'refunds.manage', 'shipping.manage', 'promotions.manage', 'reviews.moderate',
                'reports.view', 'settlements.manage', 'sms.manage', 'email.manage',
            ]],
            'support' => ['label' => 'Support Agent', 'description' => 'Customer support access.', 'permissions' => [
                'dashboard.view', 'support.manage', 'orders.manage', 'refunds.manage',
            ]],
            'seller' => ['label' => 'Seller', 'description' => 'Approved marketplace seller.', 'permissions' => []],
            'customer' => ['label' => 'Customer', 'description' => 'Marketplace shopper.', 'permissions' => []],
        ];

        foreach ($roles as $name => $definition) {
            $role = Role::updateOrCreate(['name' => $name], [
                'label' => $definition['label'],
                'description' => $definition['description'],
            ]);
            $ids = $definition['permissions'] === '*'
                ? Permission::pluck('id')
                : Permission::whereIn('name', $definition['permissions'])->pluck('id');
            $role->permissions()->sync($ids);
        }
    }
}

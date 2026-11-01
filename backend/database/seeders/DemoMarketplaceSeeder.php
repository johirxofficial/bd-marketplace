<?php

namespace Database\Seeders;

use App\Enums\OrderStatus;
use App\Models\Address;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Cart;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\CustomerProfile;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Promotion;
use App\Models\Review;
use App\Models\Role;
use App\Models\SellerProfile;
use App\Models\Store;
use App\Models\User;
use App\Services\CheckoutService;
use App\Services\OrderService;
use App\Services\ProductRatingService;
use App\Services\ShipmentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoMarketplaceSeeder extends Seeder
{
    private string $demoPassword;
    private int $imageCounter = 0;

    public function run(): void
    {
        if (Product::withTrashed()->exists()) {
            $this->command?->warn('Demo catalog already exists; skipping demo seeding.');

            return;
        }

        $this->demoPassword = env('DEMO_PASSWORD') ?: Str::password(16, symbols: true);

        $categories = $this->seedCategories();
        $brands = $this->seedBrands();
        [$customer, $sellers] = $this->seedUsersAndStores();

        $this->seedProducts($categories, $brands, $sellers);
        $this->seedMarketing($categories, $brands);
        $this->seedDemoOrders($customer, $sellers);

        $path = dirname(base_path()).'/.demo-credentials';
        @file_put_contents($path, "BD Marketplace demo accounts\nCustomer: customer@bdmarketplace.test\nSeller 1: tech@bdmarketplace.test\nSeller 2: style@bdmarketplace.test\nSeller 3: essentials@bdmarketplace.test\nPassword: {$this->demoPassword}\n");
        @chmod($path, 0600);

        $this->command?->info('Demo catalog, sellers, customer, orders, and images created.');
        $this->command?->info('Demo account credentials: '.$path);
    }

    private function seedCategories(): array
    {
        $tree = [
            'Electronics' => ['Mobile Phones', 'Laptops', 'Audio & Headphones', 'Cameras', 'Wearables'],
            'Fashion' => ["Men's Clothing", "Women's Clothing", 'Shoes', 'Bags & Accessories'],
            'Home & Living' => ['Kitchen & Dining', 'Furniture', 'Home Appliances', 'Home Decor'],
            'Beauty & Health' => ['Skin Care', 'Fragrance'],
            'Groceries' => [],
            'Sports & Outdoor' => [],
            'Baby & Kids' => [],
        ];
        $out = [];
        foreach ($tree as $parentName => $children) {
            $parent = Category::create([
                'name' => $parentName,
                'slug' => Str::slug($parentName),
                'description' => "Shop {$parentName} from verified sellers across Bangladesh.",
                'sort_order' => count($out),
                'is_active' => true,
            ]);
            $out[Str::slug($parentName)] = $parent;
            foreach ($children as $childName) {
                $child = Category::create([
                    'parent_id' => $parent->id,
                    'name' => $childName,
                    'slug' => Str::slug($parentName.'-'.$childName),
                    'sort_order' => 0,
                    'is_active' => true,
                ]);
                $out[$child->slug] = $child;
            }
        }

        return $out;
    }

    private function seedBrands(): array
    {
        $names = ['Samsung', 'Xiaomi', 'Realme', 'Walton', 'HP', 'Lenovo', 'Asus', 'Anker', 'JBL', 'Sony', 'Canon', 'Bata', 'Lotto', 'Aarong', 'Otobi', 'Apex', 'Fresh', 'Pran', 'Square', 'Nivea', 'Jovan', 'Yonex', 'Philips', 'RFL'];
        $out = [];
        foreach ($names as $name) {
            $out[Str::slug($name)] = Brand::create(['name' => $name, 'slug' => Str::slug($name), 'is_active' => true]);
        }

        return $out;
    }

    private function seedUsersAndStores(): array
    {
        $sellerRole = Role::where('name', 'seller')->firstOrFail();
        $customerRole = Role::where('name', 'customer')->firstOrFail();
        $hash = Hash::make($this->demoPassword);

        $stores = [
            ['tech@bdmarketplace.test', 'Dhaka Tech Hub', 'Rafiq Hasan', '01711000001', 'Dhaka Tech Hub', 'Verified electronics seller offering genuine handsets, computers, audio, and home appliances with warranty support.', 8.00],
            ['style@bdmarketplace.test', 'Style Bazaar BD', 'Nusrat Jahan', '01711000002', 'Style Bazaar BD', 'Contemporary Bangladeshi fashion, footwear, bags, and home furniture curated for everyday value.', 10.00],
            ['essentials@bdmarketplace.test', 'Everyday Essentials', 'Imran Ahmed', '01711000003', 'Everyday Essentials', 'Groceries, personal care, sports, and family essentials from trusted local brands.', 12.00],
        ];

        $sellerRecords = [];
        foreach ($stores as [$email, $business, $person, $phone, $storeName, $description, $commission]) {
            $user = User::create([
                'name' => $person, 'email' => $email, 'phone' => $phone,
                'password' => $hash, 'role_id' => $sellerRole->id, 'status' => 'active',
                'email_verified_at' => now(),
            ]);
            $profile = SellerProfile::create([
                'user_id' => $user->id, 'business_name' => $business, 'business_type' => 'sole_proprietorship',
                'phone' => $phone, 'business_address' => 'Dhaka, Bangladesh', 'status' => 'approved',
                'commission_rate' => $commission, 'approved_at' => now(),
            ]);
            $store = Store::create([
                'seller_id' => $profile->id, 'name' => $storeName, 'slug' => Str::slug($storeName),
                'description' => $description, 'status' => 'active', 'rating_avg' => 0, 'rating_count' => 0,
            ]);
            $sellerRecords[$store->id] = ['user' => $user, 'profile' => $profile, 'store' => $store];
        }

        $customer = User::create([
            'name' => 'Ayesha Rahman', 'email' => 'customer@bdmarketplace.test', 'phone' => '01811000009',
            'password' => $hash, 'role_id' => $customerRole->id, 'status' => 'active', 'email_verified_at' => now(),
        ]);
        CustomerProfile::create(['user_id' => $customer->id, 'gender' => 'female']);
        Cart::create(['user_id' => $customer->id, 'status' => 'active']);
        Address::create([
            'user_id' => $customer->id, 'label' => 'Home', 'recipient_name' => 'Ayesha Rahman',
            'phone' => '01811000009', 'division' => 'Dhaka', 'district' => 'Dhaka',
            'upazila' => 'Gulshan', 'area' => 'Gulshan 2', 'street_address' => 'House 12, Road 5, Gulshan 2',
            'postal_code' => '1212', 'is_default' => true,
        ]);

        return [$customer, $sellerRecords];
    }

    private function seedProducts(array $categories, array $brands, array $sellers): void
    {
        $s1 = $sellers[Store::where('slug', 'dhaka-tech-hub')->firstOrFail()->id]['store'];
        $s2 = $sellers[Store::where('slug', 'style-bazaar-bd')->firstOrFail()->id]['store'];
        $s3 = $sellers[Store::where('slug', 'everyday-essentials')->firstOrFail()->id]['store'];

        $rows = [
            // store, category slug, brand slug, name, short, description, variants [name, price, compare, stock], specs, featured, promo
            [$s1, 'electronics-mobile-phones', 'samsung', 'Samsung Galaxy A55 5G', '6.6" AMOLED, 50MP OIS camera, 5000mAh battery', 'A dependable 5G smartphone with a bright Super AMOLED display, optical image stabilisation, and long battery life. Local warranty from an authorised seller.', [['8GB / 128GB Awesome Navy', 42999, 48999, 18], ['8GB / 256GB Awesome Iceblue', 46999, 52999, 10]], ['Display' => '6.6 inch Super AMOLED 120Hz', 'Camera' => '50MP OIS + 12MP ultrawide', 'Battery' => '5000mAh, 25W', 'Warranty' => '1 year official warranty'], true, 12],
            [$s1, 'electronics-mobile-phones', 'xiaomi', 'Xiaomi Redmi Note 13', '108MP camera, 120Hz AMOLED, 33W fast charge', 'A balanced mid-range phone with a sharp display, generous storage, and fast charging. Ideal for photography and all-day use.', [['6GB / 128GB Midnight Black', 24999, 27999, 25], ['8GB / 256GB Ocean Sunset', 28499, 31999, 15]], ['Display' => '6.67 inch AMOLED 120Hz', 'Camera' => '108MP main camera', 'Battery' => '5000mAh, 33W', 'Warranty' => '1 year official warranty'], true, 10],
            [$s1, 'electronics-mobile-phones', 'realme', 'realme C67', 'Slim design, 33W charge, 90Hz display', 'Everyday performance with a clean design and dependable battery life at an accessible price.', [['8GB / 128GB Sunny Oasis', 19999, 21999, 30]], ['Display' => '6.72 inch 90Hz', 'Camera' => '50MP AI camera', 'Battery' => '5000mAh, 33W'], false, null],
            [$s1, 'electronics-mobile-phones', 'walton', 'Walton NEXG N7', 'Locally assembled smartphone with official support', 'A practical smartphone backed by Walton service centres across Bangladesh.', [['4GB / 64GB Blue', 15999, 16999, 22]], ['Display' => '6.52 inch HD+', 'Battery' => '5000mAh', 'Warranty' => '1 year'], false, null],
            [$s1, 'electronics-laptops', 'hp', 'HP Pavilion 14', 'Lightweight 14-inch laptop for work and study', 'A portable aluminium laptop with a comfortable keyboard, fast SSD, and dependable battery life.', [['Core i5 / 8GB / 512GB', 89990, 95990, 8], ['Core i7 / 16GB / 512GB', 109990, 116990, 5]], ['Processor' => '13th Gen Intel Core', 'Display' => '14 inch FHD IPS', 'Storage' => '512GB NVMe SSD', 'Warranty' => '2 years'], true, 8],
            [$s1, 'electronics-laptops', 'lenovo', 'Lenovo IdeaPad Slim 3', 'Everyday 15-inch laptop with 16GB memory', 'A reliable laptop for office work, online classes, and light creative tasks.', [['Ryzen 5 / 16GB / 512GB', 64990, 69990, 10]], ['Processor' => 'AMD Ryzen 5', 'Display' => '15.6 inch FHD', 'Memory' => '16GB DDR5'], false, null],
            [$s1, 'electronics-laptops', 'asus', 'Asus Vivobook 15', 'Thin-bezel display and fast SSD storage', 'A well-rounded everyday laptop with a backlit keyboard and modern connectivity.', [['Core i5 / 16GB / 512GB', 72990, 78990, 7]], ['Processor' => 'Intel Core i5', 'Display' => '15.6 inch FHD', 'Storage' => '512GB SSD'], false, null],
            [$s1, 'electronics-audio-headphones', 'anker', 'Anker Soundcore Life Q30', 'Hybrid ANC over-ear headphones', 'Immersive sound, active noise cancellation, and up to 40 hours of playback.', [['Black', 6990, 7990, 20], ['Blue', 6990, 7990, 12]], ['Battery' => 'Up to 40 hours', 'Features' => 'Hybrid ANC, Bluetooth 5.0', 'Warranty' => '18 months'], true, null],
            [$s1, 'electronics-audio-headphones', 'jbl', 'JBL Go 4', 'Pocket-sized waterproof Bluetooth speaker', 'A compact speaker with punchy sound and IP67 water resistance for everyday use.', [['Black', 4990, 5490, 26], ['Blue', 4990, 5490, 14]], ['Battery' => 'Up to 7 hours', 'Protection' => 'IP67'], false, null],
            [$s1, 'electronics-audio-headphones', 'sony', 'Sony WH-CH520', 'Wireless on-ear headphones with long battery', 'Clear wireless audio, multipoint connection, and up to 50 hours of battery life.', [['Black', 7490, 8490, 13]], ['Battery' => 'Up to 50 hours', 'Connectivity' => 'Bluetooth 5.2'], false, 6],
            [$s1, 'electronics-cameras', 'canon', 'Canon EOS 250D', 'Beginner-friendly DSLR with 4K video', 'A lightweight DSLR with a guided interface, vari-angle screen, and excellent still-image quality.', [['Body only', 79990, 84990, 4], ['18-55mm kit', 89990, 95990, 3]], ['Sensor' => '24.1MP APS-C', 'Video' => '4K', 'Mount' => 'Canon EF-S'], true, null],
            [$s1, 'electronics-wearables', 'xiaomi', 'Xiaomi Smart Band 8', 'Fitness tracking with a bright AMOLED display', 'Track workouts, sleep, and heart rate with a lightweight band and long battery life.', [['Black', 4999, 5499, 35]], ['Display' => '1.62 inch AMOLED', 'Battery' => 'Up to 16 days'], false, null],
            [$s1, 'home-living-home-appliances', 'walton', 'Walton 1.5 Ton Inverter AC', 'Energy-efficient inverter air conditioner', 'A 1.5-ton inverter AC suited to Bangladeshi summers, with official installation support.', [['1.5 Ton', 69990, 75990, 6]], ['Capacity' => '1.5 Ton', 'Type' => 'Inverter', 'Warranty' => 'Compressor warranty'], true, null],
            [$s1, 'home-living-home-appliances', 'walton', 'Walton Refrigerator 243L', 'Frost-free refrigerator with tempered glass shelves', 'A family-size refrigerator with efficient cooling and a modern finish.', [['243L', 58990, 62990, 5]], ['Capacity' => '243 litres', 'Type' => 'Frost free'], false, null],
            [$s1, 'home-living-kitchen-dining', 'philips', 'Philips Air Fryer', 'Rapid air technology with 4.1L basket', 'Crisp food with less oil using rapid air circulation and an easy-clean basket.', [['4.1L', 18990, 20990, 11]], ['Capacity' => '4.1 litres', 'Power' => '1400W'], false, null],

            [$s2, 'fashion-mens-clothing', 'aarong', "Men's Cotton Panjabi", 'Handloom-inspired cotton panjabi', 'A breathable cotton panjabi with a clean cut for festivals and formal occasions.', [['M', 1890, 2190, 30], ['L', 1890, 2190, 35], ['XL', 1990, 2290, 25], ['XXL', 2090, 2390, 15]], ['Material' => '100% cotton', 'Fit' => 'Regular', 'Care' => 'Machine wash cold'], true, 15],
            [$s2, 'fashion-womens-clothing', 'aarong', "Women's Cotton Three Piece", 'Hand-block print cotton three piece', 'A coordinated three-piece set in breathable cotton with a matching dupatta.', [['M', 2450, 2890, 20], ['L', 2450, 2890, 24], ['XL', 2550, 2990, 18]], ['Material' => 'Cotton', 'Includes' => 'Kameez, salwar, dupatta'], true, 20],
            [$s2, 'fashion-shoes', 'bata', 'Bata Formal Leather Shoe', 'Classic leather formal shoe', 'A durable leather formal shoe for office and events.', [['40', 3990, 4490, 12], ['41', 3990, 4490, 16], ['42', 3990, 4490, 14], ['43', 4090, 4590, 10]], ['Upper' => 'Leather', 'Sole' => 'Rubber'], false, null],
            [$s2, 'fashion-shoes', 'lotto', 'Lotto Running Sneaker', 'Cushioned everyday running shoe', 'Lightweight sneakers with a breathable upper and cushioned sole.', [['40', 4590, 5290, 12], ['41', 4590, 5290, 15], ['42', 4590, 5290, 18], ['43', 4590, 5290, 10], ['44', 4690, 5390, 8]], ['Upper' => 'Mesh textile', 'Use' => 'Running, walking'], false, 10],
            [$s2, 'fashion-bags-accessories', 'aarong', 'Aarong Leather Tote Bag', 'Handcrafted leather tote', 'A spacious handcrafted tote with a cotton-lined interior and secure zip closure.', [['Tan', 5490, 6290, 9], ['Black', 5490, 6290, 7]], ['Material' => 'Leather', 'Closure' => 'Zip'], true, null],
            [$s2, 'home-living-furniture', 'otobi', 'Otobi Study Desk', 'Compact study desk with cable management', 'A sturdy study desk designed for home offices and student rooms.', [['Oak', 12990, 14990, 6]], ['Material' => 'Engineered wood', 'Assembly' => 'Included in Dhaka'], false, null],
            [$s2, 'fashion-shoes', 'apex', "Apex Men's Sandal", 'Comfortable everyday sandal', 'A lightweight sandal with a cushioned footbed for daily wear.', [['40', 1490, 1790, 20], ['41', 1490, 1790, 22], ['42', 1490, 1790, 18], ['43', 1490, 1790, 12]], ['Upper' => 'Synthetic', 'Sole' => 'EVA'], false, null],

            [$s3, 'groceries', 'fresh', 'Fresh Atta 5kg', 'Stone-ground whole wheat flour', 'A kitchen staple for soft roti and paratha, packed for freshness.', [['5kg', 420, 470, 60], ['10kg', 780, 870, 35]], ['Weight' => '5kg / 10kg', 'Origin' => 'Bangladesh'], false, 8],
            [$s3, 'groceries', 'pran', 'Pran Mustard Oil 2L', 'Strong-flavoured pure mustard oil', 'Traditional mustard oil for authentic Bangladeshi cooking.', [['2L', 620, 690, 40], ['5L', 1450, 1590, 20]], ['Volume' => '2L / 5L', 'Type' => 'Mustard oil'], false, null],
            [$s3, 'groceries', 'square', 'Square Toilet Cleaner 1L', 'Thick cleaning liquid for toilets', 'Removes stains and limescale with a long-lasting fragrance.', [['1L', 220, 245, 80]], ['Volume' => '1L', 'Pack' => 'Single bottle'], false, null],
            [$s3, 'beauty-health-skin-care', 'nivea', 'Nivea Face Wash', 'Gentle daily face wash', 'A mild cleanser for daily use that removes oil without drying the skin.', [['100ml', 450, 520, 45], ['150ml', 620, 700, 30]], ['Skin type' => 'All skin types', 'Volume' => '100ml / 150ml'], true, null],
            [$s3, 'beauty-health-fragrance', 'jovan', 'Jovan Musk Perfume', 'Warm musk eau de cologne', 'A classic musk fragrance with a warm, long-lasting finish.', [['100ml', 1290, 1590, 18]], ['Volume' => '100ml', 'Fragrance' => 'Musk'], false, null],
            [$s3, 'sports-outdoor', 'yonex', 'Yonex Badminton Racket', 'Lightweight graphite racket', 'A balanced racket for recreational and club-level badminton.', [['Graphite', 2490, 2890, 14]], ['Material' => 'Graphite', 'Weight' => '83g'], false, null],
            [$s3, 'baby-kids', 'bata', 'Bata School Shoes Kids', 'Durable school shoes for children', 'Comfortable everyday school shoes with a secure strap.', [['28', 1990, 2290, 16], ['30', 1990, 2290, 18], ['32', 2090, 2390, 14], ['34', 2090, 2390, 10]], ['Upper' => 'Synthetic', 'Closure' => 'Velcro'], false, null],
            [$s3, 'groceries', 'pran', 'Pran Frooto Mango Drink 1L', 'Ready-to-drink mango fruit beverage', 'A familiar mango drink for family meals and gatherings.', [['1L', 180, 200, 90]], ['Volume' => '1L', 'Flavour' => 'Mango'], false, null],
            [$s3, 'home-living-kitchen-dining', 'rfl', 'RFL Storage Container Set', 'Stackable airtight kitchen containers', 'A set of clear, airtight containers for pantry organisation.', [['3 pieces', 690, 790, 25]], ['Pieces' => '3', 'Material' => 'Food-grade plastic'], false, null],
        ];

        foreach ($rows as $index => [$store, $categorySlug, $brandSlug, $name, $short, $description, $variants, $specs, $featured, $promo]) {
            $category = $categories[$categorySlug] ?? null;
            $brand = $brands[$brandSlug] ?? null;
            if (! $category) {
                continue;
            }
            $slug = Str::slug($name);
            $product = Product::create([
                'store_id' => $store->id,
                'category_id' => $category->id,
                'brand_id' => $brand?->id,
                'name' => $name,
                'slug' => $slug,
                'sku' => 'BDM-'.strtoupper(Str::random(8)),
                'short_description' => $short,
                'description' => $description,
                'specifications' => $specs,
                'base_price' => min(array_column($variants, 1)),
                'compare_at_price' => max(array_column($variants, 2)),
                'status' => 'approved',
                'is_featured' => $featured,
                'rating_avg' => 0,
                'rating_count' => 0,
                'sold_count' => random_int(8, 160),
                'approved_at' => now(),
            ]);

            foreach ($variants as $vIndex => [$vName, $price, $compare, $stock]) {
                $variant = $product->variants()->create([
                    'name' => $vName,
                    'sku' => strtoupper(Str::slug($name)).'-'.($vIndex + 1).'-'.Str::upper(Str::random(3)),
                    'price' => $price,
                    'compare_at_price' => $compare,
                    'weight_grams' => 500,
                    'is_active' => true,
                ]);
                $variant->inventory()->create([
                    'quantity' => $stock,
                    'reserved_quantity' => 0,
                    'low_stock_threshold' => 5,
                ]);
            }

            foreach ([1, 2] as $imageNo) {
                $path = $this->makeImage($name, $category->name, $index, $imageNo);
                ProductImage::create([
                    'product_id' => $product->id,
                    'path' => $path,
                    'alt_text' => $name.' product image '.$imageNo,
                    'sort_order' => $imageNo - 1,
                    'is_primary' => $imageNo === 1,
                ]);
            }

            if ($promo) {
                Promotion::create([
                    'name' => 'Mega deal on '.$name,
                    'type' => 'percent',
                    'value' => $promo,
                    'product_id' => $product->id,
                    'starts_at' => now()->subDay(),
                    'ends_at' => now()->addDays(10),
                    'is_active' => true,
                ]);
            }
        }
    }

    private function seedMarketing(array $categories, array $brands): void
    {
        $banners = [
            ['Mega Tech Week', 'Save up to 25% on selected phones, laptops, and audio', '/products?category=electronics&sort=popular', 'home_hero', 0],
            ['Fashion Fest', 'Fresh looks for every occasion from verified boutiques', '/products?category=fashion', 'home_hero', 1],
            ['Everyday Essentials', 'Groceries and personal care delivered across Bangladesh', '/products?category=groceries', 'home_hero', 2],
            ['Cash on Delivery', 'Pay when your parcel arrives — check the item first', '/products', 'home_strip', 0],
            ['Verified Sellers', 'Shop confidently from approved stores with clear policies', '/support', 'home_strip', 1],
        ];
        foreach ($banners as [$title, $subtitle, $link, $placement, $sort]) {
            Banner::create([
                'title' => $title, 'subtitle' => $subtitle, 'link_url' => $link,
                'placement' => $placement, 'sort_order' => $sort, 'is_active' => true,
            ]);
        }

        Coupon::create([
            'code' => 'WELCOME10', 'description' => '10% off your first order (maximum ৳300)', 'type' => 'percent',
            'value' => 10, 'min_order_amount' => 1000, 'max_discount' => 300,
            'starts_at' => now()->subDay(), 'expires_at' => now()->addDays(60),
            'usage_limit' => 1000, 'used_count' => 0, 'per_user_limit' => 1,
            'applies_to' => 'all', 'is_active' => true,
        ]);
        Coupon::create([
            'code' => 'FLAT100', 'description' => '৳100 off orders over ৳500', 'type' => 'fixed',
            'value' => 100, 'min_order_amount' => 500,
            'starts_at' => now()->subDay(), 'expires_at' => now()->addDays(30),
            'usage_limit' => 500, 'used_count' => 0, 'per_user_limit' => 2,
            'applies_to' => 'all', 'is_active' => true,
        ]);
    }

    private function seedDemoOrders(User $customer, array $sellers): void
    {
        $address = $customer->addresses()->where('is_default', true)->firstOrFail();
        $coupon = Coupon::where('code', 'WELCOME10')->first();
        $checkout = app(CheckoutService::class);
        $orders = app(OrderService::class);
        $shipments = app(ShipmentService::class);

        $orderOne = $this->placeDemoOrder($customer, $address, $coupon, 'demo-order-delivered', [
            'samsung-galaxy-a55-5g' => 1,
            'mens-cotton-panjabi' => 2,
        ], 'Please call before delivery.');
        if ($orderOne) {
            foreach ($orderOne->sellerOrders as $sellerOrder) {
                $actor = User::findOrFail($sellerOrder->seller_id);
                $orders->transitionSellerOrder($sellerOrder, OrderStatus::Confirmed, $actor, 'Demo order confirmed');
                $orders->transitionSellerOrder($sellerOrder->fresh(), OrderStatus::Processing, $actor, 'Demo order processing');
                $orders->transitionSellerOrder($sellerOrder->fresh(), OrderStatus::ReadyToShip, $actor, 'Demo order packed');
                $shipment = $shipments->create($sellerOrder->fresh(), [
                    'courier_name' => 'Manual courier — demo',
                    'tracking_number' => 'BDM-DEMO-'.str_pad((string) $sellerOrder->id, 5, '0', STR_PAD_LEFT),
                    'location' => 'Dhaka',
                    'note' => 'Demo shipment created during seeding',
                ], $actor);
                $shipments->addEvent($shipment, [
                    'status' => 'delivered',
                    'location' => 'Customer address',
                    'note' => 'Delivered to customer',
                    'happened_at' => now()->subHours(6),
                ], $actor);
            }
            $orderOne = $orderOne->fresh(['items', 'sellerOrders']);
            $firstItem = $orderOne->items->first();
            if ($firstItem && ! Review::where('user_id', $customer->id)->where('product_id', $firstItem->product_id)->exists()) {
                Review::create([
                    'product_id' => $firstItem->product_id,
                    'user_id' => $customer->id,
                    'order_item_id' => $firstItem->id,
                    'rating' => 5,
                    'title' => 'Genuine product and quick delivery',
                    'comment' => 'The item matched the description and arrived safely. The seller answered my question before dispatch.',
                    'status' => 'approved',
                ]);
                app(ProductRatingService::class)->refresh($firstItem->product);
            }
        }

        $orderTwo = $this->placeDemoOrder($customer, $address, null, 'demo-order-shipped', [
            'lenovo-ideapad-slim-3' => 1,
        ], null);
        if ($orderTwo) {
            foreach ($orderTwo->sellerOrders as $sellerOrder) {
                $actor = User::findOrFail($sellerOrder->seller_id);
                $orders->transitionSellerOrder($sellerOrder, OrderStatus::Confirmed, $actor, 'Demo order confirmed');
                $orders->transitionSellerOrder($sellerOrder->fresh(), OrderStatus::Processing, $actor, 'Demo order processing');
                $orders->transitionSellerOrder($sellerOrder->fresh(), OrderStatus::ReadyToShip, $actor, 'Demo order packed');
                $shipments->create($sellerOrder->fresh(), [
                    'courier_name' => 'Manual courier — demo',
                    'tracking_number' => 'BDM-DEMO-'.str_pad((string) $sellerOrder->id, 5, '0', STR_PAD_LEFT),
                    'location' => 'Dhaka',
                ], $actor);
            }
        }

        $this->placeDemoOrder($customer, $address, null, 'demo-order-pending', [
            'nivea-face-wash' => 1,
            'fresh-atta-5kg' => 1,
        ], 'Please deliver after 5pm.');
    }

    private function placeDemoOrder(User $customer, Address $address, ?Coupon $coupon, string $key, array $items, ?string $note): ?\App\Models\Order
    {
        $cart = Cart::firstOrCreate(['user_id' => $customer->id], ['status' => 'active']);
        $cart->items()->delete();
        $cart->update(['coupon_id' => null, 'status' => 'active']);

        foreach ($items as $slug => $quantity) {
            $product = Product::where('slug', $slug)->with(['variants' => fn ($q) => $q->where('is_active', true)])->first();
            $variant = $product?->variants->first();
            if (! $variant) {
                $this->command?->warn("Demo order skipped: product {$slug} is missing.");

                continue;
            }
            $cart->items()->create([
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'quantity' => $quantity,
            ]);
        }

        if ($cart->items()->count() === 0) {
            return null;
        }

        $order = app(CheckoutService::class)->placeOrder(
            $customer,
            $cart->fresh(),
            $address,
            $coupon,
            $key.'-'.Str::lower(Str::random(10)),
            $note,
        );

        $this->command?->info("Demo order {$order->order_number} created with status {$order->status->value}.");

        return $order;
    }

    private function makeImage(string $name, string $category, int $index, int $imageNo): string
    {
        $this->imageCounter++;
        $dir = storage_path('app/uploads/products/'.now()->format('Y/m'));
        if (! is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        $palettes = [
            [[10, 61, 98], [32, 178, 170]], [[35, 37, 60], [242, 153, 74]], [[68, 33, 96], [229, 80, 115]],
            [[13, 71, 75], [84, 187, 137]], [[88, 24, 69], [255, 140, 105]], [[31, 64, 104], [100, 181, 246]],
            [[60, 61, 55], [191, 161, 96]], [[34, 49, 63], [46, 134, 171]],
        ];
        [$c1, $c2] = $palettes[$index % count($palettes)];
        if ($imageNo === 2) {
            [$c1, $c2] = [$c2, $c1];
        }
        $w = 800; $h = 800;
        $img = imagecreatetruecolor($w, $h);
        for ($y = 0; $y < $h; $y++) {
            $r = (int) ($c1[0] + ($c2[0] - $c1[0]) * $y / $h);
            $g = (int) ($c1[1] + ($c2[1] - $c1[1]) * $y / $h);
            $b = (int) ($c1[2] + ($c2[2] - $c1[2]) * $y / $h);
            imageline($img, 0, $y, $w, $y, imagecolorallocate($img, $r, $g, $b));
        }
        $soft = imagecolorallocatealpha($img, 255, 255, 255, 26);
        imagefilledellipse($img, 660, 140, 300, 300, $soft);
        imagefilledellipse($img, 110, 690, 240, 240, $soft);
        $white = imagecolorallocate($img, 255, 255, 255);
        $muted = imagecolorallocatealpha($img, 255, 255, 255, 40);

        $fontBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
        $font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
        imagettftext($img, 18, 0, 56, 70, $muted, $font, strtoupper($category));
        imagettftext($img, 14, 0, 56, 100, $muted, $font, 'BD MARKETPLACE');

        $lines = $this->wrapText($name, 24, $fontBold, 670);
        $y = 330;
        foreach ($lines as $line) {
            imagettftext($img, 44, 0, 56, $y, $white, $fontBold, $line);
            $y += 62;
        }
        imagettftext($img, 18, 0, 56, $h - 96, $muted, $font, 'Verified seller · Cash on Delivery');
        imagettftext($img, 16, 0, 56, $h - 58, $muted, $font, 'Image '.$imageNo.' · For demonstration');

        $file = $dir.'/demo-product-'.$this->imageCounter.'.jpg';
        imagejpeg($img, $file, 88);
        imagedestroy($img);

        return 'products/'.now()->format('Y/m').'/'.basename($file);
    }

    private function wrapText(string $text, int $size, string $font, int $maxWidth): array
    {
        $words = explode(' ', $text);
        $lines = [];
        $line = '';
        foreach ($words as $word) {
            $candidate = trim($line.' '.$word);
            $box = imagettfbbox($size, 0, $font, $candidate);
            if (($box[2] - $box[0]) > $maxWidth && $line !== '') {
                $lines[] = $line;
                $line = $word;
            } else {
                $line = $candidate;
            }
        }
        if ($line !== '') {
            $lines[] = $line;
        }

        return array_slice($lines, 0, 3);
    }
}

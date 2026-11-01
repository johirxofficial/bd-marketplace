<?php

use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\Admin\AdminAuditLogController;
use App\Http\Controllers\Api\V1\Admin\AdminBannerController;
use App\Http\Controllers\Api\V1\Admin\AdminCatalogController;
use App\Http\Controllers\Api\V1\Admin\AdminCouponController;
use App\Http\Controllers\Api\V1\Admin\AdminDashboardController;
use App\Http\Controllers\Api\V1\Admin\AdminOrderController;
use App\Http\Controllers\Api\V1\Admin\AdminPaymentController;
use App\Http\Controllers\Api\V1\Admin\AdminPluginController;
use App\Http\Controllers\Api\V1\Admin\AdminProductController;
use App\Http\Controllers\Api\V1\Admin\AdminReportController;
use App\Http\Controllers\Api\V1\Admin\AdminReturnController;
use App\Http\Controllers\Api\V1\Admin\AdminReviewController;
use App\Http\Controllers\Api\V1\Admin\AdminSellerController;
use App\Http\Controllers\Api\V1\Admin\AdminSettlementController;
use App\Http\Controllers\Api\V1\Admin\AdminSettingController;
use App\Http\Controllers\Api\V1\Admin\AdminShippingZoneController;
use App\Http\Controllers\Api\V1\Admin\AdminSmsController;
use App\Http\Controllers\Api\V1\Admin\AdminDeveloperController;
use App\Http\Controllers\Api\V1\Admin\AdminEmailController;
use App\Http\Controllers\Api\V1\Admin\AdminSupportController;
use App\Http\Controllers\Api\V1\Admin\AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\CustomerOrderController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\PaymentCallbackController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ReceiptController;
use App\Http\Controllers\Api\V1\PublicApi\BrandController;
use App\Http\Controllers\Api\V1\PublicApi\CategoryController;
use App\Http\Controllers\Api\V1\PublicApi\HomeController;
use App\Http\Controllers\Api\V1\PublicApi\NewsletterController;
use App\Http\Controllers\Api\V1\PublicApi\ProductController;
use App\Http\Controllers\Api\V1\PublicApi\SettingController;
use App\Http\Controllers\Api\V1\PublicApi\ShippingZoneController;
use App\Http\Controllers\Api\V1\ReviewController;
use App\Http\Controllers\Api\V1\Seller\SellerDashboardController;
use App\Http\Controllers\Api\V1\Seller\SellerOnboardingController;
use App\Http\Controllers\Api\V1\Seller\SellerOrderController;
use App\Http\Controllers\Api\V1\Seller\SellerProductController;
use App\Http\Controllers\Api\V1\Seller\SellerReportController;
use App\Http\Controllers\Api\V1\Seller\SellerSettlementController;
use App\Http\Controllers\Api\V1\Seller\SellerStoreController;
use App\Http\Controllers\Api\V1\SupportTicketController;
use App\Http\Controllers\Api\V1\UploadController;
use App\Http\Controllers\Api\V1\WishlistController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('throttle:api')->group(function () {
    // Public catalog and content
    Route::get('/home', [HomeController::class, 'index']);
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::get('/categories/{slug}', [CategoryController::class, 'show']);
    Route::get('/brands', [BrandController::class, 'index']);
    Route::get('/products/filters', [ProductController::class, 'filters']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{slug}', [ProductController::class, 'show']);
    Route::get('/products/{slug}/related', [ProductController::class, 'related']);
    Route::get('/products/{slug}/reviews', [ReviewController::class, 'index']);
    Route::get('/shipping-zones', [ShippingZoneController::class, 'index']);
    Route::get('/settings/public', [SettingController::class, 'index']);
    Route::get('/payment-methods', [PaymentController::class, 'methods']);

    // Newsletter
    Route::post('/newsletter/subscribe', [NewsletterController::class, 'subscribe'])->middleware('throttle:10,1');
    Route::get('/newsletter/status/{token}', [NewsletterController::class, 'status']);
    Route::post('/newsletter/unsubscribe/{token}', [NewsletterController::class, 'unsubscribe']);

    // Printable receipt: the token is generated per receipt and included in email links.
    Route::get('/receipts/{receiptNumber}', [ReceiptController::class, 'show']);

    // Payment gateway callbacks (no session; validated against the gateway).
    Route::post('/payments/sslcommerz/{orderNumber}/success', [PaymentCallbackController::class, 'success']);
    Route::post('/payments/sslcommerz/{orderNumber}/fail', [PaymentCallbackController::class, 'fail']);
    Route::post('/payments/sslcommerz/{orderNumber}/cancel', [PaymentCallbackController::class, 'cancel']);
    Route::post('/payments/sslcommerz/{orderNumber}/ipn', [PaymentCallbackController::class, 'ipn']);
    Route::match(['get', 'post'], '/payments/bkash/{orderNumber}/callback', [PaymentCallbackController::class, 'bkash']);

    // Authentication
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/auth/forgot-password', [PasswordResetController::class, 'send'])->middleware('throttle:password-reset');
    Route::post('/auth/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:password-reset');

    Route::middleware(['auth:sanctum', 'active'])->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Account
        Route::get('/profile', [ProfileController::class, 'show']);
        Route::patch('/profile', [ProfileController::class, 'update']);
        Route::apiResource('addresses', AddressController::class);
        Route::post('/addresses/{address}/default', [AddressController::class, 'setDefault']);

        // Cart and wishlist
        Route::get('/cart', [CartController::class, 'show']);
        Route::post('/cart/items', [CartController::class, 'add']);
        Route::patch('/cart/items/{item}', [CartController::class, 'update']);
        Route::delete('/cart/items/{item}', [CartController::class, 'remove']);
        Route::post('/cart/coupon', [CartController::class, 'applyCoupon']);
        Route::delete('/cart/coupon', [CartController::class, 'removeCoupon']);
        Route::get('/wishlist', [WishlistController::class, 'index']);
        Route::post('/wishlist/{product}', [WishlistController::class, 'store']);
        Route::delete('/wishlist/{product}', [WishlistController::class, 'destroy']);

        // Checkout and orders
        Route::post('/checkout/quote', [CheckoutController::class, 'quote']);
        Route::post('/checkout', [CheckoutController::class, 'store'])->middleware('throttle:checkout');
        Route::get('/orders', [CustomerOrderController::class, 'index']);
        Route::get('/orders/{orderNumber}', [CustomerOrderController::class, 'show']);
        Route::post('/orders/{orderNumber}/cancel', [CustomerOrderController::class, 'cancel']);
        Route::post('/orders/{orderNumber}/confirm-receipt', [CustomerOrderController::class, 'confirmReceipt']);
        Route::post('/orders/{orderNumber}/payment/submit', [PaymentController::class, 'submit'])->middleware('throttle:6,1');
        Route::post('/orders/{orderNumber}/payment/retry', [PaymentController::class, 'retryHosted'])->middleware('throttle:6,1');
        Route::post('/orders/{orderNumber}/returns', [CustomerOrderController::class, 'requestReturn']);
        Route::get('/orders/{orderNumber}/tracking', [CustomerOrderController::class, 'tracking']);
        Route::post('/products/{product}/reviews', [ReviewController::class, 'store']);

        // Receipts
        Route::get('/receipts', [ReceiptController::class, 'index']);
        Route::get('/orders/{orderNumber}/receipt', [ReceiptController::class, 'forOrder']);

        // Notifications and support
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

        // Direct messages: any active user can message any other active user.
        Route::get('/messages/conversations', [MessageController::class, 'index']);
        Route::post('/messages/conversations', [MessageController::class, 'store'])->middleware('throttle:30,1');
        Route::get('/messages/conversations/{conversation}', [MessageController::class, 'show']);
        Route::post('/messages/conversations/{conversation}/messages', [MessageController::class, 'send'])->middleware('throttle:40,1');
        Route::post('/messages/conversations/{conversation}/read', [MessageController::class, 'read']);
        Route::get('/messages/unread', [MessageController::class, 'unread']);
        Route::get('/messages/users', [MessageController::class, 'users'])->middleware('throttle:60,1');

        Route::get('/support/tickets', [SupportTicketController::class, 'index']);
        Route::post('/support/tickets', [SupportTicketController::class, 'store'])->middleware('throttle:support');
        Route::get('/support/tickets/{ticket}', [SupportTicketController::class, 'show']);
        Route::post('/support/tickets/{ticket}/reply', [SupportTicketController::class, 'reply']);

        // Seller application is available before approval
        Route::get('/seller/application', [SellerOnboardingController::class, 'status']);
        Route::post('/seller/apply', [SellerOnboardingController::class, 'apply']);

        // Uploads for sellers and staff
        Route::post('/uploads', [UploadController::class, 'store'])->middleware(['role:seller,admin,manager,support', 'throttle:uploads']);
    });

    // Seller center
    Route::prefix('seller')->middleware(['auth:sanctum', 'active', 'role:seller'])->group(function () {
        Route::get('/dashboard', [SellerDashboardController::class, 'index']);
        Route::get('/store', [SellerStoreController::class, 'show']);
        Route::patch('/store', [SellerStoreController::class, 'update']);
        Route::get('/products', [SellerProductController::class, 'index']);
        Route::post('/products', [SellerProductController::class, 'store']);
        Route::get('/products/{product}', [SellerProductController::class, 'show']);
        Route::patch('/products/{product}', [SellerProductController::class, 'update']);
        Route::delete('/products/{product}', [SellerProductController::class, 'destroy']);
        Route::get('/orders', [SellerOrderController::class, 'index']);
        Route::get('/orders/{sellerOrder}', [SellerOrderController::class, 'show']);
        Route::patch('/orders/{sellerOrder}/status', [SellerOrderController::class, 'updateStatus']);
        Route::post('/orders/{sellerOrder}/shipments', [SellerOrderController::class, 'createShipment']);
        Route::post('/shipments/{shipment}/tracking', [SellerOrderController::class, 'addTracking']);
        Route::get('/returns', [SellerOrderController::class, 'returns']);
        Route::patch('/returns/{return}', [SellerOrderController::class, 'updateReturn']);
        Route::get('/settlements', [SellerSettlementController::class, 'index']);
        Route::get('/reports/sales', [SellerReportController::class, 'sales']);
    });

    // Administration
    Route::prefix('admin')->middleware(['auth:sanctum', 'active', 'role:admin,manager,support'])->group(function () {
        Route::get('/dashboard', [AdminDashboardController::class, 'index'])->middleware('permission:dashboard.view');

        Route::get('/sellers', [AdminSellerController::class, 'index'])->middleware('permission:sellers.manage');
        Route::post('/sellers/{seller}/approve', [AdminSellerController::class, 'approve'])->middleware('permission:sellers.manage');
        Route::post('/sellers/{seller}/reject', [AdminSellerController::class, 'reject'])->middleware('permission:sellers.manage');
        Route::post('/sellers/{seller}/suspend', [AdminSellerController::class, 'suspend'])->middleware('permission:sellers.manage');
        Route::patch('/sellers/{seller}/commission', [AdminSellerController::class, 'updateCommission'])->middleware('permission:sellers.manage');

        Route::get('/products', [AdminProductController::class, 'index'])->middleware('permission:products.moderate');
        Route::get('/products/{product}', [AdminProductController::class, 'show'])->middleware('permission:products.moderate');
        Route::patch('/products/{product}/status', [AdminProductController::class, 'updateStatus'])->middleware('permission:products.moderate');

        Route::get('/categories', [AdminCatalogController::class, 'categories'])->middleware('permission:catalog.manage');
        Route::post('/categories', [AdminCatalogController::class, 'storeCategory'])->middleware('permission:catalog.manage');
        Route::patch('/categories/{category}', [AdminCatalogController::class, 'updateCategory'])->middleware('permission:catalog.manage');
        Route::delete('/categories/{category}', [AdminCatalogController::class, 'destroyCategory'])->middleware('permission:catalog.manage');
        Route::get('/brands', [AdminCatalogController::class, 'brands'])->middleware('permission:catalog.manage');
        Route::post('/brands', [AdminCatalogController::class, 'storeBrand'])->middleware('permission:catalog.manage');
        Route::patch('/brands/{brand}', [AdminCatalogController::class, 'updateBrand'])->middleware('permission:catalog.manage');
        Route::delete('/brands/{brand}', [AdminCatalogController::class, 'destroyBrand'])->middleware('permission:catalog.manage');

        Route::get('/orders', [AdminOrderController::class, 'index'])->middleware('permission:orders.manage');
        Route::get('/orders/{order}', [AdminOrderController::class, 'show'])->middleware('permission:orders.manage');
        Route::patch('/seller-orders/{sellerOrder}/status', [AdminOrderController::class, 'updateSellerOrderStatus'])->middleware('permission:orders.manage');
        Route::post('/orders/{order}/cod-collected', [AdminOrderController::class, 'markCodCollected'])->middleware('permission:payments.manage');
        Route::post('/orders/{order}/cancel', [AdminOrderController::class, 'cancel'])->middleware('permission:orders.manage');
        Route::post('/orders/{order}/notes', [AdminOrderController::class, 'addNote'])->middleware('permission:orders.manage');

        Route::get('/returns', [AdminReturnController::class, 'index'])->middleware('permission:refunds.manage');
        Route::patch('/returns/{return}', [AdminReturnController::class, 'update'])->middleware('permission:refunds.manage');
        Route::get('/refunds', [AdminReturnController::class, 'refunds'])->middleware('permission:refunds.manage');

        Route::get('/settlements', [AdminSettlementController::class, 'index'])->middleware('permission:settlements.manage');
        Route::post('/settlements', [AdminSettlementController::class, 'create'])->middleware('permission:settlements.manage');
        Route::post('/settlements/{settlement}/approve', [AdminSettlementController::class, 'approve'])->middleware('permission:settlements.manage');
        Route::post('/settlements/{settlement}/pay', [AdminSettlementController::class, 'pay'])->middleware('permission:settlements.manage');

        Route::get('/coupons', [AdminCouponController::class, 'index'])->middleware('permission:promotions.manage');
        Route::post('/coupons', [AdminCouponController::class, 'store'])->middleware('permission:promotions.manage');
        Route::patch('/coupons/{coupon}', [AdminCouponController::class, 'update'])->middleware('permission:promotions.manage');
        Route::delete('/coupons/{coupon}', [AdminCouponController::class, 'destroy'])->middleware('permission:promotions.manage');
        Route::get('/banners', [AdminBannerController::class, 'index'])->middleware('permission:promotions.manage');
        Route::post('/banners', [AdminBannerController::class, 'store'])->middleware('permission:promotions.manage');
        Route::patch('/banners/{banner}', [AdminBannerController::class, 'update'])->middleware('permission:promotions.manage');
        Route::delete('/banners/{banner}', [AdminBannerController::class, 'destroy'])->middleware('permission:promotions.manage');

        Route::get('/reviews', [AdminReviewController::class, 'index'])->middleware('permission:reviews.moderate');
        Route::patch('/reviews/{review}', [AdminReviewController::class, 'update'])->middleware('permission:reviews.moderate');

        Route::get('/support', [AdminSupportController::class, 'index'])->middleware('permission:support.manage');
        Route::get('/support/{ticket}', [AdminSupportController::class, 'show'])->middleware('permission:support.manage');
        Route::post('/support/{ticket}/reply', [AdminSupportController::class, 'reply'])->middleware('permission:support.manage');
        Route::patch('/support/{ticket}', [AdminSupportController::class, 'update'])->middleware('permission:support.manage');

        Route::get('/users', [AdminUserController::class, 'index'])->middleware('permission:users.manage');
        Route::get('/users/{user}', [AdminUserController::class, 'show'])->middleware('permission:users.manage');
        Route::patch('/users/{user}', [AdminUserController::class, 'update'])->middleware(['permission:users.manage', 'throttle:30,1']);
        Route::patch('/users/{user}/status', [AdminUserController::class, 'updateStatus'])->middleware(['permission:users.manage', 'throttle:6,1']);
        Route::patch('/users/{user}/role', [AdminUserController::class, 'updateRole'])->middleware('permission:users.manage');
        Route::patch('/users/{user}/password', [AdminUserController::class, 'updatePassword'])->middleware(['permission:users.manage', 'throttle:6,1']);
        Route::post('/users/{user}/password-reset', [AdminUserController::class, 'sendPasswordReset'])->middleware(['permission:users.manage', 'throttle:6,1']);

        Route::get('/settings', [AdminSettingController::class, 'index'])->middleware('permission:settings.manage');
        Route::patch('/settings', [AdminSettingController::class, 'update'])->middleware('permission:settings.manage');

        // Payments: manual verification, gateway configuration
        Route::get('/payments/pending', [AdminPaymentController::class, 'pending'])->middleware('permission:payments.manage');
        Route::post('/payments/{transaction}/verify', [AdminPaymentController::class, 'verify'])->middleware('permission:payments.manage');
        Route::post('/payments/{transaction}/reject', [AdminPaymentController::class, 'reject'])->middleware('permission:payments.manage');
        Route::get('/payment-methods', [AdminPaymentController::class, 'methods'])->middleware('permission:settings.manage');
        Route::patch('/payment-methods/{paymentMethod}', [AdminPaymentController::class, 'updateMethod'])->middleware('permission:settings.manage');

        // SMS
        Route::get('/sms/gateways', [AdminSmsController::class, 'gateways'])->middleware('permission:sms.manage');
        Route::post('/sms/gateways', [AdminSmsController::class, 'storeGateway'])->middleware('permission:sms.manage');
        Route::patch('/sms/gateways/{gateway}', [AdminSmsController::class, 'updateGateway'])->middleware('permission:sms.manage');
        Route::get('/sms/templates', [AdminSmsController::class, 'templates'])->middleware('permission:sms.manage');
        Route::patch('/sms/templates/{template}', [AdminSmsController::class, 'updateTemplate'])->middleware('permission:sms.manage');
        Route::get('/sms/messages', [AdminSmsController::class, 'messages'])->middleware('permission:sms.manage');
        Route::post('/sms/test', [AdminSmsController::class, 'test'])->middleware(['permission:sms.manage', 'throttle:6,1']);

        // Email center: settings, automated templates, manual campaigns, log, subscribers
        Route::get('/email/overview', [AdminEmailController::class, 'overview'])->middleware('permission:email.manage');
        Route::get('/email/settings', [AdminEmailController::class, 'settings'])->middleware('permission:email.manage');
        Route::patch('/email/settings', [AdminEmailController::class, 'updateSettings'])->middleware('permission:email.manage');
        Route::post('/email/test', [AdminEmailController::class, 'test'])->middleware(['permission:email.manage', 'throttle:6,1']);
        Route::get('/email/templates', [AdminEmailController::class, 'templates'])->middleware('permission:email.manage');
        Route::patch('/email/templates/{template}', [AdminEmailController::class, 'updateTemplate'])->middleware('permission:email.manage');
        Route::post('/email/templates/{template}/preview', [AdminEmailController::class, 'previewTemplate'])->middleware('permission:email.manage');
        Route::get('/email/messages', [AdminEmailController::class, 'messages'])->middleware('permission:email.manage');
        Route::get('/email/messages/{message}', [AdminEmailController::class, 'showMessage'])->middleware('permission:email.manage');
        Route::post('/email/messages/{message}/retry', [AdminEmailController::class, 'retryMessage'])->middleware('permission:email.manage');
        Route::post('/email/compose', [AdminEmailController::class, 'compose'])->middleware(['permission:email.manage', 'throttle:20,1']);
        Route::get('/email/campaigns', [AdminEmailController::class, 'campaigns'])->middleware('permission:email.manage');
        Route::post('/email/campaigns', [AdminEmailController::class, 'storeCampaign'])->middleware(['permission:email.manage', 'throttle:10,1']);
        Route::get('/email/campaigns/{campaign}', [AdminEmailController::class, 'showCampaign'])->middleware('permission:email.manage');
        Route::get('/email/subscribers', [AdminEmailController::class, 'subscribers'])->middleware('permission:email.manage');
        Route::post('/email/subscribers', [AdminEmailController::class, 'storeSubscriber'])->middleware('permission:email.manage');
        Route::delete('/email/subscribers/{subscriber}', [AdminEmailController::class, 'destroySubscriber'])->middleware('permission:email.manage');

        // Plugins
        Route::get('/plugins', [AdminPluginController::class, 'index'])->middleware('permission:plugins.manage');
        Route::post('/plugins/sync', [AdminPluginController::class, 'sync'])->middleware('permission:plugins.manage');
        Route::patch('/plugins/{plugin}', [AdminPluginController::class, 'update'])->middleware('permission:plugins.manage');

        // Developer tools: API tokens and webhooks
        Route::get('/developer/tokens', [AdminDeveloperController::class, 'tokens'])->middleware('permission:developer.manage');
        Route::post('/developer/tokens', [AdminDeveloperController::class, 'createToken'])->middleware('permission:developer.manage');
        Route::delete('/developer/tokens/{token}', [AdminDeveloperController::class, 'revokeToken'])->middleware('permission:developer.manage');
        Route::get('/developer/webhooks', [AdminDeveloperController::class, 'webhooks'])->middleware('permission:developer.manage');
        Route::post('/developer/webhooks', [AdminDeveloperController::class, 'storeWebhook'])->middleware('permission:developer.manage');
        Route::patch('/developer/webhooks/{webhook}', [AdminDeveloperController::class, 'updateWebhook'])->middleware('permission:developer.manage');
        Route::delete('/developer/webhooks/{webhook}', [AdminDeveloperController::class, 'destroyWebhook'])->middleware('permission:developer.manage');
        Route::post('/developer/webhooks/{webhook}/test', [AdminDeveloperController::class, 'testWebhook'])->middleware('permission:developer.manage');
        Route::get('/developer/webhooks/{webhook}/deliveries', [AdminDeveloperController::class, 'deliveries'])->middleware('permission:developer.manage');
        Route::get('/shipping-zones', [AdminShippingZoneController::class, 'index'])->middleware('permission:shipping.manage');
        Route::post('/shipping-zones', [AdminShippingZoneController::class, 'store'])->middleware('permission:shipping.manage');
        Route::patch('/shipping-zones/{zone}', [AdminShippingZoneController::class, 'update'])->middleware('permission:shipping.manage');
        Route::delete('/shipping-zones/{zone}', [AdminShippingZoneController::class, 'destroy'])->middleware('permission:shipping.manage');

        Route::get('/audit-logs', [AdminAuditLogController::class, 'index'])->middleware('permission:audit.view');
        Route::get('/reports', [AdminReportController::class, 'index'])->middleware('permission:reports.view');
    });
});

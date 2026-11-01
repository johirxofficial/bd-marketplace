import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreLayout } from './components/StoreLayout'
import { PortalLayout } from './components/PortalLayout'
import { RequireAuth } from './components/RequireAuth'

import HomePage from './pages/HomePage'
import ProductsPage from './pages/ProductsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import UnsubscribePage from './pages/UnsubscribePage'
import ReceiptPage from './pages/ReceiptPage'
import WishlistPage from './pages/WishlistPage'
import SellerApplyPage from './pages/SellerApplyPage'
import StaticPage from './pages/StaticPage'
import MessagesPage from './pages/MessagesPage'
import NotFoundPage from './pages/NotFoundPage'

import AccountLayout from './pages/account/AccountLayout'
import OverviewPage from './pages/account/OverviewPage'
import ProfilePage from './pages/account/ProfilePage'
import AddressesPage from './pages/account/AddressesPage'
import OrdersPage from './pages/account/OrdersPage'
import OrderDetailPage from './pages/account/OrderDetailPage'
import ReceiptsPage from './pages/account/ReceiptsPage'
import NotificationsPage from './pages/account/NotificationsPage'
import SupportPage from './pages/account/SupportPage'

import SellerDashboardPage from './pages/seller/DashboardPage'
import SellerProductsPage from './pages/seller/ProductsPage'
import SellerProductFormPage from './pages/seller/ProductFormPage'
import SellerOrdersPage from './pages/seller/OrdersPage'
import SellerOrderDetailPage from './pages/seller/OrderDetailPage'
import SellerReturnsPage from './pages/seller/ReturnsPage'
import SellerSettlementsPage from './pages/seller/SettlementsPage'
import SellerReportsPage from './pages/seller/ReportsPage'
import SellerStorePage from './pages/seller/StorePage'

import AdminDashboardPage from './pages/admin/DashboardPage'
import AdminOrdersPage from './pages/admin/OrdersPage'
import AdminOrderDetailPage from './pages/admin/OrderDetailPage'
import AdminProductsPage from './pages/admin/ProductsPage'
import AdminSellersPage from './pages/admin/SellersPage'
import AdminCatalogPage from './pages/admin/CatalogPage'
import AdminReturnsPage from './pages/admin/ReturnsPage'
import AdminSettlementsPage from './pages/admin/SettlementsPage'
import AdminMarketingPage from './pages/admin/MarketingPage'
import AdminReviewsPage from './pages/admin/ReviewsPage'
import AdminSupportPage from './pages/admin/SupportPage'
import AdminUsersPage from './pages/admin/UsersPage'
import AdminShippingPage from './pages/admin/ShippingPage'
import AdminSettingsPage from './pages/admin/SettingsPage'
import AdminPaymentsPage from './pages/admin/PaymentsPage'
import AdminPaymentMethodsPage from './pages/admin/PaymentMethodsPage'
import AdminSmsPage from './pages/admin/SmsPage'
import AdminEmailPage from './pages/admin/EmailPage'
import AdminPluginsPage from './pages/admin/PluginsPage'
import AdminDeveloperPage from './pages/admin/DeveloperPage'
import AdminReportsPage from './pages/admin/ReportsPage'
import AdminAuditPage from './pages/admin/AuditPage'

function ScrollToTop() {
  const { pathname, search } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [pathname, search])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<HomePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:slug" element={<ProductDetailPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="unsubscribe/:token" element={<UnsubscribePage />} />
          <Route path="wishlist" element={<RequireAuth><WishlistPage /></RequireAuth>} />
          <Route path="messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
          <Route path="seller/apply" element={<RequireAuth><SellerApplyPage /></RequireAuth>} />

          <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
            <Route index element={<OverviewPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="addresses" element={<AddressesPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderNumber" element={<OrderDetailPage />} />
            <Route path="receipts" element={<ReceiptsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="support" element={<SupportPage />} />
          </Route>

          <Route path="support" element={<StaticPage page="support" />} />
          <Route path="about" element={<StaticPage page="about" />} />
          <Route path="returns-policy" element={<StaticPage page="returns" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="/receipts/:receiptNumber" element={<ReceiptPage />} />

        <Route path="/seller" element={<RequireAuth roles={['seller']}><PortalLayout kind="seller" /></RequireAuth>}>
          <Route index element={<SellerDashboardPage />} />
          <Route path="products" element={<SellerProductsPage />} />
          <Route path="products/new" element={<SellerProductFormPage />} />
          <Route path="products/:id/edit" element={<SellerProductFormPage />} />
          <Route path="orders" element={<SellerOrdersPage />} />
          <Route path="orders/:id" element={<SellerOrderDetailPage />} />
          <Route path="returns" element={<SellerReturnsPage />} />
          <Route path="settlements" element={<SellerSettlementsPage />} />
          <Route path="reports" element={<SellerReportsPage />} />
          <Route path="store" element={<SellerStorePage />} />
        </Route>

        <Route path="/admin" element={<RequireAuth staff><PortalLayout kind="admin" /></RequireAuth>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="orders/:id" element={<AdminOrderDetailPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="sellers" element={<AdminSellersPage />} />
          <Route path="catalog" element={<AdminCatalogPage />} />
          <Route path="returns" element={<AdminReturnsPage />} />
          <Route path="settlements" element={<AdminSettlementsPage />} />
          <Route path="marketing" element={<AdminMarketingPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="shipping" element={<AdminShippingPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="payment-methods" element={<AdminPaymentMethodsPage />} />
          <Route path="sms" element={<AdminSmsPage />} />
          <Route path="email" element={<AdminEmailPage />} />
          <Route path="plugins" element={<AdminPluginsPage />} />
          <Route path="developer" element={<AdminDeveloperPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
        </Route>

        <Route path="/seller/*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

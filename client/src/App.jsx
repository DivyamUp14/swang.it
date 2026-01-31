import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'
import Header from './components/layout/Header.jsx'
import Footer from './components/layout/Footer.jsx'
import GlobalIncomingCallHandler from './components/GlobalIncomingCallHandler.jsx'
import GlobalOutboundCallHandler from './components/GlobalOutboundCallHandler.jsx'
import LocationPrompt from './components/LocationPrompt.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import CustomerHome from './pages/CustomerHome.jsx'
import ConsultantHome from './pages/ConsultantHome.jsx'
import ConsultantProfile from './pages/ConsultantProfile.jsx'
import ConsultantProfileManagement from './pages/ConsultantProfileManagement.jsx'
import BookingCalendar from './pages/BookingCalendar.jsx'
import EarningsInvoices from './pages/EarningsInvoices.jsx'
import ConsultantSupport from './pages/ConsultantSupport.jsx'
import ConsultantReviews from './pages/ConsultantReviews.jsx'
import TransactionHistory from './pages/TransactionHistory.jsx'
import MyAppointments from './pages/MyAppointments.jsx'
import HelpCenter from './pages/HelpCenter.jsx'
import TermsOfService from './pages/TermsOfService.jsx'
import AboutUs from './pages/AboutUs.jsx'
import FAQ from './pages/FAQ.jsx'
import ReviewPolicy from './pages/ReviewPolicy.jsx'
import BecomeConsultant from './pages/BecomeConsultant.jsx'
import CallPage from './pages/CallPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import AppointmentPage from './pages/AppointmentPage.jsx'
import MyAccount from './pages/MyAccount.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import UsersManagement from './pages/admin/UsersManagement.jsx'
import ConsultantsManagement from './pages/admin/ConsultantsManagement.jsx'
import PayoutsManagement from './pages/admin/PayoutsManagement.jsx'
import TransactionsManagement from './pages/admin/TransactionsManagement.jsx'
import BonusesManagement from './pages/admin/BonusesManagement.jsx'
import MicroCategoriesManagement from './pages/admin/MicroCategoriesManagement.jsx'
import ReviewsManagement from './pages/admin/ReviewsManagement.jsx'
import SessionsManagement from './pages/admin/SessionsManagement.jsx'
import AppointmentsManagement from './pages/admin/AppointmentsManagement.jsx'
import UserHistory from './pages/admin/UserHistory.jsx'
import DiscountCodesManagement from './pages/admin/DiscountCodesManagement.jsx'
import AuditLogs from './pages/admin/AuditLogs.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'
import InvitationsManagement from './pages/admin/InvitationsManagement.jsx'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
// Always call loadStripe with a valid key format to ensure Elements provider creates context
// If no key provided, use a dummy test key (Elements needs a valid format to create context)
// The key will fail to initialize Stripe, but Elements context will be created
const stripeKey = stripePublishableKey || 'pk_test_0000000000000000000000000000000000000000000000000000000000000000'
const stripePromise = loadStripe(stripeKey).catch(() => {
  // If Stripe fails to load, return null but Elements context will still exist
  return null;
});

function Protected({ children, role }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Caricamento...</div></div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (role && user.role !== role && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppShellInner() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  if (isAdminRoute) {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/users" element={<Protected role="admin"><UsersManagement /></Protected>} />
          <Route path="/admin/consultants" element={<Protected role="admin"><ConsultantsManagement /></Protected>} />
          <Route path="/admin/payouts" element={<Protected role="admin"><PayoutsManagement /></Protected>} />
          <Route path="/admin/transactions" element={<Protected role="admin"><TransactionsManagement /></Protected>} />
          <Route path="/admin/bonuses" element={<Protected role="admin"><BonusesManagement /></Protected>} />
          <Route path="/admin/micro-categories" element={<Protected role="admin"><MicroCategoriesManagement /></Protected>} />
          <Route path="/admin/reviews" element={<Protected role="admin"><ReviewsManagement /></Protected>} />
          <Route path="/admin/sessions" element={<Protected role="admin"><SessionsManagement /></Protected>} />
          <Route path="/admin/appointments" element={<Protected role="admin"><AppointmentsManagement /></Protected>} />
          <Route path="/admin/users/:id/history" element={<Protected role="admin"><UserHistory /></Protected>} />
          <Route path="/admin/discount-codes" element={<Protected role="admin"><DiscountCodesManagement /></Protected>} />
          <Route path="/admin/audit-logs" element={<Protected role="admin"><AuditLogs /></Protected>} />
          <Route path="/admin/settings" element={<Protected role="admin"><AdminSettings /></Protected>} />
          <Route path="/admin/invitations" element={<Protected role="admin"><InvitationsManagement /></Protected>} />
          <Route path="/admin/*" element={<Protected role="admin"><AdminDashboard /></Protected>} />
        </Route>
      </Routes>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <GlobalIncomingCallHandler />
      <GlobalOutboundCallHandler />
      <LocationPrompt />
      <Header />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/customer" element={<Protected role="customer"><CustomerHome /></Protected>} />
          <Route path="/consultant" element={<Protected role="consultant"><ConsultantHome /></Protected>} />
          <Route path="/consultant/:id" element={<ConsultantProfile />} />
          <Route path="/consultant/profile/edit" element={<Protected role="consultant"><ConsultantProfileManagement /></Protected>} />
          <Route path="/consultant/calendar" element={<Protected role="consultant"><BookingCalendar /></Protected>} />
          <Route path="/consultant/earnings" element={<Protected role="consultant"><EarningsInvoices /></Protected>} />
          <Route path="/consultant/reviews" element={<Protected role="consultant"><ConsultantReviews /></Protected>} />
          <Route path="/consultant/support" element={<Protected role="consultant"><ConsultantSupport /></Protected>} />
          <Route path="/account" element={<Protected><MyAccount /></Protected>} />
          <Route path="/appointments" element={<Protected><MyAppointments /></Protected>} />
          <Route path="/transactions" element={<Protected><TransactionHistory /></Protected>} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/reviews" element={<ReviewPolicy />} />
          <Route path="/become-consultant" element={<BecomeConsultant />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/call/:requestId" element={<Protected><CallPage /></Protected>} />
          <Route path="/chat/:requestId" element={<Protected><ChatPage /></Protected>} />
          <Route path="/appointment/:bookingId/:token" element={<Protected><AppointmentPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

function AppShell() {
  return (
    <AuthProvider>
      <AppShellInner />
    </AuthProvider>
  )
}

export default function App() {
  // Always wrap with Elements, even if stripePromise is null
  // This ensures Stripe hooks work in all components
  return (
    <Elements stripe={stripePromise}>
      <AppShell />
    </Elements>
  )
}




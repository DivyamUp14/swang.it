import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FaHome, FaUsers, FaUserTie, FaMoneyBillWave, FaCreditCard, FaGift, FaTags, FaSignOutAlt, FaGlobe, FaKey, FaStar, FaVideo, FaCalendar, FaTicketAlt, FaHistory, FaEnvelope } from 'react-icons/fa'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function AdminNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: FaHome },
    { path: '/admin/users', label: 'Users', icon: FaUsers },
    { path: '/admin/consultants', label: 'Consultants', icon: FaUserTie },
    { path: '/admin/payouts', label: 'Payouts', icon: FaMoneyBillWave },
    { path: '/admin/transactions', label: 'Transactions', icon: FaCreditCard },
    { path: '/admin/bonuses', label: 'Bonuses', icon: FaGift },
    { path: '/admin/micro-categories', label: 'Micro-Categories', icon: FaTags },
    { path: '/admin/reviews', label: 'Reviews', icon: FaStar },
    { path: '/admin/sessions', label: 'Sessions', icon: FaVideo },
    { path: '/admin/appointments', label: 'Appointments', icon: FaCalendar },
    { path: '/admin/discount-codes', label: 'Discount Codes', icon: FaTicketAlt },
    { path: '/admin/invitations', label: 'Invitations', icon: FaEnvelope },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: FaHistory },
    { path: '/admin/settings', label: 'Settings', icon: FaKey },
  ]

  return (
    <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-8">Swang Admin</h1>
        <nav className="space-y-2">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-10 pt-6 border-t border-gray-800 space-y-3">
          <Link
            to="/"
            className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <FaGlobe className="w-5 h-5" />
            <span>Torna al sito</span>
          </Link>

          <button
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-red-200 hover:bg-red-700/30 transition-colors"
          >
            <FaSignOutAlt className="w-5 h-5" />
            <span>Esci</span>
          </button>
        </div>
      </div>
    </div>
  )
}


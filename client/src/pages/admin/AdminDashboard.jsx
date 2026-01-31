import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import { FaUsers, FaUserTie, FaClock, FaMoneyBillWave, FaChartLine, FaCreditCard, FaPhone, FaStar, FaTrash } from 'react-icons/fa'

export default function AdminDashboard() {
  const { token, apiBase } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/stats`, { headers })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center p-8">Caricamento...</div>
    )

  }

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: FaUsers, color: 'blue' },
    { label: 'Total Consultants', value: stats?.totalConsultants || 0, icon: FaUserTie, color: 'green' },
    { label: 'Active Consultants', value: stats?.activeConsultants || 0, icon: FaUserTie, color: 'green' },
    { label: 'Pending Consultants', value: stats?.pendingConsultants || 0, icon: FaClock, color: 'yellow' },
    { label: 'Pending Payouts', value: `€${Number(stats?.pendingPayoutsTotal || 0).toFixed(2)}`, icon: FaMoneyBillWave, color: 'orange' },
    { label: 'Platform Earnings', value: `€${Number(stats?.platformEarnings || 0).toFixed(2)}`, icon: FaChartLine, color: 'purple' },
    { label: 'Recent Transactions', value: stats?.recentTransactions || 0, icon: FaCreditCard, color: 'indigo' },
    { label: 'Total Calls', value: stats?.totalCalls || 0, icon: FaPhone, color: 'teal' },
    { label: 'Average Ratings', value: stats?.averageRatings ? `${Number(stats.averageRatings || 0).toFixed(1)}/5` : '0/5', icon: FaStar, color: 'yellow' },
    { label: 'Deleted Profiles', value: stats?.totalDeletedUsers || 0, icon: FaTrash, color: 'red' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Overview of platform statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon
          const colorClasses = {
            blue: 'bg-blue-100 text-blue-600',
            green: 'bg-green-100 text-green-600',
            yellow: 'bg-yellow-100 text-yellow-600',
            orange: 'bg-orange-100 text-orange-600',
            purple: 'bg-purple-100 text-purple-600',
            indigo: 'bg-indigo-100 text-indigo-600',
            teal: 'bg-teal-100 text-teal-600',
            red: 'bg-red-100 text-red-600',
          }
          return (
            <div key={idx} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colorClasses[stat.color]}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}


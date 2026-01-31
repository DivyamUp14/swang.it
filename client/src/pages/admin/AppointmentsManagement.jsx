import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function AppointmentsManagement() {
  const { token, apiBase } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ status: '', consultantId: '', customerId: '' })

  useEffect(() => {
    loadAppointments()
  }, [page, filters])

  const loadAppointments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50 })
      if (filters.status) params.append('status', filters.status)
      if (filters.consultantId) params.append('consultantId', filters.consultantId)
      if (filters.customerId) params.append('customerId', filters.customerId)

      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/appointments?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setAppointments(data.appointments || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const releaseCredits = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to release held credits for this appointment?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/appointments/${appointmentId}/release-credits`, {
        method: 'PUT',
        headers
      })
      if (res.ok) {
        alert('Credits released successfully')
        loadAppointments()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to release credits')
      }
    } catch (error) {
      alert('Error releasing credits')
    }
  }

  const formatDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return '-'

    // Handle if dateStr is already a full ISO string (e.g. 2026-01-30T00:00:00.000Z)
    let datePart = dateStr
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      datePart = dateStr.split('T')[0]
    }

    const date = new Date(`${datePart}T${timeStr}`)

    // If invalid date, return raw string as fallback
    if (isNaN(date.getTime())) {
      return `${datePart} ${timeStr}`
    }

    return date.toLocaleString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Appointments Management</h1>
        <p className="text-gray-600 mt-2">View and manage all appointments</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="held">Credits Held</option>
            <option value="released">Credits Released</option>
          </select>
          <input
            type="text"
            placeholder="Consultant ID"
            value={filters.consultantId}
            onChange={(e) => setFilters({ ...filters, consultantId: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          />
          <input
            type="text"
            placeholder="Customer ID"
            value={filters.customerId}
            onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          />
          <Button onClick={loadAppointments}>Filter</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credits Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.map(appointment => (
                  <tr key={appointment.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(appointment.date, appointment.time)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {appointment.consultant_name || appointment.consultant_email || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {appointment.customer_email || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {appointment.mode || 'video'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      €{Number(appointment.price || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {appointment.credits_held > 0 && !appointment.credits_released ? (
                        <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">
                          Held: €{Number(appointment.credits_held || 0).toFixed(2)}
                        </span>
                      ) : appointment.credits_released ? (
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Released</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Deducted</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${appointment.appointment_status === 'upcoming' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                        {appointment.appointment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {appointment.credits_held > 0 && !appointment.credits_released && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => releaseCredits(appointment.id)}
                        >
                          Release Credits
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">Total: {total} appointments</div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="px-4 py-2 text-sm">Page {page}</span>
              <Button size="sm" variant="secondary" onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>

  )
}


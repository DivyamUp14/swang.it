import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function SessionsManagement() {
  const { token, apiBase } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ status: '', type: '', customerId: '', consultantId: '' })

  useEffect(() => {
    loadSessions()
  }, [page, filters])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50 })
      if (filters.status) params.append('status', filters.status)
      if (filters.type) params.append('type', filters.type)
      if (filters.customerId) params.append('customerId', filters.customerId)
      if (filters.consultantId) params.append('consultantId', filters.consultantId)

      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/sessions?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const forceClose = async (sessionId) => {
    if (!window.confirm('Are you sure you want to force close this session?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/sessions/${sessionId}/force-close`, {
        method: 'PUT',
        headers
      })
      if (res.ok) {
        alert('Session force closed successfully')
        loadSessions()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to close session')
      }
    } catch (error) {
      alert('Error closing session')
    }
  }

  const formatDuration = (minutes) => {
    if (!minutes || minutes === 0) return '-'
    const hrs = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sessions Management</h1>
        <p className="text-gray-600 mt-2">View and manage all call/chat sessions</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4 flex-wrap">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Types</option>
            <option value="video">Video</option>
            <option value="voice">Voice</option>
            <option value="chat">Chat</option>
          </select>
          <input
            type="text"
            placeholder="Customer ID"
            value={filters.customerId}
            onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          />
          <input
            type="text"
            placeholder="Consultant ID"
            value={filters.consultantId}
            onChange={(e) => setFilters({ ...filters, consultantId: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          />
          <Button onClick={loadSessions}>Filter</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ended</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map(session => (
                    <tr key={session.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{session.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{session.customer_email || 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{session.consultant_email || 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">{session.type || 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {session.active === 1 && !session.ended_at ? (
                          <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>
                        ) : !session.started_at && !session.ended_at ? (
                          <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Scheduled</span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Ended</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDuration(session.duration_minutes)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {session.started_at ? new Date(session.started_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {session.ended_at ? new Date(session.ended_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {session.active === 1 && !session.ended_at && (
                          <div className="flex gap-2 flex-nowrap">
                            <Button
                              size="sm"
                              variant="danger"
                              className="!px-2 !py-1 !text-xs"
                              onClick={() => forceClose(session.id)}
                            >
                              Force Close
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">Total: {total} sessions</div>
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


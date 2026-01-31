import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { FaTrash, FaEye } from 'react-icons/fa'
import Button from '../../components/ui/Button.jsx'
import UserProfileModal from '../../components/admin/UserProfileModal.jsx'

export default function ConsultantsManagement() {
  const { token, apiBase } = useAuth()
  const [consultants, setConsultants] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [viewConsultantId, setViewConsultantId] = useState(null)

  useEffect(() => {
    loadConsultants()
  }, [page, statusFilter])

  const loadConsultants = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50 })
      if (statusFilter) params.append('status', statusFilter)
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/consultants?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setConsultants(data.consultants || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const [statsModal, setStatsModal] = useState(null)
  const [consultantStats, setConsultantStats] = useState(null)

  const updateStatus = async (consultantId, newStatus) => {
    if (!window.confirm(`Change consultant status to ${newStatus}?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/consultants/${consultantId}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        alert(`Consultant status updated to ${newStatus}`)
        loadConsultants()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update status')
      }
    } catch (error) {
      alert('Error updating status')
    }
  }

  const suspendConsultant = async (consultantId) => {
    if (!window.confirm('Are you sure you want to suspend this consultant?')) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/consultants/${consultantId}/suspend`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ reason: 'Suspended by admin' })
      })
      if (res.ok) {
        alert('Consultant suspended successfully')
        loadConsultants()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to suspend consultant')
      }
    } catch (error) {
      alert('Error suspending consultant')
    }
  }

  const loadStats = async (consultantId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/consultants/${consultantId}/stats`, { headers })
      if (res.ok) {
        const data = await res.json()
        setConsultantStats(data)
        setStatsModal(consultantId)
      }
    } catch (error) {
      alert('Error loading stats')
    }
  }

  const deleteConsultant = async (consultantId) => {
    if (!window.confirm('SEI SICURO? Questa azione è irreversibile e cancellerà definitivamente il consulente e tutti i dati associati.')) return

    if (!window.confirm('Confermi DEFINITIVAMENTE la cancellazione?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      // Use the generic users endpoint since consultants are users
      const res = await fetch(`${apiBase}/api/admin/users/${consultantId}`, {
        method: 'DELETE',
        headers
      })

      if (res.ok) {
        alert('Consulente cancellato con successo')
        loadConsultants()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Errore durante la cancellazione')
      }
    } catch (error) {
      alert('Errore di connessione')
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Consultants Management</h1>
        <p className="text-gray-600 mt-2">Approve, reject, or deactivate consultants</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-4 py-2"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {consultants.map(consultant => {
                  const email = consultant.user_email || consultant.email || 'N/A';
                  const displayName = consultant.name || consultant.user_full_name || 'N/A';
                  return (
                    <tr key={consultant.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{consultant.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{displayName}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded ${consultant.status === 'active' ? 'bg-green-100 text-green-800' :
                          consultant.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                          {consultant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">€{Number(consultant.credits || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-blue-600 hover:text-blue-800"
                            onClick={() => setViewConsultantId(consultant.id)}
                            title="View Full Profile"
                          >
                            <FaEye />
                          </Button>
                          {consultant.status !== 'active' && (
                            <Button size="sm" variant="primary" onClick={() => updateStatus(consultant.id, 'active')}>
                              Approve
                            </Button>
                          )}
                          {consultant.status !== 'inactive' && (
                            <Button size="sm" variant="secondary" onClick={() => updateStatus(consultant.id, 'inactive')}>
                              Deactivate
                            </Button>
                          )}
                          {consultant.status !== 'pending' && (
                            <Button size="sm" variant="secondary" onClick={() => updateStatus(consultant.id, 'pending')}>
                              Set Pending
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => suspendConsultant(consultant.id)}>
                            Suspend
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => loadStats(consultant.id)}>
                            Stats
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteConsultant(consultant.id)}
                            title="Elimina account definitivamente"
                          >
                            <FaTrash />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">Total: {total} consultants</div>
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

      {statsModal && consultantStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Consultant Statistics</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold">€{Number(consultantStats.total_earnings || 0).toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Total Minutes</p>
                <p className="text-2xl font-bold">{Math.round(consultantStats.total_minutes)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Reviews Count</p>
                <p className="text-2xl font-bold">{consultantStats.reviews_count}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Average Rating</p>
                <p className="text-2xl font-bold">{Number(consultantStats.average_rating || 0).toFixed(1)}/5</p>
              </div>
            </div>
            <Button onClick={() => { setStatsModal(null); setConsultantStats(null); }}>Close</Button>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {viewConsultantId && (
        <UserProfileModal
          userId={viewConsultantId}
          onClose={() => setViewConsultantId(null)}
        />
      )}
    </div>

  )
}

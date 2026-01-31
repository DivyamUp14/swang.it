import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { FaTrash, FaEye } from 'react-icons/fa'
import Button from '../../components/ui/Button.jsx'
import UserProfileModal from '../../components/admin/UserProfileModal.jsx'

export default function UsersManagement() {
  const { token, apiBase } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ role: '', status: '' })
  const [viewUserId, setViewUserId] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [page, filters])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50, ...filters })
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/users?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const adjustCredits = async (userId, amount, reason) => {
    if (!window.confirm(`Adjust credits by €${amount > 0 ? '+' : ''}${amount.toFixed(2)}?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/users/${userId}/credits`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ amount, reason })
      })
      if (res.ok) {
        alert('Credits adjusted successfully')
        loadUsers()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to adjust credits')
      }
    } catch (error) {
      alert('Error adjusting credits')
    }
  }

  const toggleBlock = async (userId, currentlyBlocked) => {
    if (!window.confirm(`Are you sure you want to ${currentlyBlocked ? 'unblock' : 'block'} this user?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/users/${userId}/block`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isBlocked: !currentlyBlocked })
      })
      if (res.ok) {
        alert(`User ${currentlyBlocked ? 'unblocked' : 'blocked'} successfully`)
        loadUsers()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update user')
      }
    } catch (error) {
      alert('Error updating user')
    }
  }

  const deleteUser = async (userId) => {
    if (!window.confirm('SEI SICURO? Questa azione è irreversibile e cancellerà definitivamente l\'utente e tutti i dati associati (chat, storico, ecc).')) return

    // Double confirmation for safety
    if (!window.confirm('Confermi DEFINITIVAMENTE la cancellazione?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers
      })

      if (res.ok) {
        alert('Utente cancellato con successo')
        loadUsers()
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
        <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>
        <p className="text-gray-600 mt-2">Manage all users and their credits</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4">
          <select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Roles</option>
            <option value="customer">Customers</option>
            <option value="consultant">Consultants</option>
          </select>
          {filters.role === 'consultant' && (
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="border border-gray-300 rounded px-4 py-2"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{user.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">€{Number(user.credits || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {user.is_blocked && (
                          <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Blocked</span>
                        )}
                        {user.consultant_status && (
                          <span className={`px-2 py-1 text-xs rounded ${user.consultant_status === 'active' ? 'bg-green-100 text-green-800' :
                            user.consultant_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                            {user.consultant_status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setViewUserId(user.id)}
                          title="View Full Profile"
                        >
                          <FaEye />
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            const amount = parseFloat(prompt('Enter amount to add:'))
                            if (amount && amount > 0) {
                              const reason = prompt('Reason (optional):')
                              adjustCredits(user.id, amount, reason)
                            }
                          }}
                        >
                          Add Credits
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const amount = parseFloat(prompt('Enter amount to deduct:'))
                            if (amount && amount > 0) {
                              const reason = prompt('Reason (optional):')
                              adjustCredits(user.id, -amount, reason)
                            }
                          }}
                        >
                          Deduct
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            window.open(`/admin/users/${user.id}/history`, '_blank')
                          }}
                        >
                          History
                        </Button>
                        {user.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant={user.is_blocked ? "primary" : "danger"}
                            onClick={() => toggleBlock(user.id, user.is_blocked)}
                          >
                            {user.is_blocked ? 'Unblock' : 'Block'}
                          </Button>
                        )}
                        {user.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteUser(user.id)}
                            title="Elimina account definitivamente"
                          >
                            <FaTrash />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">Total: {total} users</div>
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

      {viewUserId && (
        <UserProfileModal
          userId={viewUserId}
          onClose={() => setViewUserId(null)}
        />
      )}
    </div>
  )
}

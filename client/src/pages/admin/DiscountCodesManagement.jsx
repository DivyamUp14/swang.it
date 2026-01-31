import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function DiscountCodesManagement() {
  const { token, apiBase } = useAuth()
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: '',
    max_uses: '',
    expires_at: ''
  })

  useEffect(() => {
    loadCodes()
  }, [])

  const loadCodes = async () => {
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/discount-codes`, { headers })
      if (res.ok) {
        const data = await res.json()
        setCodes(data.codes || [])
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const createCode = async (e) => {
    e.preventDefault()
    if (!formData.code || !formData.discount_value) {
      alert('Code and discount value are required')
      return
    }

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/discount-codes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: formData.code.toUpperCase(),
          discount_type: formData.discount_type,
          discount_value: parseFloat(formData.discount_value),
          max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
          expires_at: formData.expires_at || null
        })
      })
      if (res.ok) {
        alert('Discount code created successfully')
        setShowCreateModal(false)
        setFormData({ code: '', discount_type: 'percentage', discount_value: '', max_uses: '', expires_at: '' })
        loadCodes()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to create discount code')
      }
    } catch (error) {
      alert('Error creating discount code')
    }
  }

  const toggleActive = async (codeId, currentlyActive) => {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/discount-codes/${codeId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: !currentlyActive })
      })
      if (res.ok) {
        loadCodes()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update code')
      }
    } catch (error) {
      alert('Error updating code')
    }
  }

  const deleteCode = async (codeId) => {
    if (!window.confirm('Are you sure you want to delete this discount code?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/discount-codes/${codeId}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        alert('Discount code deleted successfully')
        loadCodes()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to delete code')
      }
    } catch (error) {
      alert('Error deleting code')
    }
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Discount Codes</h1>
          <p className="text-gray-600 mt-2">Create and manage discount codes</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>Create Code</Button>
      </div>

      {loading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uses</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {codes.map(code => (
                <tr key={code.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">{code.code}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{code.discount_type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {code.discount_type === 'percentage' ? `${code.discount_value}%` : `€${Number(code.discount_value || 0).toFixed(2)}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {code.used_count || 0} / {code.max_uses || '∞'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {code.expires_at ? new Date(code.expires_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {code.is_active === 1 ? (
                      <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={code.is_active === 1 ? "secondary" : "primary"}
                        onClick={() => toggleActive(code.id, code.is_active === 1)}
                      >
                        {code.is_active === 1 ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteCode(code.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Create Discount Code</h2>
            <form onSubmit={createCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 rounded px-4 py-2"
                  placeholder="DISCOUNT10"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                <select
                  value={formData.discount_type}
                  onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                  className="w-full border border-gray-300 rounded px-4 py-2"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.discount_type === 'percentage' ? 'Percentage' : 'Amount (€)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  className="w-full border border-gray-300 rounded px-4 py-2"
                  placeholder={formData.discount_type === 'percentage' ? '10' : '5.00'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses (optional)</label>
                <input
                  type="number"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                  className="w-full border border-gray-300 rounded px-4 py-2"
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expires At (optional)</label>
                <input
                  type="datetime-local"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full border border-gray-300 rounded px-4 py-2"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary">Create</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

  )
}


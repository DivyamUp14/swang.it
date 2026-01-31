import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function BonusesManagement() {
  const { token, apiBase } = useAuth()
  const [bonuses, setBonuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [grantForm, setGrantForm] = useState({ userId: '', amount: '', reason: '' })

  useEffect(() => {
    loadBonuses()
  }, [])

  const loadBonuses = async () => {
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/bonuses`, { headers })
      if (res.ok) {
        const data = await res.json()
        setBonuses(data.bonuses || [])
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const grantBonus = async (e) => {
    e.preventDefault()
    if (!grantForm.userId || !grantForm.amount || parseFloat(grantForm.amount) <= 0) {
      alert('Please enter valid user ID and amount')
      return
    }

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/bonuses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: Number(grantForm.userId),
          amount: parseFloat(grantForm.amount),
          reason: grantForm.reason
        })
      })
      if (res.ok) {
        alert('Bonus granted successfully')
        setShowGrantForm(false)
        setGrantForm({ userId: '', amount: '', reason: '' })
        loadBonuses()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to grant bonus')
      }
    } catch (error) {
      alert('Error granting bonus')
    }
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bonuses Management</h1>
          <p className="text-gray-600 mt-2">View and grant bonus credits to users</p>
        </div>
        <Button variant="primary" onClick={() => setShowGrantForm(!showGrantForm)}>
          {showGrantForm ? 'Cancel' : 'Grant Bonus'}
        </Button>
      </div>

      {showGrantForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Grant Bonus</h2>
          <form onSubmit={grantBonus} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
              <input
                type="number"
                required
                value={grantForm.userId}
                onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
                placeholder="Enter user ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (€)</label>
              <input
                type="number"
                step="0.01"
                required
                min="0.01"
                value={grantForm.amount}
                onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
                placeholder="Enter amount"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={grantForm.reason}
                onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
                placeholder="Reason for bonus"
              />
            </div>
            <Button type="submit" variant="primary">Grant Bonus</Button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bonuses.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    No bonuses granted yet
                  </td>
                </tr>
              ) : (
                bonuses.map(bonus => (
                  <tr key={bonus.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bonus.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div>{bonus.email}</div>
                        <div className="text-xs text-gray-500 capitalize">{bonus.role}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      €{Math.abs(Number(bonus.amount || 0)).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {bonus.description || 'Bonus credit'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(bonus.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>

  )
}


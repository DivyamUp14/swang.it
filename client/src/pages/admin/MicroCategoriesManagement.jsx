import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function MicroCategoriesManagement() {
  const { token, apiBase } = useAuth()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showMergeForm, setShowMergeForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [filters, setFilters] = useState({ macro_category: '', showArchived: false })
  const [formData, setFormData] = useState({ name: '', macro_category: 'coaching', requires_verification: false })
  const [mergeData, setMergeData] = useState({ fromId: '', toId: '' })

  useEffect(() => {
    loadCategories()
  }, [filters])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.macro_category) params.append('macro_category', filters.macro_category)
      if (filters.showArchived) params.append('archived', 'true')
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories || [])
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        alert('Micro-category created successfully')
        setShowCreateForm(false)
        setFormData({ name: '', macro_category: 'coaching', requires_verification: false })
        loadCategories()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to create micro-category')
      }
    } catch (error) {
      alert('Error creating micro-category')
    }
  }

  const handleUpdate = async (id, updates) => {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      })
      if (res.ok) {
        alert('Micro-category updated successfully')
        setEditingId(null)
        loadCategories()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update micro-category')
      }
    } catch (error) {
      alert('Error updating micro-category')
    }
  }

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this micro-category? It will be hidden but not deleted.')) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_archived: true })
      })
      if (res.ok) {
        alert('Micro-category archived')
        loadCategories()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to archive micro-category')
      }
    } catch (error) {
      alert('Error archiving micro-category')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this micro-category? This will only work if no consultants are using it.')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories/${id}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || 'Micro-category deleted')
        loadCategories()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to delete micro-category')
      }
    } catch (error) {
      alert('Error deleting micro-category')
    }
  }

  const handleMerge = async (e) => {
    e.preventDefault()
    if (!mergeData.fromId || !mergeData.toId || mergeData.fromId === mergeData.toId) {
      alert('Please select two different categories')
      return
    }

    if (!window.confirm('Merge these categories? All consultants using the first category will be updated to use the second.')) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/micro-categories/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mergeData)
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || 'Categories merged successfully')
        setShowMergeForm(false)
        setMergeData({ fromId: '', toId: '' })
        loadCategories()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to merge categories')
      }
    } catch (error) {
      alert('Error merging categories')
    }
  }

  const groupedCategories = categories.reduce((acc, cat) => {
    const key = cat.macro_category
    if (!acc[key]) acc[key] = []
    acc[key].push(cat)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Micro-Categories Management</h1>
          <p className="text-gray-600 mt-2">Manage micro-categories for coaching and cartomancy</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create New'}
          </Button>
          <Button variant="secondary" onClick={() => setShowMergeForm(!showMergeForm)}>
            {showMergeForm ? 'Cancel' : 'Merge Categories'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4">
          <select
            value={filters.macro_category}
            onChange={(e) => setFilters({ ...filters, macro_category: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Categories</option>
            <option value="coaching">Coaching</option>
            <option value="cartomancy">Cartomancy</option>
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => setFilters({ ...filters, showArchived: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Show Archived</span>
          </label>
        </div>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Create Micro-Category</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
                placeholder="Enter category name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Macro Category</label>
              <select
                required
                value={formData.macro_category}
                onChange={(e) => setFormData({ ...formData, macro_category: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
              >
                <option value="coaching">Coaching</option>
                <option value="cartomancy">Cartomancy</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requires_verification}
                  onChange={(e) => setFormData({ ...formData, requires_verification: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Requires Verification</span>
              </label>
            </div>
            <Button type="submit" variant="primary">Create</Button>
          </form>
        </div>
      )}

      {showMergeForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Merge Micro-Categories</h2>
          <form onSubmit={handleMerge} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From (will be archived)</label>
              <select
                required
                value={mergeData.fromId}
                onChange={(e) => setMergeData({ ...mergeData, fromId: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
              >
                <option value="">Select category...</option>
                {categories.filter(c => !c.is_archived).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({cat.macro_category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To (will receive all consultants)</label>
              <select
                required
                value={mergeData.toId}
                onChange={(e) => setMergeData({ ...mergeData, toId: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2"
              >
                <option value="">Select category...</option>
                {categories.filter(c => !c.is_archived && c.id !== Number(mergeData.fromId)).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({cat.macro_category})</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary">Merge</Button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">
          {['coaching', 'cartomancy'].map(macro => (
            groupedCategories[macro] && (
              <div key={macro} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 capitalize">{macro}</h2>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verification</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {groupedCategories[macro].map(category => (
                      <tr key={category.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingId === category.id ? (
                            <input
                              type="text"
                              defaultValue={category.name}
                              onBlur={(e) => {
                                if (e.target.value !== category.name) {
                                  handleUpdate(category.id, { name: e.target.value })
                                } else {
                                  setEditingId(null)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur()
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="w-full border border-gray-300 rounded px-2 py-1"
                              autoFocus
                            />
                          ) : (
                            <span className="cursor-pointer hover:text-blue-600" onClick={() => setEditingId(category.id)}>
                              {category.name}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {category.requires_verification === 1 ? (
                            <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">Required</span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Not Required</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {category.is_archived === 1 ? (
                            <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Archived</span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Active</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            {category.is_archived === 0 ? (
                              <Button size="sm" variant="secondary" onClick={() => handleArchive(category.id)}>
                                Archive
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => handleUpdate(category.id, { is_archived: false })}>
                                Restore
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => handleDelete(category.id)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ))}
          {categories.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-500">
              No micro-categories found
            </div>
          )}
        </div>
      )}
    </div>

  )
}


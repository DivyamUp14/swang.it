import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'

export default function ReviewsManagement() {
  const { token, apiBase } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ consultantId: '', customerId: '', isHidden: '' })

  useEffect(() => {
    loadReviews()
  }, [page, filters])

  const loadReviews = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50 })
      if (filters.consultantId) params.append('consultantId', filters.consultantId)
      if (filters.customerId) params.append('customerId', filters.customerId)
      if (filters.isHidden !== '') params.append('isHidden', filters.isHidden)

      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/reviews?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setReviews(data.reviews || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const toggleHide = async (reviewId, currentlyHidden) => {
    if (!window.confirm(`Are you sure you want to ${currentlyHidden ? 'show' : 'hide'} this review?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/reviews/${reviewId}/hide`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isHidden: !currentlyHidden })
      })
      if (res.ok) {
        alert(`Review ${currentlyHidden ? 'shown' : 'hidden'} successfully`)
        loadReviews()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update review')
      }
    } catch (error) {
      alert('Error updating review')
    }
  }

  const deleteReview = async (reviewId) => {
    if (!window.confirm('Are you sure you want to delete this review? This action cannot be undone.')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        alert('Review deleted successfully')
        loadReviews()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to delete review')
      }
    } catch (error) {
      alert('Error deleting review')
    }
  }

  const addNotes = async (reviewId) => {
    const notes = prompt('Enter moderation notes:')
    if (!notes || !notes.trim()) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/reviews/${reviewId}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: notes.trim() })
      })
      if (res.ok) {
        alert('Moderation notes added successfully')
        loadReviews()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to add notes')
      }
    } catch (error) {
      alert('Error adding notes')
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Reviews Moderation</h1>
        <p className="text-gray-600 mt-2">Manage and moderate all reviews</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4">
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
          <select
            value={filters.isHidden}
            onChange={(e) => setFilters({ ...filters, isHidden: e.target.value })}
            className="border border-gray-300 rounded px-4 py-2"
          >
            <option value="">All Reviews</option>
            <option value="false">Visible</option>
            <option value="true">Hidden</option>
          </select>
          <Button onClick={loadReviews}>Filter</Button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviews.map(review => (
                  <tr key={review.id} className={review.is_hidden ? 'bg-gray-100' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{review.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{review.customer_email || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {review.consultant_name || review.consultant_email || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="text-yellow-400">★</span>
                        <span className="ml-1">{review.rating}/5</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {review.comment || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {review.is_hidden ? (
                        <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Hidden</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Visible</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={review.is_hidden ? "primary" : "secondary"}
                          onClick={() => toggleHide(review.id, review.is_hidden)}
                        >
                          {review.is_hidden ? 'Show' : 'Hide'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => addNotes(review.id)}
                        >
                          Notes
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteReview(review.id)}
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
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">Total: {total} reviews</div>
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


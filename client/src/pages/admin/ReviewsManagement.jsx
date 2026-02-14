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
  const [editModal, setEditModal] = useState({ open: false, review: null })
  const [editForm, setEditForm] = useState({ rating: 5, comment: '', reply: '' })

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
      // Use general PUT endpoint
      const res = await fetch(`${apiBase}/api/admin/reviews/${reviewId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_hidden: !currentlyHidden })
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
    if (notes === null) return // Cancelled

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      // Use general PUT endpoint
      const res = await fetch(`${apiBase}/api/admin/reviews/${reviewId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ moderation_notes: notes.trim() })
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

  const handleEditClick = (review) => {
    setEditModal({ open: true, review })
    setEditForm({
      rating: review.rating,
      comment: review.comment || '',
      reply: review.reply || ''
    })
  }

  const handleEditSubmit = async () => {
    if (!editModal.review) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

      const res = await fetch(`${apiBase}/api/admin/reviews/${editModal.review.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          rating: Number(editForm.rating),
          comment: editForm.comment,
          reply: editForm.reply
        })
      })

      if (res.ok) {
        // Update local state without full reload
        setReviews(reviews.map(r =>
          r.id === editModal.review.id
            ? { ...r, rating: Number(editForm.rating), comment: editForm.comment, reply: editForm.reply }
            : r
        ))
        setEditModal({ open: false, review: null })
        alert('Review updated successfully')
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update review')
      }
    } catch (error) {
      alert('Error updating review')
    }
  }

  // Helper to format name cleanly and hide fake emails
  const formatName = (review) => {
    if (review.customer_nickname) return review.customer_nickname
    const email = review.customer_email || ''
    if (email.startsWith('fake_')) {
      // Extract name between 'fake_' and '_' or '@'
      // e.g. fake_silvia_sun_123@... -> silvia_sun -> Silvia Sun
      const parts = email.split('@')[0].split('_')
      if (parts.length >= 3) {
        // fake, name, timestamp...
        // remove first (fake) and last (timestamp)
        return parts.slice(1, parts.length - 1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      }
      return 'Cliente Test'
    }
    return email || 'N/A'
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
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviews.map(review => (
                  <tr key={review.id} className={review.is_hidden ? 'bg-gray-100' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{review.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatName(review)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {review.consultant_name || review.consultant_email || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="text-yellow-400">★</span>
                        <span className="ml-1">{review.rating}/5</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={review.comment || ''}>
                      {review.comment || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {review.is_hidden ? (
                        <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Hidden</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Visible</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="!px-2 !py-1 !text-xs"
                          onClick={() => handleEditClick(review)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={review.is_hidden ? "primary" : "secondary"}
                          className="!px-2 !py-1 !text-xs"
                          onClick={() => toggleHide(review.id, review.is_hidden)}
                        >
                          {review.is_hidden ? 'Show' : 'Hide'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="!px-2 !py-1 !text-xs"
                          onClick={() => addNotes(review.id)}
                        >
                          Notes
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="!px-2 !py-1 !text-xs"
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

      {/* Edit Modal */}
      {editModal.open && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">Edit Review #{editModal.review.id}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Rating</label>
                <select
                  value={editForm.rating}
                  onChange={e => setEditForm({ ...editForm, rating: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                >
                  {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Comment</label>
                <textarea
                  value={editForm.comment}
                  onChange={e => setEditForm({ ...editForm, comment: e.target.value })}
                  rows={4}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Reply</label>
                <textarea
                  value={editForm.reply}
                  onChange={e => setEditForm({ ...editForm, reply: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  placeholder="Official reply..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setEditModal({ open: false, review: null })}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


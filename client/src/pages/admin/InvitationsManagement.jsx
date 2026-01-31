import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'

export default function InvitationsManagement() {
  const { token, apiBase } = useAuth()
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [email, setEmail] = useState('')
  const [greeting, setGreeting] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    loadInvitations()
  }, [page])

  const loadInvitations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 50 })
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/invitations?${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setInvitations(data.invitations || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error loading invitations:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendInvitation = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!email || !email.trim()) {
      setError('Email è obbligatorio')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('Email non valida')
      return
    }

    setSending(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

      const res = await fetch(`${apiBase}/api/admin/invitations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: email.trim(),
          greeting: greeting.trim() || null
        })
      })

      if (res.ok) {
        setSuccess('Invito inviato con successo!')
        setEmail('')
        setGreeting('')
        loadInvitations()
      } else {
        const errorData = await res.json().catch(() => ({}))
        setError(errorData.error || 'Errore nell\'invio dell\'invito')
      }
    } catch (error) {
      setError('Errore di connessione')
    } finally {
      setSending(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return dateString
    }
  }

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Gestione Inviti</h1>
        <p className="text-gray-600 mt-2">Invia inviti per permettere ai consulenti di registrarsi</p>
      </div>

      {/* Send Invitation Form */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Invia Nuovo Invito</h2>
        <form onSubmit={sendInvitation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email del consulente *
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="esempio@email.com"
              required
              disabled={sending}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Messaggio di benvenuto (opzionale)
            </label>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Aggiungi un messaggio personalizzato di benvenuto..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              disabled={sending}
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              {success}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={sending}>
            {sending ? 'Invio in corso...' : 'Invia Invito'}
          </Button>
        </form>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Inviti Inviati</h2>
        </div>
        {loading ? (
          <div className="text-center py-12">Caricamento...</div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Nessun invito inviato</div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scadenza</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stato</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Invio</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invitations.map(invitation => {
                  const expired = isExpired(invitation.expires_at)
                  const used = invitation.used
                  return (
                    <tr key={invitation.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{invitation.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                        {invitation.token.substring(0, 16)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(invitation.expires_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {used ? (
                          <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
                            Utilizzato
                          </span>
                        ) : expired ? (
                          <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">
                            Scaduto
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">
                            Attivo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(invitation.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-4 px-6 py-4 flex justify-between items-center border-t border-gray-200">
              <div className="text-sm text-gray-600">Totale: {total} inviti</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Precedente
                </Button>
                <span className="px-4 py-2 text-sm">Pagina {page}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 50 >= total}
                >
                  Successivo
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div >
  )
}


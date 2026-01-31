import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { FaMoneyBillWave, FaClock, FaVideo, FaUsers, FaHourglassHalf } from 'react-icons/fa'
import ConsultantNav from '../components/layout/ConsultantNav.jsx'
import Button from '../components/ui/Button.jsx'
import { io } from 'socket.io-client'

export default function ConsultantHome() {
  const { token, apiBase, user, setUser } = useAuth()
  const navigate = useNavigate()
  const [incoming, setIncoming] = useState([])
  const [isOnline, setIsOnline] = useState(false)
  const [stats, setStats] = useState({ weekly: { minutes: 0, sessions: 0 }, monthly: { clients: 0, sessions: 0 } })
  const [profilePending, setProfilePending] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'pending', 'accepted', 'declined'
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const socketRef = useRef(null)
  const audioRef = useRef(null)

  const commonHeaders = useMemo(() => {
    const base = {}
    if (token) base.Authorization = `Bearer ${token}`
    if ((apiBase || '').includes('ngrok')) base['ngrok-skip-browser-warning'] = 'true'
    return base
  }, [token, apiBase])

  const loadIncoming = async () => {
    try {
      const res = await fetch(`${apiBase}/api/incoming-requests`, { headers: commonHeaders })
      const ctype = res.headers.get('content-type') || ''
      if (!ctype.includes('application/json')) {
        const txt = await res.text().catch(() => '')
        setIncoming([])
        return
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Error loading requests' }))
        // If 403, consultant profile is pending approval
        if (res.status === 403) {
          setIncoming([])
          setProfilePending(true)
          return
        }
        setIncoming([])
        return
      }
      // Success - profile is active
      setProfilePending(false)
      const data = await res.json()
      // Ensure data is an array
      setIncoming(Array.isArray(data) ? data : [])
    } catch (error) {
      setIncoming([])
    }
  }

  // Initialize Socket.IO for real-time notifications
  useEffect(() => {
    if (!token || !user || user.role !== 'consultant') return

    const socket = io(apiBase, {
      transports: ['polling', 'websocket'],
      reconnection: true
    })
    socketRef.current = socket

    // Authenticate and join consultant room
    socket.emit('authenticate', { token })
    socket.emit('join_consultant_room', { consultantId: user.id })

    // Listen for new requests (reload list, but modal is handled globally)
    socket.on('new_request', async (data) => {
      // Reload incoming requests list
      await loadIncoming()

      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Nuova Richiesta', {
          body: 'Hai ricevuto una nuova richiesta di consulenza',
          icon: '/favicon.ico'
        })
      }
    })

    // Listen for request accepted/declined to show them in the list
    socket.on('request_accepted', async () => {
      await loadIncoming()
    })

    socket.on('request_declined', async () => {
      await loadIncoming()
    })

    // Listen for request cancellations
    socket.on('request_cancelled', async (data) => {
      await loadIncoming()
    })

    // Listen for expired requests
    socket.on('request_expired', async (data) => {
      await loadIncoming()
    })

    // Listen for new chat messages from customers
    socket.on('chat_message', async (data) => {
      // Reload requests to show updated status
      await loadIncoming()

      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Nuovo Messaggio', {
          body: 'Hai ricevuto un nuovo messaggio da un cliente',
          icon: '/favicon.ico'
        })
      }
    })

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { })
    }

    return () => {
      socket.disconnect()
    }
  }, [token, user, apiBase])

  useEffect(() => {
    loadIncoming();
    loadOnlineStatus();
    loadStats();
  }, [])

  const loadStats = async () => {
    try {
      const res = await fetch(`${apiBase}/api/consultant/stats`, { headers: commonHeaders });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  const loadOnlineStatus = async () => {
    // Load current online status from user data
    if (user && user.is_online !== undefined) {
      setIsOnline(user.is_online);
    }
  }

  const updateOnlineStatus = async (online) => {
    try {
      const res = await fetch(`${apiBase}/api/consultant/online-status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...commonHeaders }, body: JSON.stringify({ isOnline: online }) })
      if (res.ok) {
        setIsOnline(online);
        // Update user object
        setUser({ ...user, is_online: online });
      }
    } catch (error) {
      alert('Impossibile aggiornare lo stato online. Riprova più tardi.');
    }
  }

  const decide = async (id, decision) => {
    const res = await fetch(`${apiBase}/api/requests/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...commonHeaders }, body: JSON.stringify({ decision }) })
    if (res.ok) {
      const data = await res.json()
      await loadIncoming()

      // If accepted and has session, navigate to call/chat
      if (decision === 'accept' && data.session) {
        const request = incoming.find(r => r.id === id)
        const requestType = request?.type || 'chat'

        if (request) {
          // For voice/video calls: navigate to call page
          // For chat: navigate to chat page
          if (requestType === 'voice' || requestType === 'video') {
            navigate(`/call/${id}`)
          } else {
            navigate(`/chat/${id}`)
          }
        }
      }

      // Reload list to show the request after decision
      await loadIncoming()
    } else {
      alert('Operazione fallita')
    }
  }

  const endSession = async (sessionId) => {
    if (!window.confirm('Sei sicuro di voler terminare questa sessione?')) {
      return
    }

    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/end`, {
        method: 'PUT',
        headers: commonHeaders
      })

      if (res.ok) {
        await loadIncoming()
        alert('Sessione terminata con successo')
      } else {
        const error = await res.json().catch(() => ({ error: 'Errore sconosciuto' }))
        alert(error.error || 'Impossibile terminare la sessione')
      }
    } catch (error) {
      alert('Errore durante la terminazione della sessione')
    }
  }


  const pendingRequests = incoming.filter(r => r.status === 'pending')
  // FIX: Filter accepted requests to only show active (non-ended) sessions
  const acceptedRequests = incoming.filter(r => r.status === 'accepted' && r.session_status === 'active')

  // Filter requests based on status and search query
  // Hide pending voice/video requests from list (they show in modal instead)
  // Hide declined requests and closed/ended sessions - once accepted/declined and ended, don't show in list
  const filteredRequests = useMemo(() => {
    let filtered = incoming

    // Hide pending voice/video requests - they're shown in the global modal
    // Only show them after they're accepted/declined (status changes from pending)
    filtered = filtered.filter(r => {
      if (r.status === 'pending' && (r.type === 'voice' || r.type === 'video')) {
        // Hide pending voice/video requests - they're handled by global modal
        return false
      }
      return true
    })

    // Filter by status (declined filter will show empty list since we filtered them out above)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    // Filter by search query (customer email/name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(r => {
        const email = (r.customer_email || '').toLowerCase()
        return email.includes(query)
      })
    }

    return filtered
  }, [incoming, statusFilter, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredRequests.length / pageSize)
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredRequests.slice(startIndex, startIndex + pageSize)
  }, [filteredRequests, currentPage, pageSize])

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, searchQuery])

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Dashboard Consulente
          </h1>
          <p className="text-gray-600">
            Gestisci le tue consulenze e le richieste in arrivo
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Guadagni Totali</p>
                <p className="text-2xl font-bold text-gray-900">€{Number(user.credits || 0).toFixed(2)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <FaMoneyBillWave className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Questa Settimana</p>
                <p className="text-2xl font-bold text-gray-900">{stats.weekly.minutes} min</p>
                <p className="text-xs text-gray-500 mt-1">Tempo di sessione</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FaHourglassHalf className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Clienti Totali</p>
                <p className="text-2xl font-bold text-gray-900">{stats.monthly.clients}</p>
                <p className="text-xs text-gray-500 mt-1">Questo mese</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <FaUsers className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Richieste in Attesa</p>
                <p className="text-2xl font-bold text-gray-900">{pendingRequests.length}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <FaClock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Sessioni Attive</p>
                <p className="text-2xl font-bold text-gray-900">{acceptedRequests.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FaVideo className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Profile Pending Approval Message */}
        {profilePending && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Profilo in attesa di approvazione
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Il tuo profilo è in attesa di approvazione da parte dell'amministratore.
                    Non puoi ricevere richieste fino all'approvazione del profilo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Online Status Toggle & Request Payout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Status</h3>
                <p className="text-sm text-gray-600">
                  {isOnline ? 'Sei attualmente online' : 'Sei attualmente offline'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOnline}
                  onChange={(e) => updateOnlineStatus(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </label>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Richiedi Pagamento</h3>
            <p className="text-sm text-green-100 mb-4">
              Disponibile: €{Number(user.credits || 0).toFixed(2)}
            </p>
            <Link to="/consultant/earnings">
              <Button
                size="md"
                variant="green"
                className="bg-white w-full"
              >
                Richiedi Pagamento
              </Button>
            </Link>
          </div>
        </div>

        {/* Incoming Requests */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Richieste in Arrivo</h2>
            {pendingRequests.length > 0 && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
                {pendingRequests.length} nuove
              </span>
            )}
          </div>

          {/* Search Input */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Cerca per nome utente o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex space-x-2 mb-4 border-b border-gray-200">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${statusFilter === 'all'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Tutte ({incoming.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${statusFilter === 'pending'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              In Attesa ({pendingRequests.length})
            </button>
            <button
              onClick={() => setStatusFilter('accepted')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${statusFilter === 'accepted'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Accettate ({acceptedRequests.length})
            </button>
            <button
              onClick={() => setStatusFilter('declined')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${statusFilter === 'declined'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Rifiutate ({incoming.filter(r => r.status === 'declined').length})
            </button>
          </div>

          {filteredRequests.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {incoming.length === 0
                ? 'Nessuna richiesta in arrivo al momento.'
                : 'Nessuna richiesta corrisponde ai filtri selezionati.'}
            </p>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedRequests.map(r => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-grow">
                      <div className="font-medium text-gray-900 mb-1">
                        {r.customer_name || r.customer_email?.split('@')[0] || 'Customer'}
                      </div>
                      <div className="text-sm text-gray-600">
                        Stato: <span className={`font-medium ${r.session_status === 'active' ? 'text-green-600' :
                          r.session_status === 'closed' ? 'text-red-600' :
                            r.status === 'accepted' ? 'text-green-600' :
                              r.status === 'pending' ? 'text-yellow-600' :
                                'text-gray-600'
                          }`}>
                          {r.session_status === 'active' ? 'Attivo' :
                            r.session_status === 'closed' ? 'Chiuso' :
                              r.status === 'accepted' ? 'Accettato' :
                                r.status === 'pending' ? 'In attesa' :
                                  r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {r.status === 'pending' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => decide(r.id, 'accept')}
                          >
                            Accetta
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => decide(r.id, 'decline')}
                          >
                            Rifiuta
                          </Button>
                        </>
                      )}
                      {r.session_status === 'active' && r.session_id && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => endSession(r.session_id)}
                        >
                          Termina Sessione
                        </Button>
                      )}
                      {r.status === 'accepted' && r.session_status !== 'active' && r.session_status !== 'closed' && (
                        (() => {
                          // Check if appointment is within 5 minutes or in the past
                          const isChat = r.type === 'chat';
                          // For chats, always consistent if accepted? Or bound by time? 
                          // The User wants consistency. Let's apply time check for Calls. Chat might be flexible but let's stick to appointment time for consistency.

                          let isActive = true;
                          if (r.appointment_date) {
                            const apptTime = new Date(r.appointment_date).getTime();
                            const nowTime = new Date().getTime();
                            const diff = apptTime - nowTime;
                            // Active if less than 5 minutes (300,000 ms) remaining until start
                            // i.e. it is either in the past OR starting soon
                            isActive = diff <= 300000;
                          }

                          return isActive ? (
                            <Link to={r.type === 'voice' || r.type === 'video' ? `/call/${r.id}` : `/chat/${r.id}`}>
                              <Button variant="primary" size="sm">Apri</Button>
                            </Link>
                          ) : (
                            <span title="Il link sarà attivo 5 minuti prima dell'orario programato">
                              <Button variant="primary" size="sm" disabled className="opacity-50 cursor-not-allowed">
                                Apri
                              </Button>
                            </span>
                          );
                        })()
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredRequests.length)} di {filteredRequests.length} richieste
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Precedente
                    </Button>
                    <span className="text-sm text-gray-700">
                      Pagina {currentPage} di {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Successivo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}



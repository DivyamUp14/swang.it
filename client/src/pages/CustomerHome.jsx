import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ConsultantCard from '../components/ui/ConsultantCard.jsx'
import Button from '../components/ui/Button.jsx'
import { translateCategory } from '../utils/categoryTranslations'
import { io } from 'socket.io-client'
// TODO: Update this path with your actual banner image filename
import bannerImage from '../assets/images/banner.png'

export default function CustomerHome() {
  const { token, apiBase, user, setUser } = useAuth()
  const location = useLocation()
  const commonHeaders = useMemo(() => {
    const base = {}
    if (token) base.Authorization = `Bearer ${token}`
    if ((apiBase || '').includes('ngrok')) base['ngrok-skip-browser-warning'] = 'true'
    return base
  }, [token, apiBase])
  const [consultants, setConsultants] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [myRequests, setMyRequests] = useState([])
  const [favorites, setFavorites] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(
    new URLSearchParams(location.search).get('category') || location.state?.filterCategory || 'all'
  )
  const [selectedMicroCategory, setSelectedMicroCategory] = useState(
    location.state?.filterMicroCategory || null
  )
  const pageSize = 10
  const socketRef = useRef(null)

  const loadConsultants = async (p = page, category = selectedCategory, microCat = selectedMicroCategory) => {
    let url = `${apiBase}/api/consultants?page=${p}&pageSize=${pageSize}`
    if (category && category !== 'all') {
      url += `&category=${category}`
    }
    if (microCat) {
      url += `&micro_category=${microCat}`
    }
    const res = await fetch(url, { headers: commonHeaders })
    const ctype = res.headers.get('content-type') || ''
    if (!ctype.includes('application/json')) {
      const txt = await res.text().catch(() => '')
      return
    }
    const data = await res.json()
    setConsultants(data.consultants || [])
    setTotal(data.total || 0)
    setPage(data.page || 1)
  }

  const loadMyRequests = async () => {
    const res = await fetch(`${apiBase}/api/my-requests`, { headers: commonHeaders })
    const data = await res.json()
    setMyRequests(data)
  }

  const loadFavorites = async () => {
    try {
      const res = await fetch(`${apiBase}/api/favorites`, { headers: commonHeaders })
      if (res.ok) {
        const data = await res.json()
        setFavorites(data.favorites || [])
      }
    } catch (error) {
    }
  }

  // Initialize Socket.IO for real-time request updates
  useEffect(() => {
    if (!token || !user || user.role !== 'customer') return

    const socket = io(apiBase, {
      transports: ['polling', 'websocket'],
      reconnection: true
    })
    socketRef.current = socket

    // Authenticate and join customer room
    socket.emit('authenticate', { token })
    socket.emit('join_customer_room', { customerId: user.id })

    // Listen for request updates (cancelled, expired, accepted, etc.)
    socket.on('request_expired', async () => {
      await loadMyRequests()
    })

    // FIX #7: Listen for consultant status updates (busy/available)
    socket.on('consultant_status_update', async (data) => {
      if (data && data.consultantId) {
        // Update consultant status in the list
        setConsultants(prev => prev.map(c =>
          c.id === data.consultantId
            ? { ...c, is_busy: data.is_busy }
            : c
        ));
      }
    });

    socket.on('request_accepted', async (data) => {
      await loadMyRequests()
      // Auto-navigate customer to call/chat screen when consultant accepts
      if (data && data.requestId) {
        // Get request type from event data or fetch from API if missing
        let requestType = data.type
        if (!requestType) {
          try {
            const headers = { Authorization: `Bearer ${token}` }
            if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
            const reqRes = await fetch(`${apiBase}/api/requests/${data.requestId}`, { headers })
            if (reqRes.ok) {
              const reqData = await reqRes.json()
              requestType = reqData.type || 'chat'
            } else {
              requestType = 'chat' // Default to chat if fetch fails
            }
          } catch (e) {
            requestType = 'chat' // Default to chat if fetch fails
          }
        }

        // Navigate based on request type
        if (requestType === 'voice' || requestType === 'video') {
          window.location.href = `/call/${data.requestId}`
        } else if (requestType === 'chat') {
          window.location.href = `/chat/${data.requestId}`
        }
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [token, user, apiBase])

  useEffect(() => {
    loadConsultants(1, selectedCategory, selectedMicroCategory);
    loadMyRequests()
    loadFavorites()
  }, [selectedCategory, selectedMicroCategory])

  useEffect(() => {
    loadConsultants(page);
    // Refresh consultant list every 10 seconds to update online status
    const interval = setInterval(() => {
      loadConsultants(page, selectedCategory, selectedMicroCategory);
    }, 10000);
    return () => clearInterval(interval);
  }, [page, selectedCategory, selectedMicroCategory]);

  const sendRequest = async (consultantId, type = 'chat') => {
    // NEW: Pre-call Balance Check
    const targetConsultant = consultants.find(c => c.id === consultantId)
    let requiredCredits = 0.5; // default for chat
    if (type === 'voice') requiredCredits = Number(targetConsultant?.voice_price || 5);
    if (type === 'video') requiredCredits = Number(targetConsultant?.video_price || 5);
    if (type === 'chat') requiredCredits = Number(targetConsultant?.chat_price || 0.1);

    if (user.credits < requiredCredits) {
      alert(`Credito insufficiente per avviare una richiesta ${type === 'chat' ? 'di chat' : type === 'voice' ? 'vocale' : 'video'}. Ricarica il portafoglio.`);
      return;
    }

    // CHAT NOW WORKS LIKE CALLS: All request types follow the same logic
    // Check for pending request first
    const pendingRequest = myRequests.find(r => r.consultant_id === consultantId && r.status === 'pending')
    if (pendingRequest) {
      alert('Hai già una richiesta in sospeso con questo consulente. Attendi l\'approvazione.')
      return
    }

    // Check if we can reuse existing active session (for voice/video/chat)
    const existingRequest = myRequests.find(r =>
      r.consultant_id === consultantId &&
      r.status === 'accepted' &&
      r.type === type
    )
    if (existingRequest) {
      const isEnded = existingRequest.ended_at && existingRequest.ended_at !== null && existingRequest.ended_at !== '';
      const hasRoom = existingRequest.room_name && existingRequest.room_name !== null && existingRequest.room_name !== '';

      // Only reuse if session is active
      if (!isEnded && hasRoom) {
        if (type === 'chat') {
          window.location.href = `/chat/${existingRequest.id}`;
        } else {
          window.location.href = `/call/${existingRequest.id}`;
        }
        return;
      }
    }

    // Create new request
    const res = await fetch(`${apiBase}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...commonHeaders },
      body: JSON.stringify({ consultantId, type })
    })
    if (res.ok) {
      const responseData = await res.json()
      // Find consultant info for the modal
      const targetConsultant = consultants.find(c => c.id === consultantId)
      const requestForModal = {
        ...responseData, // contains id
        status: 'pending',
        type: type,
        consultant_id: consultantId,
        consultant_name: targetConsultant?.name || targetConsultant?.email?.split('@')[0] || 'Consulente'
      }
      await loadMyRequests()
      window.dispatchEvent(new CustomEvent('request_created', { detail: requestForModal }))
    } else {
      const e = await res.json().catch(() => ({}))
      alert(e.error || 'Invio richiesta fallito')
    }
  }

  const handleFavorite = async (consultantId) => {
    const isFavorite = favorites.some(f => f.consultant_id === consultantId)
    try {
      if (isFavorite) {
        const res = await fetch(`${apiBase}/api/favorites/${consultantId}`, {
          method: 'DELETE',
          headers: commonHeaders
        })
        if (res.ok) {
          await loadFavorites()
        }
      } else {
        const res = await fetch(`${apiBase}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...commonHeaders },
          body: JSON.stringify({ consultantId })
        })
        if (res.ok) {
          await loadFavorites()
        }
      }
    } catch (error) {
    }
  }

  const pages = Math.ceil(total / pageSize)

  const requestsByConsultant = Object.fromEntries(
    myRequests.map(r => [r.consultant_id, r])
  )

  // Sort consultants: online first
  const sortedConsultants = [...consultants].sort((a, b) => {
    const aOnline = a.is_online || false
    const bOnline = b.is_online || false
    if (aOnline && !bOnline) return -1
    if (!aOnline && bOnline) return 1
    return 0
  })

  return (
    <div className="min-h-screen">
      {/* Welcome Banner Section */}
      <div className="relative w-full overflow-hidden mb-8">
        <div
          className="relative w-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${bannerImage})`,
            minHeight: '300px',
            backgroundPosition: 'center right'
          }}
        >
          {/* Overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-900/70 via-purple-800/50 to-transparent"></div>

          {/* Welcome Content */}
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
            <div className="max-w-xl">
              <h1 className="text-3xl md:text-4xl font-bold mb-3 text-white drop-shadow-lg">
                Benvenuto, {user.email?.split('@')[0] || 'Utente'}!
              </h1>
              <p className="text-lg md:text-xl text-white/90 drop-shadow-md">
                Trova il consulente perfetto per le tue esigenze
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

        {/* Category Switcher */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => {
              setSelectedCategory('coaching')
              setSelectedMicroCategory(null)
            }}
            className={`p-6 rounded-lg border-2 transition-all ${selectedCategory === 'coaching'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <h3 className="text-xl font-bold text-gray-900">COACHING</h3>
            <p className="text-sm text-gray-600 mt-1">Guida alla vita e alla carriera</p>
          </button>
          <button
            onClick={() => {
              setSelectedCategory('cartomancy')
              setSelectedMicroCategory(null)
            }}
            className={`p-6 rounded-lg border-2 transition-all ${selectedCategory === 'cartomancy'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <h3 className="text-xl font-bold text-gray-900">CARTOMANZIA</h3>
            <p className="text-sm text-gray-600 mt-1">Tarocchi e Astrologia</p>
          </button>
          {selectedCategory !== 'all' && (
            <button
              onClick={() => {
                setSelectedCategory('all')
                setSelectedMicroCategory(null)
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Rimuovi Filtro
            </button>
          )}
        </div>

        {/* Consultants List */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Consulenti Disponibili
            </h2>
            <div className="text-sm text-gray-600">
              Mostrando {consultants.length} di {total}
            </div>
          </div>

          {/* Micro-Category Filter Tags */}
          {sortedConsultants.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Filtra per Specializzazione:</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(sortedConsultants.flatMap(c => c.micro_categories || []))).map((cat, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedMicroCategory(selectedMicroCategory === cat ? null : cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedMicroCategory === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    {translateCategory(cat)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {sortedConsultants.map(c => {
              const rel = requestsByConsultant[c.id]
              const requestStatus = rel
                ? {
                  status: rel.status,
                  requestId: rel.id,
                  room_name: rel.room_name,
                  ended_at: rel.ended_at,
                  active: rel.active,
                  type: rel.type
                }
                : null

              const isFav = favorites.some(f => f.consultant_id === c.id)
              return (
                <ConsultantCard
                  key={c.id}
                  consultant={c}
                  requestStatus={requestStatus}
                  onSendRequest={sendRequest}
                  onFavorite={handleFavorite}
                  isFavorite={isFav}
                  onMicroCategoryClick={(cat) => setSelectedMicroCategory(cat)}
                />
              )
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadConsultants(page - 1)}
                disabled={page <= 1}
              >
                Precedente
              </Button>
              <span className="text-gray-700">
                Pagina {page} di {pages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadConsultants(page + 1)}
                disabled={page >= pages}
              >
                Successivo
              </Button>
            </div>
          )}
        </div>

        {/* My Requests Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">I Miei Appuntamenti</h2>
          {myRequests.filter(r => r.status === 'pending').length === 0 ? (
            <p className="text-gray-500">Non hai ancora appuntamenti in attesa.</p>
          ) : (
            <div className="space-y-4">
              {myRequests.filter(r => r.status === 'pending').map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-grow">
                    <div className="font-medium text-gray-900">
                      {r.consultant_email?.split('@')[0] || 'Consultant'}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Stato: <span className={`font-medium ${r.status === 'accepted' ? 'text-green-600' :
                        r.status === 'pending' ? 'text-yellow-600' :
                          'text-gray-600'
                        }`}>
                        {r.status === 'accepted' ? 'Accettato' : r.status === 'pending' ? 'In attesa' : r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                      </span>
                    </div>
                  </div>
                  {r.status === 'pending' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        if (!confirm('Sei sicuro di voler cancellare questa richiesta?')) return;
                        try {
                          const headers = { Authorization: `Bearer ${token}` };
                          if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                          const res = await fetch(`${apiBase}/api/requests/${r.id}`, {
                            method: 'DELETE',
                            headers
                          });
                          if (res.ok) {
                            await loadMyRequests();
                          } else {
                            const error = await res.json().catch(() => ({}));
                            alert(error.error || 'Errore durante la cancellazione');
                          }
                        } catch (error) {
                          alert('Errore durante la cancellazione');
                        }
                      }}
                    >
                      Annulla
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}



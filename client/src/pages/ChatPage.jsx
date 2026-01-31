import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../auth/AuthContext.jsx'
import ReviewModal from '../components/modals/ReviewModal.jsx'

export default function ChatPage() {
  const { requestId } = useParams()
  const { token, apiBase, user, setUser } = useAuth()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [presence, setPresence] = useState(0)
  const [balances, setBalances] = useState({ customerCredits: null, consultantCredits: null })
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [consultantInfo, setConsultantInfo] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef(null)
  const socketRef = useRef(null)

  // Load session room
  useEffect(() => {
    const load = async () => {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/requests/${requestId}/session`, { headers })
      if (!res.ok) {
        if (res.status === 410) {
          const error = await res.json().catch(() => ({ error: 'Sessione completata' }))
          alert(error.error || 'Questa sessione è già stata completata e non può essere riaperta.')
          window.location.href = '/'
        }
        return
      }
      const data = await res.json()
      setRoom(data.session.room_name)
      // history
      const mr = await fetch(`${apiBase}/api/requests/${requestId}/messages`, { headers })
      if (mr.ok) setMessages(await mr.json())

      // Load request to get consultant info for review modal
      const reqRes = await fetch(`${apiBase}/api/requests/${requestId}`, { headers })
      if (reqRes.ok) {
        const reqData = await reqRes.json()

        // Load consultant info for review modal (for customers)
        if (user?.role === 'customer' && reqData.consultant_id) {
          const consultantRes = await fetch(`${apiBase}/api/consultants?page=1&pageSize=100`, { headers })
          if (consultantRes.ok) {
            const consultantsData = await consultantRes.json()
            const consultant = consultantsData.consultants?.find(c => c.id === reqData.consultant_id)
            if (consultant) {
              setConsultantInfo({ id: consultant.id, name: consultant.name || consultant.email?.split('@')[0] })
            } else {
              // Fallback: use consultant_id from request
              setConsultantInfo({ id: reqData.consultant_id, name: 'Consulente' })
            }
          } else {
            // Fallback: use consultant_id from request
            setConsultantInfo({ id: reqData.consultant_id, name: 'Consulente' })
          }
        }
      }

      // Mark chat as read if user is consultant
      if (user?.role === 'consultant') {
        try {
          await fetch(`${apiBase}/api/requests/${requestId}/mark-read`, {
            method: 'POST',
            headers
          })
        } catch (error) {
          // Ignore errors
        }
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, apiBase, token]) // Removed user?.role and user to prevent excessive reloads

  // Socket
  useEffect(() => {
    if (!room) return

    // Prevent duplicate socket connections
    if (socketRef.current && socketRef.current.connected) {
      return
    }

    const socket = io(apiBase, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })
    socketRef.current = socket

    // Wait for connection before joining session
    socket.on('connect', () => {
      socket.emit('join_session', { token, requestId: Number(requestId) })
    })
    socket.on('presence', ({ count }) => setPresence(count))
    socket.on('chat_message', (m) => {
      setMessages((prev) => {
        // Deduplicate messages by checking if message already exists
        // Compare by senderId, message content, and createdAt (within 1 second tolerance)
        const exists = prev.some(existing =>
          existing.senderId === m.senderId &&
          existing.message === m.message &&
          Math.abs(new Date(existing.createdAt).getTime() - new Date(m.createdAt).getTime()) < 1000
        )
        if (exists) return prev
        return [...prev, m]
      })
    })
    socket.on('balances', (b) => {
      setBalances(b)
      // Update user credits in AuthContext for header display
      if (user) {
        if (user.role === 'customer' && b.customerCredits != null) {
          setUser({ ...user, credits: b.customerCredits })
        }
        if (user.role === 'consultant' && b.consultantCredits != null) {
          setUser({ ...user, credits: b.consultantCredits })
        }
      }
    })
    socket.on('error', ({ type, message }) => {
      if (type === 'insufficient_credits') {
        alert(message || 'Crediti insufficienti. Ricarica il tuo account per continuare.')
      }
    })
    socket.on('session_ended', () => {
      // Show review modal for customers after chat interruption
      if (user?.role === 'customer' && consultantInfo) {
        setShowReviewModal(true)
      } else {
        alert('Sessione terminata (crediti esauriti o sessione chiusa).')
        navigate('/')
      }
    })
    socket.on('typing_start', ({ userId }) => {
      // Only show if it's the other user typing
      if (userId !== user?.id) {
        setIsTyping(true)
      }
    })
    socket.on('typing_stop', ({ userId }) => {
      if (userId !== user?.id) {
        setIsTyping(false)
      }
    })
    return () => {
      if (socket.connected) {
        socket.emit('leave_session')
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [room, requestId, token, apiBase]) // Removed user, consultantInfo, navigate to prevent reconnection loop

  const sendMessage = () => {
    if (!text.trim()) return

    // Ensure socket is connected
    if (!socketRef.current || !socketRef.current.connected) {
      alert('Connessione non disponibile. Attendi...')
      return
    }

    // Check balance before sending (only for customers)
    if (user?.role === 'customer') {
      const currentCredits = balances.customerCredits ?? user?.credits ?? 0
      if (currentCredits <= 0) {
        alert('Crediti insufficienti. Ricarica il tuo account per inviare messaggi.')
        return
      }
    }

    socketRef.current?.emit('chat_message', { message: text })
    setText('')

    // Stop typing indicator immediately after sending
    socketRef.current?.emit('typing_stop')
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
  }

  const handleTyping = (e) => {
    setText(e.target.value)

    if (socketRef.current) {
      // Emit start typing if not already emitted recently? 
      // Actually standard pattern is just emit start, and debounce stop.
      // To avoid flood, we can check a ref, but simple debounce is usually fine or
      // emit start only if not already considered "typing" locally?
      // Let's just emit start every keystroke is heavy, better: emit start if no timeout exists

      if (!typingTimeoutRef.current) {
        socketRef.current.emit('typing_start')
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

      // Set new timeout to emit stop
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit('typing_stop')
        typingTimeoutRef.current = null
      }, 2000)
    }
  }

  const handleEndChat = async () => {
    if (window.confirm('Sei sicuro di voler terminare la chat?')) {
      try {
        // Emit end_chat event to close session permanently
        if (socketRef.current) {
          socketRef.current.emit('end_chat', { requestId: Number(requestId) })
        }

        // Emit leave session event
        if (socketRef.current) {
          socketRef.current.emit('leave_session')
          socketRef.current.disconnect()
        }

        // Show review modal for customers after ending chat
        if (user?.role === 'customer' && consultantInfo) {
          setShowReviewModal(true)
        } else {
          navigate('/')
        }
      } catch (error) {
        navigate('/')
      }
    }
  }

  const handleReviewSubmitted = () => {
    alert('Grazie per la tua recensione!')
    navigate('/')
  }

  const handleReviewModalClose = () => {
    setShowReviewModal(false)
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Chat</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>Stanza: <span className="font-mono text-gray-800">{room}</span></span>
              <span>•</span>
              <span>Partecipanti: <span className="font-semibold text-blue-600">{presence}</span></span>
            </div>
          </div>
          <button
            onClick={handleEndChat}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Termina Chat
          </button>
        </div>

        {/* Chat Container */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col" style={{ height: '75vh' }}>
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Messaggi</h3>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p className="text-sm">Nessun messaggio ancora. Inizia la conversazione!</p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.senderId === user.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] rounded-lg px-4 py-3 ${m.senderId === user.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                    }`}>
                    <div className="text-xs font-medium mb-1 opacity-80">
                      {m.senderId === user.id ? 'Tu' : 'Interlocutore'}
                    </div>
                    <div className="text-sm leading-relaxed">{m.message}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Typing Indicator */}
          {isTyping && (
            <div className="px-6 py-2 text-xs text-gray-500 italic bg-white transition-opacity duration-300">
              {user?.role === 'customer' ? 'Il consulente' : 'L\'utente'} sta scrivendo...
            </div>
          )}

          {/* Message Input */}
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="flex gap-3">
              <input
                value={text}
                onChange={handleTyping}
                onKeyPress={e => e.key === 'Enter' && sendMessage()}
                placeholder="Scrivi un messaggio..."
                disabled={user?.role === 'customer' && (balances.customerCredits ?? user?.credits ?? 0) <= 0}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={sendMessage}
                disabled={user?.role === 'customer' && (balances.customerCredits ?? user?.credits ?? 0) <= 0}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Invia
              </button>
            </div>
          </div>

          {/* Credits Display */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
            <div className="flex items-center justify-between text-sm">
              {balances.customerCredits != null && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">I Tuoi Crediti:</span>
                  <span className="font-semibold text-gray-900">€{Number(balances.customerCredits || 0).toFixed(2)}</span>
                </div>
              )}
              {balances.consultantCredits != null && user.role === 'consultant' && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">I Tuoi Guadagni:</span>
                  <span className="font-semibold text-green-600">€{Number(balances.consultantCredits || 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {user?.role === 'customer' && consultantInfo && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={handleReviewModalClose}
          consultantId={consultantInfo.id}
          requestId={Number(requestId)}
          consultantName={consultantInfo.name}
          onSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  )
}



import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../auth/AuthContext.jsx'
import IncomingCallModal from './modals/IncomingCallModal.jsx'
import audioManager from '../utils/AudioContextManager.js'

/**
 * Global component that handles incoming call notifications for consultants
 * Works on all pages when consultant is logged in
 */
export default function GlobalIncomingCallHandler() {
  const { token, apiBase, user } = useAuth()
  const navigate = useNavigate()
  const [incomingCallModal, setIncomingCallModal] = useState({ isOpen: false, requestData: null })
  const socketRef = useRef(null)
  const commonHeadersRef = useRef({})

  // Update headers when token/apiBase changes
  useEffect(() => {
    const base = {}
    if (token) base.Authorization = `Bearer ${token}`
    if ((apiBase || '').includes('ngrok')) base['ngrok-skip-browser-warning'] = 'true'
    commonHeadersRef.current = base
  }, [token, apiBase])

  // UNLOCK AUDIO CONTEXT ON MOUNT (add global listener)
  useEffect(() => {
    const unlockAudio = () => {
      audioManager.unlock()
      // Optional: remove listener after success, but keeping it ensures re-unlock if suspended
    }
    window.addEventListener('click', unlockAudio)
    window.addEventListener('touchstart', unlockAudio)
    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [])

  // Initialize Socket.IO for real-time notifications (only for consultants)
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

    // Listen for new requests
    socket.on('new_request', async (data) => {
      // Fetch full request details
      try {
        const res = await fetch(`${apiBase}/api/incoming-requests`, { headers: commonHeadersRef.current })
        if (res.ok) {
          const requests = await res.json()

          const requestsArray = Array.isArray(requests) ? requests : []
          const fullRequest = requestsArray.find(r => r.id === data.requestId)

          if (fullRequest) {
            const requestType = data.type || fullRequest.type || 'chat'
            const status = data.status || fullRequest.status

            // FIX: Ignore cancellations - they should not trigger the "Incoming Call" modal
            if (requestType === 'cancellation' || status === 'cancelled') {
              return
            }

            // Show incoming modal for ALL request types (voice, video, and chat)
            setIncomingCallModal({
              isOpen: true,
              requestData: {
                ...fullRequest,
                type: requestType
              }
            })
            // PLAY ROBUST RINGTONE IMMEDIATELY
            audioManager.playRingtone()
          }
        }
      } catch (e) {
        // Silently fail
      }
    })

    // Listen for cancellations
    socket.on('request_cancelled', (data) => {
      // Close modal if open
      setIncomingCallModal(prev => {
        if (prev.isOpen && prev.requestData && (prev.requestData.id === data.requestId || prev.requestData.id === data.id)) {
          audioManager.stopRingtone() // STOP RINGING
          return { isOpen: false, requestData: null }
        }
        return prev
      })
    })

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [token, apiBase, user])

  // Handle accept/decline
  const handleAccept = async () => {
    if (!incomingCallModal.requestData) return

    const id = incomingCallModal.requestData.id
    const headers = commonHeadersRef.current

    try {
      const res = await fetch(`${apiBase}/api/requests/${id}/decision`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'accept' })
      })

      if (res.ok) {
        const data = await res.json()
        // Close modal
        setIncomingCallModal({ isOpen: false, requestData: null })
        audioManager.stopRingtone() // STOP RINGING

        // Navigate to call/chat screen based on type
        const requestType = incomingCallModal.requestData?.type || 'chat'
        if (requestType === 'video' || requestType === 'voice') {
          navigate(`/call/${id}`)
        } else if (requestType === 'chat') {
          navigate(`/chat/${id}`)
        }
      }
    } catch (error) {
      console.error('Error accepting request:', error)
      // Close modal even on error
      setIncomingCallModal({ isOpen: false, requestData: null })
      audioManager.stopRingtone() // STOP RINGING
    }
  }

  const handleDecline = async () => {
    if (!incomingCallModal.requestData) return

    const id = incomingCallModal.requestData.id
    const headers = commonHeadersRef.current

    try {
      await fetch(`${apiBase}/api/requests/${id}/decision`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'decline' })
      })
    } catch (error) {
      console.error('Error declining request:', error)
    } finally {
      // Always close modal after decline
      setIncomingCallModal({ isOpen: false, requestData: null })
      audioManager.stopRingtone() // STOP RINGING
    }
  }

  // Don't render anything if not a consultant
  if (!user || user.role !== 'consultant') return null

  return (
    <IncomingCallModal
      isOpen={incomingCallModal.isOpen}
      requestData={incomingCallModal.requestData}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  )
}


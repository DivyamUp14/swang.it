import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../auth/AuthContext.jsx'
import OutboundCallModal from './modals/OutboundCallModal.jsx'

/**
 * Global component that handles outbound call states for customers
 * works on all pages when customer is logged in.
 * Shows a persistent "Ringing" modal when a request is pending.
 */
export default function GlobalOutboundCallHandler() {
    const { token, apiBase, user } = useAuth()
    // console.log('[DEBUG-HANDLER] Component Render. User:', user ? user.role : 'null')
    const navigate = useNavigate()
    const [outboundModal, setOutboundModal] = useState({ isOpen: false, requestData: null })
    const socketRef = useRef(null)
    const commonHeadersRef = useRef({})
    // Ref to keep track of modal state inside closures (setInterval)
    const outboundModalStateRef = useRef(outboundModal)

    // Sync ref with state
    useEffect(() => {
        outboundModalStateRef.current = outboundModal
    }, [outboundModal])

    // Update headers when token/apiBase changes
    useEffect(() => {
        const base = {}
        if (token) base.Authorization = `Bearer ${token}`
        if ((apiBase || '').includes('ngrok')) base['ngrok-skip-browser-warning'] = 'true'
        commonHeadersRef.current = base
    }, [token, apiBase])

    // Check for existing pending requests on mount/visibility change
    useEffect(() => {
        if (!token || !user || user.role !== 'customer') return

        const checkPendingRequests = async () => {
            try {
                // Reverting to match CustomerHome exactly - removing params in case backend handles them poorly
                // ADDED no-store to prevent caching of stale requests
                const res = await fetch(`${apiBase}/api/my-requests`, {
                    headers: commonHeadersRef.current,
                    cache: 'no-store'
                })
                if (res.ok) {
                    const requests = await res.json()

                    // Find any PENDING request in the fetched list
                    const pendingRequest = requests.find(r => r.status === 'pending')

                    if (pendingRequest) {
                        setOutboundModal({
                            isOpen: true,
                            requestData: pendingRequest
                        })
                    } else {
                        // Check if we currently have an open modal that needs verification
                        // USE REF to avoid stale state in closure
                        const currentModalState = outboundModalStateRef.current

                        if (currentModalState.isOpen && currentModalState.requestData) {
                            const matchingRequest = requests.find(r => r.id === currentModalState.requestData.id)

                            if (matchingRequest) {
                                // Found in list
                                if (matchingRequest.status !== 'pending') {
                                    setOutboundModal({ isOpen: false, requestData: null })
                                }
                            } else {
                                // Not found in list - verify specifically using ID
                                try {
                                    const verifyRes = await fetch(`${apiBase}/api/requests/${currentModalState.requestData.id}`, {
                                        headers: commonHeadersRef.current,
                                        cache: 'no-store'
                                    })
                                    if (verifyRes.ok) {
                                        const verifyData = await verifyRes.json()
                                        if (verifyData.status !== 'pending') {
                                            setOutboundModal({ isOpen: false, requestData: null })
                                            // Silently close on rejection/decline
                                        }
                                    } else if (verifyRes.status === 404) {
                                        // Request gone
                                        setOutboundModal({ isOpen: false, requestData: null })
                                    }
                                } catch (err) {
                                    console.error('Error verifying request:', err)
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error checking pending requests:', e)
            }
        }

        checkPendingRequests()

        // Also check when window gathers focus (e.g. user comes back from another tab)
        const handleFocus = () => checkPendingRequests()
        window.addEventListener('focus', handleFocus)

        // Listen for custom event 'request_created' to trigger immediate check AND optimistic update
        const handleRequestCreated = (e) => {
            if (e.detail && e.detail.status === 'pending') {
                setOutboundModal({
                    isOpen: true,
                    requestData: e.detail
                })
            }
        }
        window.addEventListener('request_created', handleRequestCreated)

        // Poll every 5 seconds as a backup to ensure state consistency
        const interval = setInterval(() => {
            // console.log('[DEBUG-MODAL] Polling pending...')
            checkPendingRequests()
        }, 5000)

        return () => {
            window.removeEventListener('focus', handleFocus)
            window.removeEventListener('request_created', handleRequestCreated)
            clearInterval(interval)
        }
    }, [token, apiBase, user])

    // Initialize Socket.IO for real-time updates
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

        // Listen for request acceptance
        socket.on('request_accepted', (data) => {
            // Close modal immediately
            setOutboundModal({ isOpen: false, requestData: null })

            // Navigation is handled by other components (like CustomerHome) or we can do it here to vary logic?
            // CustomerHome already has this logic, but GlobalOutboundCallHandler ensures it happens from ANY page.
            // Let's rely on this handler for reliability.

            if (data && data.requestId) {
                // Double check request type if needed, or just blindly navigate based on assumptions.
                // Ideally we fetch the request again or use data provided in event.
                // The event SHOULD contain 'type', but if not, we fallback to chat logic or re-fetch.
                // For smoothness, let's trust the data.
                let targetUrl = `/chat/${data.requestId}` // Default
                if (data.type === 'voice' || data.type === 'video') {
                    targetUrl = `/call/${data.requestId}`
                } else if (data.type === 'chat') {
                    targetUrl = `/chat/${data.requestId}`
                }

                // Use window.location for hard reload/reliable redirect if navigate fails/is complex across contexts
                // OR use navigate if we want SPA feel.
                navigate(targetUrl)
            }
        })

        // Listen for rejection/cancellation/expiry
        socket.on('request_rejected', (data) => {
            setOutboundModal({ isOpen: false, requestData: null })
        })

        socket.on('request_expired', () => {
            setOutboundModal({ isOpen: false, requestData: null })
        })

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect()
                socketRef.current = null
            }
        }
    }, [token, apiBase, user, navigate])

    const handleCancel = async () => {
        if (!outboundModal.requestData) return

        // Optimistic close
        const requestId = outboundModal.requestData.id
        setOutboundModal({ isOpen: false, requestData: null })

        try {
            const res = await fetch(`${apiBase}/api/requests/${requestId}`, {
                method: 'DELETE',
                headers: commonHeadersRef.current
            })

            if (!res.ok) {
                // If fail, maybe show error, but we already closed the modal so it feels responsive.
                // Re-check pending requests will restore it if it failed server-side and is still pending.
                console.error('Failed to cancel request')
            }
        } catch (error) {
            console.error('Error cancelling request:', error)
        }
    }

    // Don't render if not customer
    if (!user || user.role !== 'customer') return null

    return (
        <OutboundCallModal
            isOpen={outboundModal.isOpen}
            requestData={outboundModal.requestData}
            onCancel={handleCancel}
        />
    )
}

import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../auth/AuthContext.jsx'

export default function CallPage() {
  const { requestId } = useParams()
  const { token, apiBase, user, setUser } = useAuth()
  const [room, setRoom] = useState(null)
  const [balances, setBalances] = useState({ customerCredits: null, consultantCredits: null })
  const [presence, setPresence] = useState(0)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const navigate = useNavigate()

  const socketRef = useRef(null)
  const jitsiRef = useRef(null)
  const jitsiApiRef = useRef(null)
  const billingStartedRef = useRef(false)
  const hasJoinedRef = useRef(false)

  // Load session room
  useEffect(() => {
    const load = async () => {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/requests/${requestId}/session`, { headers })
      if (!res.ok) { alert('Nessuna sessione'); navigate(-1); return }
      const data = await res.json()
      setRoom(data.session.room_name)
    }
    load()
  }, [requestId, apiBase, token, navigate])

  // Socket.IO connection - Match ChatPage pattern
  useEffect(() => {
    if (!room) return
    
    // Try polling first (works through Vite proxy), then upgrade to websocket
    const socket = io(apiBase, { 
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })
    socketRef.current = socket
    
    // Emit immediately (Socket.IO will queue if not connected)
    socket.emit('join_session', { token, requestId: Number(requestId) })
    
    socket.on('presence', ({ count }) => {
      setPresence(count)
      if (count >= 2 && hasJoinedRef.current && !billingStartedRef.current) {
        billingStartedRef.current = true
        socket.emit('start_call', { requestId: Number(requestId) })
      }
    })
    
    socket.on('chat_message', (m) => {
      setMessages((prev) => [...prev, m])
    })
    
    socket.on('balances', (b) => {
      setBalances(prev => {
        if (prev.customerCredits !== null && b.customerCredits !== null && 
            (b.customerCredits < prev.customerCredits || b.consultantCredits > prev.consultantCredits)) {
          billingStartedRef.current = true
        }
        return b
      })
      
      if (user) {
        if (user.role === 'customer' && b.customerCredits != null) {
          setUser({ ...user, credits: b.customerCredits })
        }
        if (user.role === 'consultant' && b.consultantCredits != null) {
          setUser({ ...user, credits: b.consultantCredits })
        }
      }
    })
    
    socket.on('session_ended', () => {
      alert('Sessione terminata (crediti esauriti o sessione chiusa).')
      navigate('/')
    })
    
    return () => {
      if (socket.connected) {
        socket.emit('leave_session')
      }
      socket.disconnect()
    }
  }, [room])

  // Jitsi initialization
  useEffect(() => {
    if (!room || !jitsiRef.current) return
    
    // Get Jitsi domain from environment
    const jitsiDomainEnvRaw = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_JITSI_DOMAIN
      ? String(import.meta.env.VITE_JITSI_DOMAIN).trim()
      : ''
    
    // Require VITE_JITSI_DOMAIN in remote builds
    if (!jitsiDomainEnvRaw) {
      alert('Jitsi domain not configured. Please set VITE_JITSI_DOMAIN environment variable.')
      return
    }
    
    // Normalize and validate the domain
    const rawDomain = jitsiDomainEnvRaw.trim()
    const domainWithoutProtocol = rawDomain.replace(/^https?:\/\//i, '')
    const isLocalDomain = /^localhost(?::\d+)?$/.test(domainWithoutProtocol) || /^127\.\d+\.\d+\.\d+(?::\d+)?$/.test(domainWithoutProtocol)
    
    let domainUrlString = rawDomain
    if (!/^https?:\/\//i.test(domainUrlString)) {
      domainUrlString = `${isLocalDomain ? 'http' : 'https'}://${domainWithoutProtocol}`
    }
    
    let domainUrl
    try {
      domainUrl = new URL(domainUrlString)
    } catch (error) {
      alert('Invalid Jitsi domain configuration.')
      return
    }
    
    const jitsiOrigin = domainUrl.origin.replace(/\/$/, '')
    const jitsiHost = domainUrl.host
    const boshUrl = `${domainUrl.protocol}//${jitsiHost}/http-bind`
    const websocketUrl = `${domainUrl.protocol === 'https:' ? 'wss' : 'ws'}://${jitsiHost}/xmpp-websocket`
    const externalApiUrl = `${domainUrl.protocol}//${jitsiHost}/external_api.js`
    const fallbackRoomUrl = `${jitsiOrigin}/${room}`
    
    jitsiRef.current.innerHTML = ''
    
    // Load Jitsi External API
    const loadJitsi = async () => {
      try {
        if (window.JitsiMeetExternalAPI) {
          initJitsi()
          return
        }
        if (typeof window !== 'undefined') {
          window.config = {
            hosts: {
              domain: jitsiHost,
              anonymousdomain: jitsiHost,
              muc: `muc.${jitsiHost}`
            },
            bosh: boshUrl,
            serviceUrl: boshUrl,
            websocket: null,
            transports: ['bosh'],
            enableWebsocketResume: false,
            preferHTTP: true
          }
          window.interfaceConfig = {
            TILE_VIEW_MAX_COLUMNS: 2,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            HIDE_INVITE_MORE_HEADER: true,
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
              'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
              'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
              'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts'
            ],
            VERTICAL_FILMSTRIP: false,
            FILM_STRIP_MAX_HEIGHT: 90,
            DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
            DEFAULT_LOCAL_DISPLAY_NAME: 'You',
            AUTO_PIN_LATEST_SCREEN_SHARE: 'remote-only',
            DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
            VIDEO_LAYOUT_FIT: 'both'
          }
        }
        
        const scriptUrl = externalApiUrl
        const script = document.createElement('script')
        script.src = scriptUrl
        script.async = true
        script.onload = () => initJitsi()
        script.onerror = () => {
          // Fallback to simple iframe
          const iframe = document.createElement('iframe')
          iframe.src = fallbackRoomUrl
          iframe.style.width = '100%'
          iframe.style.height = '100%'
          iframe.style.border = 'none'
          iframe.allow = 'autoplay; camera; microphone; display-capture'
          iframe.allowFullscreen = true
          jitsiRef.current.appendChild(iframe)
        }
        document.head.appendChild(script)
      } catch (err) {
        // Error loading
      }
    }
    
    const initJitsi = () => {
      try {
        const domain = jitsiHost

        if (typeof window !== 'undefined') {
          window.config = window.config || {}

          const hosts = window.config.hosts || {}
          hosts.domain = jitsiHost
          hosts.muc = `muc.${jitsiHost}`
          hosts.anonymousdomain = hosts.anonymousdomain || hosts.domain
          window.config.hosts = hosts

          window.config.bosh = boshUrl
          window.config.serviceUrl = boshUrl
          window.config.websocket = null
          window.config.transports = ['bosh']
          window.config.enableWebsocketResume = false
          window.config.preferHTTP = true
          window.config.enabled = true
        }
        
        const config = {
          disableDeepLinking: true,
          prejoinConfig: {
            enabled: false,
            hideDisplayName: true
          },
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          resolution: 720,
          constraints: {
            video: {
              width: { ideal: 1280, max: 1280, min: 320 },
              height: { ideal: 720, max: 720, min: 240 },
              frameRate: { ideal: 30, max: 30, min: 15 },
              facingMode: 'user'
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          },
          websocket: false,
          p2p: { enabled: true },
          enableInsecureRoomNameWarning: false,
          disableRemoteMute: false,
          enableLayerSuspension: false,
          enableNoAudioDetection: false,
          enableNoisyMicDetection: false
        }
        
        // Force remote/ngrok BOSH and ICE servers
        config.transports = ['bosh']
        config.bosh = boshUrl
        config.serviceUrl = boshUrl
        config.websocket = null
        config.enableWebsocketResume = false
        config.pingInterval = 15000
        config.pingTimeout = 60000

        config.useStunTurn = false
        config.pcConfig = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
          ]
        }
        
        const interfaceConfig = {
          TILE_VIEW_MAX_COLUMNS: 2,
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          HIDE_INVITE_MORE_HEADER: true,
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
            'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
            'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
            'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts'
          ],
          VERTICAL_FILMSTRIP: false,
          FILM_STRIP_MAX_HEIGHT: 90,
          DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
          DEFAULT_LOCAL_DISPLAY_NAME: 'You',
          AUTO_PIN_LATEST_SCREEN_SHARE: 'remote-only',
          DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
          VIDEO_LAYOUT_FIT: 'both'
        }
        
        // Configure for speaker view (remote large, local in filmstrip)
        config.hideDisplayName = false
        config.disableDominantSpeakerIndicator = false
        config.disableRemoteMute = false
        
        const userInfo = {
          email: user.email,
          displayName: user.email
        }
        
        const options = {
          roomName: room,
          parentNode: jitsiRef.current,
          configOverwrite: {
            ...config
          },
          interfaceConfigOverwrite: interfaceConfig,
          userInfo: userInfo,
          width: '100%',
          height: '100%'
        }
        
        const jitsiApi = new window.JitsiMeetExternalAPI(domain, options)
        jitsiApiRef.current = jitsiApi
        
        // Auto-join when prejoin screen loads
        jitsiApi.addEventListener('prejoinScreenLoaded', () => {
          setTimeout(() => {
            try {
              jitsiApi.executeCommand('submitDisplayName')
              setTimeout(() => {
                jitsiApi.executeCommand('toggleVideo')
                jitsiApi.executeCommand('toggleAudio')
                setTimeout(() => {
                  jitsiApi.executeCommand('joinConference')
                }, 200)
              }, 100)
            } catch (e) {}
          }, 500)
        })
        
        // When conference is joined, mark as joined
        // The presence event handler will trigger billing when count >= 2
        jitsiApi.addEventListener('videoConferenceJoined', () => {
          hasJoinedRef.current = true
          
          // Trigger presence check to potentially start billing
          if (socketRef.current && socketRef.current.connected) {
            // Emit start_call - server will check participant count
            socketRef.current.emit('start_call', { requestId: Number(requestId) })
          }
        })
        
        // Handle participant joins - trigger billing and configure speaker view
        jitsiApi.addEventListener('participantJoined', (participant) => {
          // Skip focus participant (Jicofo server component)
          if (participant?.id === 'focus' || participant?.displayName === 'focus' || 
              participant?.id?.includes('focus') || participant?.jid?.includes('focus@')) {
            return
          }
          
          // Try to start billing when remote participant joins
          if (hasJoinedRef.current && socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('start_call', { requestId: Number(requestId) })
          }
          
          // Force speaker view after participants join (remote large, local in filmstrip)
          setTimeout(() => {
            try {
              // Ensure we're in speaker view (not tile view)
              jitsiApi.executeCommand('toggleTileView', false)
            } catch (e) {}
          }, 1000)
        })
        
        // Update count when someone leaves (exclude focus)
        jitsiApi.addEventListener('participantLeft', () => {
          // Presence count from Socket.IO will update automatically
        })
        
        // Navigate away when call ends
        jitsiApi.addEventListener('readyToClose', () => {
          navigate('/')
        })
        
      } catch (err) {
        // Fallback to simple iframe
        const iframe = document.createElement('iframe')
        iframe.src = fallbackRoomUrl
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = 'none'
        iframe.allow = 'autoplay; camera; microphone; display-capture'
        iframe.allowFullscreen = true
        jitsiRef.current.appendChild(iframe)
      }
    }
    
    loadJitsi()
    
    return () => {
      hasJoinedRef.current = false
      billingStartedRef.current = false
      if (jitsiApiRef.current && typeof jitsiApiRef.current.dispose === 'function') {
        jitsiApiRef.current.dispose()
      } else if (jitsiRef.current) {
        jitsiRef.current.innerHTML = ''
      }
      jitsiApiRef.current = null
    }
  }, [room, requestId, user.email])

  const sendMessage = () => {
    if (!text.trim()) return
    socketRef.current?.emit('chat_message', { message: text })
    setText('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Videochiamata</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Stanza: <span className="font-mono text-gray-800">{room}</span></span>
            <span>•</span>
            <span>Partecipanti: <span className="font-semibold text-blue-600">{presence}</span></span>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Call Area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
              <div 
                className="relative w-full"
                style={{ 
                  minHeight: '500px', 
                  height: '70vh',
                  backgroundColor: '#1a1a1a'
                }}
                ref={jitsiRef} 
              />
            </div>
          </div>

          {/* Chat Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col" style={{ height: '70vh' }}>
              {/* Chat Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900">Chat</h3>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p className="text-sm">Nessun messaggio ancora. Inizia la conversazione!</p>
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div 
                      key={idx} 
                      className={`flex ${m.senderId === user.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        m.senderId === user.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <div className="text-xs font-medium mb-1 opacity-80">
                          {m.senderId === user.id ? 'Tu' : 'Interlocutore'}
                        </div>
                        <div className="text-sm">{m.message}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex gap-2">
                  <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Scrivi un messaggio..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Invia
                  </button>
                </div>
              </div>

              {/* Credits Display */}
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                <div className="space-y-1 text-sm">
                  {balances.customerCredits != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">I Tuoi Crediti:</span>
                      <span className="font-semibold text-gray-900">€{Number(balances.customerCredits || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {balances.consultantCredits != null && user.role === 'consultant' && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">I Tuoi Guadagni:</span>
                      <span className="font-semibold text-green-600">€{Number(balances.consultantCredits || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

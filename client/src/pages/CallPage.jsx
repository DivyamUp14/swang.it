import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../auth/AuthContext.jsx'
import ReviewModal from '../components/modals/ReviewModal.jsx'

export default function CallPage() {
  const { requestId } = useParams()
  const { token, apiBase, user, setUser } = useAuth()
  const [room, setRoom] = useState(null)
  const [balances, setBalances] = useState({ customerCredits: null, consultantCredits: null })
  const [presence, setPresence] = useState(0)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [consultantInfo, setConsultantInfo] = useState(null)
  const [creditsPerMinute, setCreditsPerMinute] = useState(1)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef(null)

  const socketRef = useRef(null)
  const jitsiRef = useRef(null)
  const jitsiApiRef = useRef(null)
  const billingStartedRef = useRef(false)
  const hasJoinedRef = useRef(false)
  const videoUpgradePromptedRef = useRef(false) // Track if upgrade confirmation was shown
  const [callType, setCallType] = useState(null) // Track current call type
  const [isSessionActive, setIsSessionActive] = useState(false) // SECURITY: Gate Jitsi until server confirms billing

  // Load session room - only once on mount
  useEffect(() => {
    // Prevent reloading if we already have a room
    if (room) return

    const load = async () => {
      console.log(`[DEBUG-CLIENT] CallPage: Attempting to load session for RequestID: ${requestId}`);
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/requests/${requestId}/session`, { headers })
      if (!res.ok) {
        // Handle 429 (Too Many Requests) gracefully - don't show alert if we already have a room
        if (res.status === 429) {
          console.warn('Rate limited on session fetch, but continuing with existing session if available')
          // If we already have a room, continue - don't show error
          if (room) return
          // If no room yet, wait a bit and retry once
          setTimeout(async () => {
            try {
              const retryRes = await fetch(`${apiBase}/api/requests/${requestId}/session`, { headers })
              if (retryRes.ok) {
                const retryData = await retryRes.json()
                setRoom(retryData.session.room_name)
              }
            } catch (e) {
              console.error('Retry failed:', e)
            }
          }, 2000)
          return
        }
        if (res.status === 410) {
          const error = await res.json().catch(() => ({ error: 'Sessione completata' }))
          alert(error.error || 'Questa sessione è già stata completata e non può essere riaperta.')
          navigate(-1)
        } else if (!room) {
          // Only show alert and navigate if we don't already have a room
          // Don't show alert for 500 errors if we have a room - might be temporary
          if (res.status >= 500 && room) {
            console.warn('Server error on session fetch, but continuing with existing session')
            return
          }
          alert('Nessuna sessione')
          navigate(-1)
        }
        return
      }
      const data = await res.json()
      setRoom(data.session.room_name)
      // Store CPM for countdown/estimates
      setCreditsPerMinute(data.creditsPerMinute || 1)

      // SECURITY: If session is already active (reload case), allow Jitsi immediately
      if (data.session.active === 1 || data.session.active === true) {
        console.log('[DEBUG-CLIENT] Session already active, allowing Jitsi immediately');
        setIsSessionActive(true);
      }

      const mr = await fetch(`${apiBase}/api/requests/${requestId}/messages`, { headers })
      if (mr.ok) {
        const chatMessages = await mr.json()
        setMessages(chatMessages)
      }

      // Load request to get type (voice/video/chat) for audio-only mode
      const reqRes = await fetch(`${apiBase}/api/requests/${requestId}`, { headers })
      if (reqRes.ok) {
        const reqData = await reqRes.json()
        const requestType = reqData.type || 'chat'

        // Store request type for audio-only mode (voice calls)
        // This will be used in Jitsi config to disable video for voice calls
        const initialCallType = requestType === 'voice' ? 'voice' : 'video'
        window.__callType = initialCallType
        setCallType(initialCallType) // Store in state for React reactivity

        // Check if it is a calendar booking
        if (requestType === 'calendar' || reqData.is_calendar) {
          setIsCalendarBooking(true)
          // Calendar bookings are pre-paid/approved, so we can allow Jitsi immediately or wait for start
          // Better strictly wait for fairness, or allow if logic permits. 
          // Current backend logic emits 'call_active_confirmed' for booking too.
          // But to avoid "waiting" for start time if slot is open, we can rely on backend 'active' check above.
        }

        // Load consultant info for review modal (works for both regular calls and calendar bookings)
        if (user?.role === 'customer') {
          // FIX: Load consultant info directly from request data or fetch if needed
          // For calendar bookings, consultant_id is in reqData
          if (reqData.consultant_id) {
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
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, apiBase, token]) // Removed navigate and user to prevent excessive reloads

  // Socket.IO connection - Match ChatPage pattern
  useEffect(() => {
    if (!room) return

    // Prevent re-joining if socket already exists and is connected
    if (socketRef.current && socketRef.current.connected) {
      return;
    }

    // Try polling first (works through Vite proxy), then upgrade to websocket
    const socket = io(apiBase, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join_session', { token, requestId: Number(requestId) });
    });

    socket.on('disconnect', () => {
      // Disconnect handled silently
    });

    socket.on('connect_error', (error) => {
      console.error(`[CLIENT] Socket.IO connection error:`, error);
    });

    // Also emit immediately as fallback (Socket.IO will queue if not connected)
    socket.emit('join_session', { token, requestId: Number(requestId) })

    socket.on('presence', ({ count }) => {
      setPresence(count)
      // FIX: Trigger start_call immediately when 2 people are present, WITHOUT waiting for Jitsi to join.
      // This breaks the "Deadlock" where we wait for session active to load Jitsi, but need Jitsi to start session.
      // FIX 2: ONLY Customer triggers start_call to prevent double-deduction race conditions
      if (count >= 2 && !billingStartedRef.current && user?.role === 'customer') {
        const currentCredits = balances.customerCredits ?? user?.credits ?? 0
        if (currentCredits <= 0) {
          alert('Crediti insufficienti per iniziare la videochiamata. Ricarica il tuo account.')
          navigate('/')
          return
        }

        billingStartedRef.current = true
        socket.emit('start_call', { requestId: Number(requestId) })
      }
    })

    socket.on('call_active_confirmed', ({ sessionId }) => {
      console.log(`[DEBUG-CLIENT] Received call_active_confirmed for SessionID: ${sessionId}`);
      setIsSessionActive(true);
    });

    socket.on('chat_message', (m) => {
      setMessages((prev) => {
        // Deduplicate messages to prevent double-display
        const exists = prev.some(existing =>
          existing.senderId === m.senderId &&
          existing.message === m.message &&
          Math.abs(new Date(existing.createdAt).getTime() - new Date(m.createdAt).getTime()) < 2000
        );
        if (exists) return prev;
        return [...prev, m];
      })
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

    socket.on('error', ({ type, message }) => {
      // SECURITY FIX: Force cleanup Jitsi BEFORE alert blocks the UI
      if (jitsiApiRef.current && typeof jitsiApiRef.current.dispose === 'function') {
        jitsiApiRef.current.dispose()
        jitsiApiRef.current = null
      }
      if (jitsiRef.current) {
        jitsiRef.current.innerHTML = ''
      }

      if (type === 'insufficient_credits') {
        alert(message || 'Crediti insufficienti. Ricarica il tuo account per continuare.')
        navigate('/')
      } else if (type === 'session_completed') {
        alert(message || 'Questa sessione è già stata completata.')
        navigate('/')
      }
    })

    socket.on('session_ended', () => {
      // SECURITY FIX: Force cleanup Jitsi BEFORE alert blocks the UI
      if (jitsiApiRef.current && typeof jitsiApiRef.current.dispose === 'function') {
        jitsiApiRef.current.dispose()
        jitsiApiRef.current = null
      }
      if (jitsiRef.current) {
        jitsiRef.current.innerHTML = ''
      }

      alert('Sessione terminata (crediti esauriti o sessione chiusa).')
      navigate('/')
    })

    socket.on('call_upgraded_to_video', () => {
      // Update call type when other participant upgrades
      window.__callType = 'video'
      setCallType('video')
      videoUpgradePromptedRef.current = true // Prevent showing prompt again
    })

    socket.on('typing_start', ({ userId }) => {
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
    }
  }, [room])

  // Screen Wake Lock
  useEffect(() => {
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Ignore wake lock errors
      }
    };

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().catch(() => { });
      }
    };
  }, []);

  // Jitsi initialization
  useEffect(() => {
    if (!room || !jitsiRef.current) return

    // SECURITY: Strictly block Jitsi for customers until server confirms credits/billing
    // This prevents "Ghost Calls" where the video loads before the insufficient credit error arrives.
    if (user?.role === 'customer' && !isSessionActive && !isCalendarBooking) {
      console.log('[DEBUG-CLIENT] Waiting for session activation (Credit Check)...');
      jitsiRef.current.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full bg-gray-900 text-white">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p class="text-lg font-semibold">Verifica crediti in corso...</p>
          <p class="text-sm text-gray-400 mt-2">La videochiamata inizierà a breve.</p>
        </div>
      `;
      return;
    }

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
    const jitsiPath = domainUrl.pathname === '/' ? '' : domainUrl.pathname.replace(/\/$/, '')

    const boshUrl = `${domainUrl.protocol}//${jitsiHost}${jitsiPath}/http-bind`
    const websocketUrl = `${domainUrl.protocol === 'https:' ? 'wss' : 'ws'}://${jitsiHost}${jitsiPath}/xmpp-websocket`
    const externalApiUrl = `${domainUrl.protocol}//${jitsiHost}${jitsiPath}/external_api.js`
    const fallbackRoomUrl = `${jitsiOrigin}${jitsiPath}/${room}`

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
            preferHTTP: isLocalDomain
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
        script.onload = () => {
          initJitsi()
        }
        script.onerror = (error) => {
          console.error('[Jitsi] Failed to load external API script:', error)
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
        const domain = `${jitsiHost}${jitsiPath}`

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
          window.config.preferHTTP = isLocalDomain
          window.config.enabled = true
        }

        // Check if this is a voice call (audio-only) or video call
        const isVoiceCall = window.__callType === 'voice'

        const config = {
          disableDeepLinking: true,
          prejoinConfig: {
            enabled: false,
            hideDisplayName: true
          },
          startWithAudioMuted: false,
          startWithVideoMuted: isVoiceCall, // Mute video for voice calls (audio-only mode)
          resolution: isVoiceCall ? 0 : 720, // No video resolution for voice calls
          constraints: {
            video: isVoiceCall ? false : { // Disable video for voice calls
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
          hideLogo: true,
          brandingDataUrl: '',
          enableNoAudioDetection: false,
          enableNoisyMicDetection: false,
          // Bypass browser compatibility checks for IP addresses
          enableWelcomePage: false,
          enableBrowserWarning: false
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
            'fodeviceselection', 'profile', 'chat', 'recording',
            'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
            'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts'
          ],
          VERTICAL_FILMSTRIP: false,
          FILM_STRIP_MAX_HEIGHT: 90,
          DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
          DEFAULT_LOCAL_DISPLAY_NAME: 'You',
          AUTO_PIN_LATEST_SCREEN_SHARE: 'remote-only',
          DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
          VIDEO_LAYOUT_FIT: 'both',
          // Disable browser compatibility warnings - mark all browsers as optimal
          UNSUPPORTED_BROWSERS: [],
          OPTIMAL_BROWSERS: ['chrome', 'chromium', 'firefox', 'electron', 'safari', 'webkit', 'edge']
        }

        // Configure for speaker view (remote large, local in filmstrip)
        config.hideDisplayName = false
        config.disableDominantSpeakerIndicator = false
        config.disableRemoteMute = false

        const userInfo = {
          email: user.email,
          displayName: user.nickname || user.email
        }

        // Add config directly in URL hash to bypass browser check
        const urlParams = new URLSearchParams()
        urlParams.set('config.enableBrowserWarning', 'false')
        urlParams.set('config.enableInsecureRoomNameWarning', 'false')
        urlParams.set('config.enableWelcomePage', 'false')
        urlParams.set('interfaceConfig.UNSUPPORTED_BROWSERS', '[]')

        const options = {
          roomName: room,
          parentNode: jitsiRef.current,
          configOverwrite: {
            ...config,
            enableBrowserWarning: false,
            enableInsecureRoomNameWarning: false,
            enableWelcomePage: false
          },
          interfaceConfigOverwrite: {
            ...interfaceConfig,
            UNSUPPORTED_BROWSERS: [],
            OPTIMAL_BROWSERS: ['chrome', 'chromium', 'firefox', 'electron', 'safari', 'webkit', 'edge']
          },
          userInfo: userInfo,
          width: '100%',
          height: '100%'
        }

        const jitsiApi = new window.JitsiMeetExternalAPI(domain, options)
        jitsiApiRef.current = jitsiApi

        // Intercept iframe to inject config before browser compatibility check
        const iframe = jitsiApi.getIFrame()
        if (iframe) {
          iframe.onload = () => {
            try {
              // Try to inject config into iframe to bypass browser check
              const iframeWindow = iframe.contentWindow
              if (iframeWindow && iframeWindow.config) {
                iframeWindow.config.enableBrowserWarning = false
                iframeWindow.config.enableInsecureRoomNameWarning = false
                if (iframeWindow.interfaceConfig) {
                  iframeWindow.interfaceConfig.UNSUPPORTED_BROWSERS = []
                }
              }
            } catch (e) {
              // Cross-origin, can't access iframe content
            }
          }
        }

        // Listen for errors
        jitsiApi.addEventListener('errorOccurred', (error) => {
          console.error('[Jitsi] Error occurred:', error)
        })

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
            } catch (e) {
              console.error('[Jitsi] Error in prejoin auto-join:', e)
            }
          }, 500)
        })

        // When conference is joined, mark as joined and set up video upgrade listener
        jitsiApi.addEventListener('videoConferenceJoined', () => {
          hasJoinedRef.current = true
          // Presence will be updated automatically by server when socket joins
          // But trigger a check after a short delay to ensure presence is accurate
          setTimeout(() => {
            // If presence is still 0 or 1 after joining, the server should update it
            // The presence event from server will trigger start_call if conditions are met
          }, 1000)
          // Set up video upgrade listener after joining (wait to avoid initial mute events)
          setTimeout(() => {
            setupVideoUpgradeListener()
          }, 1000)
        })

        // Handle participant joins - configure speaker view
        jitsiApi.addEventListener('participantJoined', (participant) => {
          // Skip focus participant (Jicofo server component)
          if (participant?.id === 'focus' || participant?.displayName === 'focus' ||
            participant?.id?.includes('focus') || participant?.jid?.includes('focus@')) {
            return
          }

          // Force speaker view after participants join (remote large, local in filmstrip)
          setTimeout(() => {
            try {
              // Ensure we're in speaker view (not tile view)
              jitsiApi.executeCommand('toggleTileView', false)
            } catch (e) { }
          }, 1000)
        })

        // Update count when someone leaves (exclude focus)
        jitsiApi.addEventListener('participantLeft', () => {
          // Presence count from Socket.IO will update automatically
        })

        // Automatic room closure when call ends (Requirement #2)
        jitsiApi.addEventListener('readyToClose', () => {
          // Emit end_call event to close session automatically
          if (socketRef.current) {
            socketRef.current.emit('end_call', { requestId: Number(requestId) });
          }
          navigate('/')
        })

        // Handle hangup button click
        jitsiApi.addEventListener('videoConferenceLeft', () => {
          // Emit end_call event to close session automatically
          if (socketRef.current) {
            socketRef.current.emit('end_call', { requestId: Number(requestId) });
          }
        })

        // Detect video enable during voice call - show confirmation
        // Set up listener after conference is joined to avoid initial mute events
        const setupVideoUpgradeListener = () => {
          jitsiApi.addEventListener('videoMuteStatusChanged', (event) => {
            // event.muted = true means video is OFF, event.muted = false means video is ON
            const isVideoEnabled = !event.muted
            const currentCallType = callType || window.__callType
            const isVoiceCall = currentCallType === 'voice'

            // Only intercept if: it's a voice call, video is being enabled, and we haven't shown prompt yet
            // Also check if conference is joined (hasJoinedRef) to avoid initial setup events
            if (isVoiceCall && isVideoEnabled && !videoUpgradePromptedRef.current && hasJoinedRef.current) {
              videoUpgradePromptedRef.current = true // Prevent multiple prompts

              // Show confirmation dialog
              const confirmed = window.confirm(
                'Vuoi attivare la videochiamata? Verranno applicate le tariffe per videochiamata. Vuoi continuare?'
              )

              if (confirmed) {
                // Upgrade to video call
                const headers = { Authorization: `Bearer ${token}` }
                if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

                fetch(`${apiBase}/api/requests/${requestId}/session/upgrade-to-video`, {
                  method: 'PUT',
                  headers
                })
                  .then(res => res.json())
                  .then(data => {
                    if (data.success) {
                      // Update call type
                      window.__callType = 'video'
                      setCallType('video')
                      // Video is already enabled, just allow it
                    } else {
                      // If upgrade failed, mute video
                      jitsiApi.executeCommand('toggleVideo')
                      videoUpgradePromptedRef.current = false
                    }
                  })
                  .catch(err => {
                    console.error('Error upgrading to video:', err)
                    // If error, mute video
                    jitsiApi.executeCommand('toggleVideo')
                    videoUpgradePromptedRef.current = false
                  })
              } else {
                // User declined - force mute video
                jitsiApi.executeCommand('toggleVideo')
                videoUpgradePromptedRef.current = false // Allow prompt again if they try later
              }
            }
          })
        }

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
  }, [room, requestId, user.email, isSessionActive])

  // Determine if this is a calendar booking (scheduled) or instant call
  // We can infer this from the request type or if we have booking info
  // For now, let's assume if it came from AppointmentPage/MyAppointments it might be calendar
  // Better: Check the request data we fetched
  const [isCalendarBooking, setIsCalendarBooking] = useState(false)

  const handleEndCall = async () => {
    if (window.confirm('Sei sicuro di voler terminare la chiamata?')) {
      try {
        // Only emit end_call for INSTANT calls to stop billing
        // For CALENDAR bookings, we validly want to allow re-entry until the time slot expires
        // so we DO NOT close the session permanently on hangup.
        if (!isCalendarBooking && socketRef.current) {
          socketRef.current.emit('end_call', { requestId: Number(requestId) });
        }

        // Dispose Jitsi API if exists
        if (jitsiApiRef.current && typeof jitsiApiRef.current.dispose === 'function') {
          jitsiApiRef.current.dispose()
        }

        // Emit leave session event
        if (socketRef.current) {
          socketRef.current.emit('leave_session')
          socketRef.current.disconnect()
        }

        // Show review modal for customers after ending call
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

  const sendMessage = () => {
    if (!text.trim()) return

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
      if (!typingTimeoutRef.current) {
        socketRef.current.emit('typing_start')
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit('typing_stop')
        typingTimeoutRef.current = null
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {callType === 'voice' ? 'Chiamata Vocale' : callType === 'video' ? 'Videochiamata' : 'Videochiamata'}
            </h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>Partecipanti: <span className="font-semibold text-blue-600">{presence}</span></span>
              {user?.role === 'customer' && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>
                    Crediti: <span className="font-semibold text-green-600">€{Number(balances.customerCredits ?? user.credits ?? 0).toFixed(2)}</span>
                  </span>
                  <span className="hidden sm:inline font-medium text-orange-600">
                    (Tempo disponibile: ~{Math.floor((balances.customerCredits ?? user.credits ?? 0) / (creditsPerMinute || 1))} min)
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleEndCall}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Termina Chiamata
          </button>
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
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${m.senderId === user.id
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

              {/* Typing Indicator */}
              {isTyping && (
                <div className="px-4 py-1 text-xs text-gray-500 italic bg-white transition-opacity duration-300">
                  {user?.role === 'customer' ? 'Il consulente' : 'L\'utente'} sta scrivendo...
                </div>
              )}

              {/* Message Input */}
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex gap-2">
                  <input
                    value={text}
                    onChange={handleTyping}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Scrivi un messaggio..."
                    disabled={user?.role === 'customer' && (balances.customerCredits ?? user?.credits ?? 0) <= 0}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={user?.role === 'customer' && (balances.customerCredits ?? user?.credits ?? 0) <= 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
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


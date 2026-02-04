import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { translateCategory } from '../utils/categoryTranslations';
import { io } from 'socket.io-client';
import {
  FaStar,
  FaPhone,
  FaVideo,
  FaComments,
  FaHeart,
  FaCalendar,
  FaChevronLeft,
  FaClock
} from 'react-icons/fa';
import Button from '../components/ui/Button';
import { parseRomeDate, formatTimeInZone } from '../utils/dateUtils';

const ConsultantProfile = () => {
  const { id } = useParams();
  const { user, token, apiBase } = useAuth();
  const navigate = useNavigate();
  const [consultant, setConsultant] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [bookableSlots, setBookableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const socketRef = useRef(null);

  const getProfilePhotoUrl = (photo) => {
    if (!photo) return `https://ui-avatars.com/api/?name=${consultant?.email || 'User'}&background=random`;
    if (photo.startsWith('http')) return photo;
    return `${apiBase}${photo}`;
  };

  useEffect(() => {
    loadConsultantProfile();
    if (user && user.role === 'customer') {
      loadMyRequest();
    }
  }, [id, user]);

  // FIX B5: Refresh request state when component becomes visible (after call ends)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && user.role === 'customer') {
        loadMyRequest();
      }
    };

    const handleFocus = () => {
      if (user && user.role === 'customer') {
        loadMyRequest();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Initialize Socket.IO for real-time request updates (like CustomerHome)
  useEffect(() => {
    if (!token || !user || user.role !== 'customer') return;

    const socket = io(apiBase, {
      transports: ['polling', 'websocket'],
      reconnection: true
    });
    socketRef.current = socket;

    // Authenticate and join customer room
    socket.emit('authenticate', { token });
    socket.emit('join_customer_room', { customerId: user.id });

    // FIX #7: Listen for consultant status updates (busy/available)
    socket.on('consultant_status_update', async (data) => {
      if (data && data.consultantId === parseInt(id)) {
        setConsultant(prev => prev ? { ...prev, is_busy: data.is_busy } : null);
      }
    });

    // Listen for request updates (cancelled, expired, accepted, etc.)
    socket.on('request_expired', async () => {
      await loadMyRequest();
    });

    socket.on('request_accepted', async (data) => {
      await loadMyRequest();
      // Auto-navigate customer to call/chat screen when consultant accepts
      if (data && data.requestId) {
        // Get request type from event data or fetch from API if missing
        let requestType = data.type;
        if (!requestType) {
          try {
            const headers = { Authorization: `Bearer ${token}` };
            if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
            const reqRes = await fetch(`${apiBase}/api/requests/${data.requestId}`, { headers });
            if (reqRes.ok) {
              const reqData = await reqRes.json();
              requestType = reqData.type || 'chat';
            } else {
              requestType = 'chat'; // Default to chat if fetch fails
            }
          } catch (e) {
            requestType = 'chat'; // Default to chat if fetch fails
          }
        }

        // Navigate based on request type
        if (requestType === 'voice' || requestType === 'video') {
          window.location.href = `/call/${data.requestId}`;
        } else if (requestType === 'chat') {
          window.location.href = `/chat/${data.requestId}`;
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user, apiBase]);

  const loadConsultantProfile = async () => {
    setLoading(true);
    try {
      // Get consultant from the consultants list (since individual endpoint doesn't exist)
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const listRes = await fetch(`${apiBase}/api/consultants?page=1&pageSize=100`, { headers });

      if (listRes.ok) {
        const listData = await listRes.json();
        const found = listData.consultants?.find(c => c.id === parseInt(id));
        if (found) {
          setConsultant(found);
          // Load reviews and booking slots
          loadReviews(parseInt(id), headers);
          loadBookingSlots(parseInt(id), headers);
        } else {
          // Consultant not found
          setConsultant(null);
        }
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (consultantId, headers) => {
    try {
      const res = await fetch(`${apiBase}/api/consultants/${consultantId}/reviews`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch (error) {
      // Ignore errors
    }
  };

  const loadBookingSlots = async (consultantId, headers) => {
    try {
      const res = await fetch(`${apiBase}/api/consultants/${consultantId}/slots`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Filter to show only available (not booked) slots
        const availableSlots = (data.slots || []).filter(slot => !slot.is_booked);
        setBookableSlots(availableSlots);
      }
    } catch (error) {
      // Ignore errors
    }
  };

  const loadMyRequest = async () => {
    if (!token || !user || user.role !== 'customer') return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${apiBase}/api/my-requests`, {
        headers
      });
      if (res.ok) {
        const data = await res.json();
        // Get all requests for this consultant
        const consultantRequests = data.filter(r => r.consultant_id === parseInt(id));
        setAllRequests(consultantRequests);
        // Set existingRequest to the first one (for backward compatibility with UI)
        setExistingRequest(consultantRequests.length > 0 ? consultantRequests[0] : null);
      }
    } catch (error) {
    }
  };

  const handleSendRequest = async (type = 'chat') => {
    if (!user) {
      navigate('/login', { state: { returnTo: `/consultant/${id}` } });
      return;
    }
    if (user.role !== 'customer') {
      alert('Solo i clienti possono inviare richieste');
      return;
    }

    // PERSISTENT CHAT SESSIONS: For chat, check if persistent session exists and open directly
    if (type === 'chat') {
      // Check if there's an accepted chat request (which means persistent session exists)
      const acceptedChatRequest = allRequests.find(r =>
        r.status === 'accepted' &&
        (r.type === 'chat' || !r.type)
      );

      if (acceptedChatRequest) {
        const isEnded = acceptedChatRequest.ended_at && acceptedChatRequest.ended_at !== null && acceptedChatRequest.ended_at !== '';
        const hasRoom = acceptedChatRequest.room_name && acceptedChatRequest.room_name !== null && acceptedChatRequest.room_name !== '';

        if (!isEnded && hasRoom) {
          // Persistent chat session exists - open it directly (no new request needed)
          window.location.href = `/chat/${acceptedChatRequest.id}`;
          return;
        }
      }

      // No persistent session exists - check for pending chat request first
      const pendingChatRequest = allRequests.find(r =>
        r.status === 'pending' &&
        (r.type === 'chat' || !r.type)
      );
      if (pendingChatRequest) {
        alert('Hai già una richiesta in sospeso con questo consulente. Attendi l\'approvazione.');
        return;
      }

      // Create new chat request (will create persistent session on acceptance)
      try {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
        const res = await fetch(`${apiBase}/api/requests`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ consultantId: parseInt(id), type: 'chat' })
        });
        if (res.ok) {
          const responseData = await res.json();
          // Construct explicit object for modal since API might only return ID
          const requestForModal = {
            ...responseData,
            status: 'pending',
            type: 'chat',
            consultant_id: parseInt(id),
            consultant_name: consultant?.name || consultant?.email?.split('@')[0] || 'Consulente'
          };
          await loadMyRequest();
          window.dispatchEvent(new CustomEvent('request_created', { detail: requestForModal }));
          alert('Richiesta inviata! In attesa dell\'approvazione del consulente.');
        } else {
          const error = await res.json().catch(() => ({}));
          alert(error.error || 'Invio richiesta fallito');
        }
      } catch (error) {
        alert('Invio richiesta fallito');
      }
      return;
    }

    // For voice/video calls: Check for pending request of SAME type only
    const pendingRequest = allRequests.find(r =>
      r.status === 'pending' &&
      r.type === type
    );
    if (pendingRequest) {
      alert('Hai già una richiesta in sospeso con questo consulente. Attendi l\'approvazione.');
      return;
    }

    // Check if we can reuse existing voice/video session (only if same type and active)
    const existingCallRequest = allRequests.find(r =>
      r.status === 'accepted' &&
      r.type === type
    );
    if (existingCallRequest) {
      const isEnded = existingCallRequest.ended_at && existingCallRequest.ended_at !== null && existingCallRequest.ended_at !== '';
      const hasRoom = existingCallRequest.room_name && existingCallRequest.room_name !== null && existingCallRequest.room_name !== '';

      // Only reuse if session is active and matches the type
      if (!isEnded && hasRoom) {
        window.location.href = `/call/${existingCallRequest.id}`;
        return;
      }
    }

    // Create new request for voice/video (even if chat is accepted)
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${apiBase}/api/requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ consultantId: parseInt(id), type })
      });
      if (res.ok) {
        const responseData = await res.json();
        // Construct explicit object for modal since API might only return ID
        const requestForModal = {
          ...responseData,
          status: 'pending',
          type: type,
          consultant_id: parseInt(id),
          consultant_name: consultant?.name || consultant?.email?.split('@')[0] || 'Consulente'
        };
        await loadMyRequest();
        window.dispatchEvent(new CustomEvent('request_created', { detail: requestForModal }));
        alert('Richiesta inviata! In attesa dell\'approvazione del consulente.');
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Invio richiesta fallito');
      }
    } catch (error) {
      alert('Invio richiesta fallito');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-center text-gray-600">Consulente non trovato</p>
      </div>
    );
  }

  const isOnline = consultant.is_online || false;
  const isBusy = consultant.is_busy || false;
  const rating = consultant.rating || 0;
  const reviewCount = reviews.length || 0;
  const microCategories = consultant.micro_categories || [];
  const consultantName = consultant.name || consultant.email?.split('@')[0] || 'Consultant';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <FaChevronLeft className="w-4 h-4" />
        <span>Indietro</span>
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Profile Photo */}
          <div className="flex-shrink-0">
            <div className="relative">
              <img
                src={getProfilePhotoUrl(consultant.profile_photo)}
                alt={consultant.email}
                className="w-40 h-40 rounded-full object-cover border-4 border-gray-200"
              />
              {isBusy ? (
                <span className="absolute bottom-4 right-4 w-5 h-5 bg-orange-500 rounded-full border-4 border-white whitespace-nowrap" title="In consultazione"></span>
              ) : isOnline && (
                <span className="absolute bottom-4 right-4 w-5 h-5 bg-green-500 rounded-full border-4 border-white" title="Disponibile"></span>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-grow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  {consultantName}
                </h1>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <FaStar className="text-yellow-500" />
                    <span className="text-xl font-bold text-gray-900">{Number(rating || 0).toFixed(2)}</span>
                    <span className="text-gray-600">({reviewCount} recensioni)</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${isBusy ? 'bg-orange-100 text-orange-800 whitespace-nowrap' : isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                    {isBusy ? 'In consultazione' : isOnline ? 'Disponibile' : 'Offline'}
                  </span>
                </div>
              </div>
              {user && user.role === 'customer' && (
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className={`p-3 rounded-full transition-colors ${isFavorite ? 'text-red-500 bg-red-50' : 'text-gray-400 hover:text-red-500'
                    }`}
                >
                  <FaHeart className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Micro Categories */}
            {microCategories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {microCategories.map((cat, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {translateCategory(cat)}
                  </span>
                ))}
              </div>
            )}

            {/* Bio */}
            {consultant.bio && (
              <p className="text-gray-700 mb-6 leading-relaxed">
                {consultant.bio}
              </p>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {!user ? (
                // Non-logged-in users: Show registration prompt
                <div className="col-span-2 md:col-span-4">
                  <Link
                    to="/signup"
                    className="flex flex-col items-center justify-center p-6 rounded-lg border-2 bg-gradient-to-r from-blue-600 to-purple-600 border-blue-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                  >
                    <span className="text-lg font-bold mb-2">Registrati per Contattare</span>
                    <span className="text-sm text-blue-100">Clicca qui per creare un account gratuito</span>
                  </Link>
                </div>
              ) : user.role !== 'customer' ? (
                // Non-customer users: Show message
                <div className="col-span-2 md:col-span-4">
                  <div className="flex items-center justify-center p-6 rounded-lg border-2 bg-gray-50 border-gray-200 text-gray-600">
                    <span className="text-base font-semibold">Solo i clienti possono contattare i consulenti</span>
                  </div>
                </div>
              ) : user.role === 'customer' && (
                // Logged-in customers: Always show action buttons
                <>
                  {existingRequest && existingRequest.status === 'pending' ? (
                    <div className="col-span-2 md:col-span-4">
                      <button
                        disabled
                        className="w-full flex items-center justify-center p-6 rounded-lg border-2 bg-gray-100 border-gray-300 text-gray-600 cursor-not-allowed"
                      >
                        <FaClock className="w-6 h-6 mr-3" />
                        <span className="text-base font-semibold">Richiesta in Attesa di Approvazione</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSendRequest('voice')}
                        disabled={!isOnline || isBusy}
                        className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${!isOnline
                          ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                          : 'bg-blue-600 border-blue-600 hover:bg-blue-700 hover:border-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                          }`}
                      >
                        <FaPhone className="w-8 h-8 mb-3" />
                        <span className="text-sm font-semibold text-center">Chiamata Vocale</span>
                      </button>
                      <button
                        onClick={() => handleSendRequest('video')}
                        disabled={!isOnline || isBusy}
                        className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${!isOnline
                          ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                          : 'bg-blue-600 border-blue-600 hover:bg-blue-700 hover:border-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                          }`}
                      >
                        <FaVideo className="w-8 h-8 mb-3" />
                        <span className="text-sm font-semibold text-center">Videochiamata</span>
                      </button>
                      <button
                        onClick={() => handleSendRequest('chat')}
                        disabled={!isOnline || isBusy}
                        className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition-all ${!isOnline
                          ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                          : 'bg-gray-100 border-gray-300 hover:bg-gray-200 hover:border-gray-400 text-gray-900 shadow-md hover:shadow-lg transform hover:scale-105'
                          }`}
                      >
                        <FaComments className="w-8 h-8 mb-3" />
                        <span className="text-sm font-semibold text-center">Chat</span>
                      </button>
                      <button
                        onClick={() => {
                          const element = document.getElementById('bookable-services');
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="flex flex-col items-center justify-center p-6 rounded-lg border-2 bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-900 shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                      >
                        <FaCalendar className="w-8 h-8 mb-3" />
                        <span className="text-sm font-semibold text-center">Prenota Appuntamento</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Prezzi</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaComments className="w-8 h-8 text-blue-600" />
              <h3 className="text-lg font-semibold">Chat</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              €{consultant.chat_price || '0.10'}/message
            </p>
            <p className="text-gray-600 text-sm">Pagamento per messaggio</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaPhone className="w-8 h-8 text-green-600" />
              <h3 className="text-lg font-semibold">Chiamata Vocale</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              €{consultant.voice_price || '1.50'}/min
            </p>
            <p className="text-gray-600 text-sm">Per minute billing</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaVideo className="w-8 h-8 text-purple-600" />
              <h3 className="text-lg font-semibold">Videochiamata</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              €{consultant.video_price || '2.00'}/min
            </p>
            <p className="text-gray-600 text-sm">Fatturazione al minuto</p>
          </div>
        </div>
      </div>

      {/* Available Bookable Services */}
      {bookableSlots.length > 0 && (
        <div id="bookable-services" className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Servizi Prenotabili Disponibili</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookableSlots.map((slot, idx) => {
              // Convert Rome Time -> User Time
              const slotDateObj = parseRomeDate(slot.date, slot.time);
              const userTz = user?.timezone;
              const formattedTime = formatTimeInZone(slotDateObj, userTz);

              return (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{slot.title}</h3>
                    <span className="text-lg font-bold text-blue-600">€{Number(slot.price || 0).toFixed(2)}</span>
                  </div>
                  {slot.description && (
                    <p className="text-sm text-gray-600 mb-3">{slot.description}</p>
                  )}
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center space-x-2">
                      <FaCalendar className="w-4 h-4" />
                      <span>{slotDateObj.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <FaClock className="w-4 h-4" />
                      <span className="font-semibold text-blue-800">{formattedTime}</span>
                      <span className="text-xs text-gray-500">({slot.duration} min)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="capitalize">{slot.mode}</span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full mt-4"
                    onClick={async () => {
                      if (!user) {
                        navigate('/login', { state: { returnTo: `/consultant/${id}` } });
                        return;
                      }
                      if (user.role !== 'customer') {
                        alert('Solo i clienti possono prenotare appuntamenti');
                        return;
                      }

                      // Check if user has enough credits
                      if (user.credits < slot.price) {
                        alert(`Crediti insufficienti. Ti servono €${Number(slot.price || 0).toFixed(2)}. Il tuo saldo attuale è €${Number(user.credits || 0).toFixed(2)}.`);
                        navigate('/account?tab=topup');
                        return;
                      }

                      // Confirm booking
                      if (!window.confirm(`Confermi la prenotazione per €${Number(slot.price || 0).toFixed(2)}?`)) {
                        return;
                      }

                      try {
                        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
                        if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                        const res = await fetch(`${apiBase}/api/bookings`, {
                          method: 'POST',
                          headers,
                          body: JSON.stringify({ slotId: slot.id })
                        });

                        if (res.ok) {
                          const data = await res.json();
                          alert('Prenotazione confermata! Riceverai un\'email con il link per l\'appuntamento.');
                          // Reload slots to update availability
                          const slotHeaders = { Authorization: `Bearer ${token}` };
                          if ((apiBase || '').includes('ngrok')) slotHeaders['ngrok-skip-browser-warning'] = 'true';
                          await loadBookingSlots(parseInt(id), slotHeaders);
                          // Navigate to appointments page
                          navigate('/appointments');
                        } else {
                          const error = await res.json().catch(() => ({}));
                          alert(error.error || 'Prenotazione fallita');
                        }
                      } catch (error) {
                        alert('Errore durante la prenotazione');
                      }
                    }}
                  >
                    Prenota e Paga
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews Section */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Recensioni</h2>
        {reviews.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nessuna recensione ancora.</p>
        ) : (
          <div className="space-y-6">
            {reviews.map((review, idx) => (
              <div key={idx} className="border-b border-gray-200 pb-6 last:border-0 last:pb-0">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <FaStar
                          key={i}
                          className={`w-5 h-5 ${i < review.rating ? 'text-yellow-500' : 'text-gray-300'
                            }`}
                        />
                      ))}
                    </div>
                    <span className="font-semibold text-gray-900">{review.customer_nickname || review.customer_email?.split('@')[0] || 'Anonimo'}</span>
                  </div>
                  <span className="text-sm text-gray-500">{review.created_at}</span>
                </div>
                <p className="text-gray-700 mb-3">{review.comment}</p>
                {user && user.role === 'consultant' && user.id === consultant.id && (
                  <div className="ml-8 pl-4 border-l-2 border-gray-200">
                    {review.reply ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">La Tua Risposta:</p>
                        <p className="text-gray-700">{review.reply}</p>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          const reply = prompt('Inserisci la tua risposta:');
                          if (reply && reply.trim()) {
                            try {
                              const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
                              if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                              const res = await fetch(`${apiBase}/api/reviews/${review.id}/reply`, {
                                method: 'PUT',
                                headers,
                                body: JSON.stringify({ reply: reply.trim() })
                              });
                              if (res.ok) {
                                // Reload reviews to show the reply
                                await loadReviews(parseInt(id), headers);
                              } else {
                                alert('Errore nell\'invio della risposta');
                              }
                            } catch (error) {
                              alert('Errore nell\'invio della risposta');
                            }
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Rispondi a questa recensione
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsultantProfile;


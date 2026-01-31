import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  FaSearch,
  FaShieldAlt,
  FaLock,
  FaStar,
  FaFlag,
  FaLeaf,
  FaClock,
  FaCheckCircle
} from 'react-icons/fa';
import ConsultantCard from '../components/ui/ConsultantCard';
import Button from '../components/ui/Button';
import { io } from 'socket.io-client';
// TODO: Update this path with your actual banner image filename
import bannerImage from '../assets/images/banner.png';

const HomePage = () => {
  const { user, token, apiBase } = useAuth();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [consultants, setConsultants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const socketRef = useRef(null);

  const loadMyRequests = async () => {
    if (!apiBase || !token || !user || user.role !== 'customer') return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${apiBase}/api/my-requests`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data || []);
      }
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    // Load consultants for both logged-in and non-logged-in users
    // Debounce search to avoid excessive API calls
    const timer = setTimeout(() => {
      loadConsultants();
    }, 500); // 500ms debounce

    if (user && token && user.role === 'customer') {
      loadMyRequests();
    }

    // Only refresh consultant list for logged-in users to update online status
    // Non-logged-in users don't need real-time updates
    if (user && token) {
      const interval = setInterval(() => {
        loadConsultants();
      }, 10000); // Refresh every 10 seconds for logged-in users
      return () => clearInterval(interval);
    }

    return () => clearTimeout(timer);
  }, [user, token, selectedCategory, searchQuery]);

  // Initialize Socket.IO for real-time request updates (only for customers)
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

    // Listen for request updates
    socket.on('request_expired', async () => {
      await loadMyRequests();
    });

    socket.on('request_accepted', async (data) => {
      await loadMyRequests();
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

  const loadConsultants = async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const headers = {};
      // Only add auth header if user is logged in
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      // Add category and search filters
      let url = `${apiBase}/api/consultants?page=1&pageSize=6`;
      if (selectedCategory && selectedCategory !== 'all') {
        url += `&category=${selectedCategory}`;
      }
      if (searchQuery && searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      const res = await fetch(url, { headers });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        setConsultants(data.consultants || []);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleConsultantClick = (consultantId) => {
    if (!user) {
      // Encourage registration when clicking on consultant
      if (confirm('Per contattare questo consulente, devi registrarti. Vuoi procedere con la registrazione?')) {
        navigate('/signup');
      }
      return;
    }
    // Navigate to consultant profile or send request
  };

  const trustFeatures = [
    {
      icon: <FaClock className="w-8 h-8" />,
      title: "Esperti disponibili 24/7",
      description: "Connettiti in qualsiasi momento, giorno o notte"
    },
    {
      icon: <FaShieldAlt className="w-8 h-8" />,
      title: "Protezione dell'Anonimato",
      description: "La tua privacy è la nostra priorità"
    },
    {
      icon: <FaLock className="w-8 h-8" />,
      title: "Transazioni Sicure",
      description: "Elaborazione pagamenti 100% sicura"
    },
    {
      icon: <FaStar className="w-8 h-8" />,
      title: "Recensioni Verificate",
      description: "Feedback autentici da utenti reali"
    },
    {
      icon: <FaFlag className="w-8 h-8" />,
      title: "100% Made in Italy",
      description: "Esperti locali di cui puoi fidarti"
    },
    {
      icon: <FaLeaf className="w-8 h-8" />,
      title: "Eco-Responsabile",
      description: "Servizio sostenibile e consapevole"
    }
  ];

  // Sort consultants: online first
  const sortedConsultants = [...consultants].sort((a, b) => {
    const aOnline = a.is_online || false;
    const bOnline = b.is_online || false;
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen">
      {/* Hero Section with Banner Image */}
      <div className="relative w-full overflow-hidden">
        {/* Banner Image Background */}
        <div
          className="relative w-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${bannerImage})`,
            minHeight: '500px',
            backgroundPosition: 'center right'
          }}
        >
          {/* Overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-900/60 via-purple-800/40 to-transparent"></div>

          {/* Content Overlay */}
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
            <div className="max-w-2xl">
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight text-white drop-shadow-lg">
                La prima piattaforma che connette le persone giuste, al momento giusto.
              </h1>
              <p className="text-xl md:text-2xl mb-8 text-white/90 drop-shadow-md">
                Risposte chiare via telefono e chat
              </p>

              {/* Search Bar */}
              <div className="mb-8">
                <div className="relative">
                  <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                  <input
                    type="text"
                    placeholder="Cerca consulenti..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-lg bg-white/95 backdrop-blur-sm text-gray-900 text-lg border-2 border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/60 transition-all shadow-lg"
                  />
                </div>
              </div>

              {!user && (
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => navigate('/signup')}
                    className="!bg-white !text-blue-900 hover:!bg-blue-50 font-semibold shadow-lg"
                  >
                    Registrati Gratis
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigate('/login')}
                    className="border-white text-white hover:bg-white hover:text-blue-900 shadow-lg"
                  >
                    Accedi
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <button
            onClick={() => {
              setSelectedCategory('coaching');
              // If user is logged in, navigate to customer page; otherwise just filter on homepage
              if (user && user.role === 'customer') {
                navigate('/customer', { state: { filterCategory: 'coaching' } });
              }
            }}
            className={`relative p-8 rounded-xl border-2 transition-all transform hover:scale-105 ${selectedCategory === 'coaching'
              ? 'border-blue-600 bg-blue-50 shadow-lg'
              : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-2">COACHING</h2>
            <p className="text-gray-600">Guida alla vita e alla carriera</p>
            {selectedCategory === 'coaching' && (
              <div className="absolute top-4 right-4">
                <FaCheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            )}
          </button>
          <button
            onClick={() => {
              setSelectedCategory('cartomancy');
              // If user is logged in, navigate to customer page; otherwise just filter on homepage
              if (user && user.role === 'customer') {
                navigate('/customer', { state: { filterCategory: 'cartomancy' } });
              }
            }}
            className={`relative p-8 rounded-xl border-2 transition-all transform hover:scale-105 ${selectedCategory === 'cartomancy'
              ? 'border-blue-600 bg-blue-50 shadow-lg'
              : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-2">CARTOMANZIA</h2>
            <p className="text-gray-600">Tarocchi e Astrologia</p>
            {selectedCategory === 'cartomancy' && (
              <div className="absolute top-4 right-4">
                <FaCheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            )}
          </button>
        </div>

        {/* Welcome Bonus Banner - Only for customers */}
        {user && user.role === 'customer' && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-6 mb-12 shadow-lg">
            <div className="flex items-center space-x-4">
              <div className="bg-white bg-opacity-20 rounded-full p-3">
                <FaStar className="w-6 h-6" />
              </div>
              <div className="flex-grow">
                <h3 className="text-xl font-bold mb-1">Benvenuto su Swang!</h3>
                <p className="text-green-50">
                  Hai ricevuto €5 di credito bonus per iniziare la tua prima sessione.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Consultant Listings - Now visible to everyone */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gray-900">
              {selectedCategory === 'coaching' ? 'Consulenti di Coaching' :
                selectedCategory === 'cartomancy' ? 'Consulenti di Cartomanzia' :
                  'I Migliori Consulenti in Italia'}
            </h2>
            {user && user.role === 'customer' && (
              <Link
                to="/customer"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Vedi tutti →
              </Link>
            )}
            {!user && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/signup')}
              >
                Registrati per vedere tutti
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : sortedConsultants.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedConsultants.slice(0, 6).map((consultant) => {
                // Find request status for this consultant
                const rel = myRequests.find(r => r.consultant_id === consultant.id);
                const requestStatus = rel
                  ? {
                    status: rel.status,
                    requestId: rel.id,
                    room_name: rel.room_name,
                    ended_at: rel.ended_at,
                    active: rel.active,
                    type: rel.type
                  }
                  : null;

                const handleSendRequest = async (consultantId, type = 'chat') => {
                  if (!user) {
                    // Encourage registration when clicking on consultant actions
                    if (confirm('Per contattare questo consulente, devi registrarti. Vuoi procedere con la registrazione?')) {
                      navigate('/signup');
                    }
                    return;
                  }
                  if (user.role !== 'customer') {
                    navigate('/customer');
                    return;
                  }

                  // Check if there's a pending request
                  const pendingRequest = myRequests.find(r => r.consultant_id === consultantId && r.status === 'pending');
                  if (pendingRequest) {
                    alert('Hai già una richiesta in sospeso con questo consulente. Attendi l\'approvazione.');
                    return;
                  }

                  // Check if there's already an accepted request with this consultant
                  const existingRequest = myRequests.find(r => r.consultant_id === consultantId && r.status === 'accepted');
                  if (existingRequest) {
                    // Requirement #1: Check if we can reuse existing session
                    // Chat can reuse active sessions, but voice/video calls need new request after call ends
                    const isEnded = existingRequest.ended_at && existingRequest.ended_at !== null && existingRequest.ended_at !== '';
                    const hasRoom = existingRequest.room_name && existingRequest.room_name !== null && existingRequest.room_name !== '';
                    const requestType = existingRequest.type || 'chat';

                    // For chat: reuse active session if not ended
                    if (type === 'chat' && !isEnded && hasRoom) {
                      window.location.href = `/chat/${existingRequest.id}`;
                      return;
                    }

                    // For voice/video: only reuse if session is active and matches the type
                    if ((type === 'voice' || type === 'video') && !isEnded && hasRoom && requestType === type) {
                      window.location.href = `/call/${existingRequest.id}`;
                      return;
                    }
                  }

                  // No active session found, send new request
                  try {
                    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
                    if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                    if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                    const res = await fetch(`${apiBase}/api/requests`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ consultantId, type })
                    });
                    if (res.ok) {
                      const newRequest = await res.json();
                      await loadMyRequests();

                      // Dispatch event to trigger GlobalOutboundCallHandler modal immediately
                      console.log('[DEBUG-HOME] Dispatching request_created with enriched payload');
                      window.dispatchEvent(new CustomEvent('request_created', {
                        detail: {
                          ...newRequest,
                          status: 'pending',
                          type: type,
                          consultant_id: consultant.id,
                          consultant_name: consultant.name || consultant.email?.split('@')[0],
                          consultant_email: consultant.email
                        }
                      }));

                      // alert('Richiesta inviata! Attendi l\'approvazione del consulente.'); // Removed in favor of modal
                    } else {
                      const error = await res.json().catch(() => ({}));
                      alert(error.error || 'Invio richiesta fallito');
                    }
                  } catch (error) {
                    alert('Invio richiesta fallito');
                  }
                };

                return (
                  <ConsultantCard
                    key={consultant.id}
                    consultant={consultant}
                    requestStatus={requestStatus}
                    onSendRequest={handleSendRequest}
                    onMicroCategoryClick={(cat) => {
                      navigate('/customer', { state: { filterMicroCategory: cat } });
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-600">Nessun consulente disponibile al momento.</p>
            </div>
          )}

          {user && user.role === 'customer' && (
            <div className="text-center mt-8">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/customer')}
              >
                Scopri Tutti i Consulenti
              </Button>
            </div>
          )}
          {!user && (
            <div className="text-center mt-8">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/signup')}
                className="!bg-blue-600 !text-white hover:!bg-blue-700"
              >
                Registrati Gratis per Iniziare
              </Button>
            </div>
          )}
        </div>

        {/* Trust Features Section */}
        <div className="bg-gray-50 rounded-2xl p-12 mb-12">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Perché Fidarti di Noi?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {trustFeatures.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-lg p-6 text-center hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-center mb-4 text-blue-600">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        {!user && (
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-12 text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">
              Pronto a Trovare Risposte?
            </h2>
            <p className="text-xl mb-8 text-blue-100">
              Unisciti a migliaia di utenti soddisfatti oggi
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/signup')}
                className="!bg-white !text-blue-600 hover:!bg-blue-50 font-semibold"
              >
                Inizia Gratis
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate('/login')}
                className="border-white text-white hover:bg-white hover:text-blue-600"
              >
                Già Membro? Accedi
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;


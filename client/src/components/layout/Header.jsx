import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { HiChevronDown, HiPlus, HiMenu, HiX } from 'react-icons/hi';
import { FaComments } from 'react-icons/fa';
import Button from '../ui/Button';
import TopUpModal from '../modals/TopUpModal';
import logoImage from '../../assets/images/logo.png';

const Header = () => {
  const { user, logout, pendingCount, token, apiBase } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [activeChats, setActiveChats] = useState([]);
  
  const commonHeaders = useMemo(() => {
    const base = {};
    if (token) base.Authorization = `Bearer ${token}`;
    if ((apiBase || '').includes('ngrok')) base['ngrok-skip-browser-warning'] = 'true';
    return base;
  }, [token, apiBase]);
  
  // Load active chats for consultants
  useEffect(() => {
    if (user?.role === 'consultant' && token) {
      const loadChats = async () => {
        try {
          const res = await fetch(`${apiBase}/api/consultant/active-chats`, { headers: commonHeaders });
          if (res.ok) {
            const data = await res.json();
            setActiveChats(Array.isArray(data) ? data : []);
          }
        } catch (error) {
          // Ignore errors
        }
      };
      loadChats();
      // Refresh every 2 seconds for faster badge updates
      const interval = setInterval(loadChats, 2000);
      // Also refresh when window regains focus (user comes back from chat page)
      const handleFocus = () => loadChats();
      // Also refresh when page becomes visible (user switches back to tab)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          loadChats();
        }
      };
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user, token, apiBase, commonHeaders]);

  const handleLogout = () => {
    logout();
    navigate('/');
    setShowUserMenu(false);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        {/* Top Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <img 
                src={logoImage} 
                alt="Swang.it Logo" 
                className="h-12 w-auto object-contain"
              />
            </Link>

            {/* Navigation - Center */}
            <nav className="hidden md:flex items-center space-x-1">
              <Link
                to="/customer?category=coaching"
                className="px-4 py-2 text-gray-700 hover:text-blue-600 font-medium transition-colors"
              >
                COACHING
              </Link>
              <Link
                to="/customer?category=cartomancy"
                className="px-4 py-2 text-gray-700 hover:text-blue-600 font-medium transition-colors"
              >
                CARTOMANZIA
              </Link>
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-3">
              {!user ? (
                <div className="hidden md:flex items-center space-x-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/signup')}
                  >
                    Registrati
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/login')}
                  >
                    Accedi
                  </Button>
                </div>
              ) : (
                <div className="hidden md:flex items-center space-x-3">
                  {/* Balance & Top-Up */}
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-700 font-medium">
                      €{Number(user.credits || 0).toFixed(2)}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowTopUpModal(true)}
                      className="flex items-center space-x-1"
                    >
                      <span>Ricarica</span>
                      <HiPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {user.role === 'consultant' && pendingCount > 0 && (
                    <span className="text-sm text-gray-600">Pending: {pendingCount}</span>
                  )}

                  {/* Chat Menu for Consultants */}
                  {user.role === 'consultant' && (
                    <div className="relative">
                      <button
                        onClick={async () => {
                          if (!showChatMenu && user?.role === 'consultant' && token) {
                            // Refresh chats when opening menu
                            try {
                              const res = await fetch(`${apiBase}/api/consultant/active-chats`, { headers: commonHeaders });
                              if (res.ok) {
                                const data = await res.json();
                                setActiveChats(Array.isArray(data) ? data : []);
                              }
                            } catch (error) {
                              // Ignore errors
                            }
                          }
                          setShowChatMenu(!showChatMenu);
                        }}
                        className="relative flex items-center space-x-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Chat"
                      >
                        <FaComments className="w-5 h-5 text-gray-700" />
                        {activeChats.filter(chat => chat.is_unread === 1).length > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {activeChats.filter(chat => chat.is_unread === 1).length}
                          </span>
                        )}
                      </button>

                      {showChatMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowChatMenu(false)}
                          />
                          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-96 overflow-y-auto">
                            <div className="px-4 py-2 border-b border-gray-200">
                              <h3 className="text-sm font-semibold text-gray-900">Chat Attive</h3>
                            </div>
                            {activeChats.length === 0 ? (
                              <div className="px-4 py-8 text-center text-sm text-gray-500">
                                Nessuna chat attiva
                              </div>
                            ) : (
                              activeChats.map((chat) => (
                                <button
                                  key={chat.request_id}
                                  onClick={async () => {
                                    if (chat.request_id) {
                                      navigate(`/chat/${chat.request_id}`);
                                      setShowChatMenu(false);
                                    }
                                  }}
                                  className="block w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-medium text-gray-900 text-sm">
                                    {chat.customer_name || chat.customer_email?.split('@')[0] || 'Cliente'}
                                  </div>
                                  {chat.message_count > 0 && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {chat.message_count} messaggi
                                    </div>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* User Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-gray-700 font-medium">
                        {user.email?.split('@')[0] || 'User'}
                      </span>
                      <HiChevronDown className="w-4 h-4 text-gray-500" />
                    </button>

                    {showUserMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowUserMenu(false)}
                        />
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          <button
                            onClick={() => {
                              navigate('/account');
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Il tuo account
                          </button>
                          <button
                            onClick={() => {
                              navigate(user.role === 'customer' ? '/customer' : '/consultant');
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Dashboard
                          </button>
                          <button
                            onClick={() => {
                              navigate('/appointments');
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            I Miei Appuntamenti
                          </button>
                          <button
                            onClick={() => {
                              navigate('/transactions');
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Cronologia Transazioni
                          </button>
                          <button
                            onClick={() => {
                              setShowTopUpModal(true);
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Ricarica Crediti
                          </button>
                          <button
                            onClick={() => {
                              navigate('/help');
                              setShowUserMenu(false);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Centro Assistenza
                          </button>
                          {user.role === 'admin' && (
                            <button
                              onClick={() => {
                                navigate('/admin');
                                setShowUserMenu(false);
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
                            >
                              Admin Panel
                            </button>
                          )}
                          <hr className="my-1 border-gray-200" />
                          <button
                            onClick={handleLogout}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                          >
                            Esci
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <button
                className="md:hidden p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Toggle menu"
                onClick={() => setIsMobileMenuOpen(prev => !prev)}
              >
                {isMobileMenuOpen ? <HiX className="w-5 h-5" /> : <HiMenu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white shadow-inner">
            <div className="px-4 py-4 space-y-4">
              <div className="space-y-2">
                <Link
                  to="/customer?category=coaching"
                  className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  COACHING
                </Link>
                <Link
                  to="/customer?category=cartomancy"
                  className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  CARTOMANZIA
                </Link>
              </div>

              {!user ? (
                <div className="space-y-2">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      navigate('/signup');
                    }}
                  >
                    Registrati
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    className="w-full"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      navigate('/login');
                    }}
                  >
                    Accedi
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                    <span className="text-gray-700 font-medium">
                      €{Number(user.credits || 0).toFixed(2)}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setShowTopUpModal(true);
                        setIsMobileMenuOpen(false);
                      }}
                      className="flex items-center space-x-1"
                    >
                      <span>Ricarica</span>
                      <HiPlus className="w-4 h-4" />
                    </Button>
                  </div>

                  {user.role === 'consultant' && pendingCount > 0 && (
                    <div className="px-3 py-2 rounded-lg bg-yellow-50 text-sm text-yellow-800">
                      Richieste in attesa: {pendingCount}
                    </div>
                  )}

                  {user.role === 'consultant' && activeChats.length > 0 && (
                    <div className="px-3 py-2 rounded-lg bg-blue-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">Chat Attive</span>
                        <FaComments className="w-4 h-4 text-gray-700" />
                      </div>
                      <div className="space-y-1">
                        {activeChats.slice(0, 5).map((chat) => (
                          <button
                            key={chat.request_id}
                            onClick={() => {
                              if (chat.request_id) {
                                navigate(`/chat/${chat.request_id}`);
                                setIsMobileMenuOpen(false);
                              }
                            }}
                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-blue-100 transition-colors"
                          >
                            {chat.customer_name || chat.customer_email?.split('@')[0] || 'Cliente'}
                          </button>
                        ))}
                        {activeChats.length > 5 && (
                          <div className="text-xs text-gray-500 px-2 py-1">
                            +{activeChats.length - 5} altre chat
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                      onClick={() => {
                        navigate('/account');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Il tuo account
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                      onClick={() => {
                        navigate(user.role === 'customer' ? '/customer' : '/consultant');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Dashboard
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                      onClick={() => {
                        navigate('/appointments');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      I Miei Appuntamenti
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                      onClick={() => {
                        navigate('/transactions');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Cronologia Transazioni
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                      onClick={() => {
                        navigate('/help');
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Centro Assistenza
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg text-red-600 hover:bg-gray-100"
                      onClick={handleLogout}
                    >
                      Esci
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Top-Up Modal */}
      {user && (
        <TopUpModal
          isOpen={showTopUpModal}
          onClose={() => setShowTopUpModal(false)}
          currentBalance={Number(user.credits || 0)}
        />
      )}
    </>
  );
};

export default Header;


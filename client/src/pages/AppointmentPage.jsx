import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { parseRomeDate, formatTimeInZone, formatDateTimeInZone } from '../utils/dateUtils';

export default function AppointmentPage() {
  const { bookingId, token } = useParams();
  const navigate = useNavigate();
  // AuthContext provides 'token' (renamed to authToken) and 'loading' (renamed to authLoading)
  const { token: authToken, refreshUser, user, loading: authLoading } = useAuth();
  const apiBase = import.meta.env.VITE_API_URL || '/api';

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const loadAppointment = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${apiBase}/appointment/${bookingId}/${token}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (!res.ok) {
          if (res.status === 404) throw new Error('Appuntamento non trovato');
          if (res.status === 403) throw new Error('Accesso negato');
          throw new Error('Errore nel caricamento dell\'appuntamento');
        }

        const data = await res.json();
        // Server returns the appointment data at root, not nested
        setAppointment(data);
      } catch (err) {
        console.error('Error loading appointment:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Wait for auth to finish loading before deciding to redirect
    if (authLoading) return;

    if (bookingId && token && authToken) {
      loadAppointment();
    } else if (!authToken) {
      // If not logged in AND auth is done loading, redirect to login
      navigate('/login', { state: { returnTo: `/appointment/${bookingId}/${token}` } });
    }
  }, [bookingId, token, authToken, apiBase, navigate, authLoading]);

  // Countdown timer
  useEffect(() => {
    if (!appointment || !appointment.slot) return;

    const updateCountdown = () => {
      const now = new Date();
      // Use server provided appointmentDateTime if available (Rome Time ISO)
      // Otherwise parse locally from slot details
      let appointmentTime;
      if (appointment.appointmentDateTime) {
        appointmentTime = new Date(appointment.appointmentDateTime);
      } else {
        appointmentTime = parseRomeDate(appointment.slot.date, appointment.slot.time);
      }

      const diff = appointmentTime.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ minutes, seconds, totalMinutes: Math.floor(diff / (1000 * 60)) });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [appointment]);

  const handleJoin = async () => {
    try {
      setJoining(true);
      const res = await fetch(`${apiBase}/appointment/${bookingId}/${token}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Errore durante l\'accesso alla chiamata');
      }

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.roomName) {
        console.error('No join URL returned', data);
        alert('Errore: URL della stanza mancante');
      } else {
        window.location.reload();
      }

    } catch (err) {
      console.error('Join error:', err);
      alert(err.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento appuntamento...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Errore</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/appointments')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Vai ai miei appuntamenti
          </button>
        </div>
      </div>
    );
  }

  if (!appointment) return null;

  const { slot, appointmentDateTime, minutesDiff, isWithinWindow, isBeforeWindow, isAfterWindow, consultant, customer, isCustomer, isConsultant } = appointment;

  // Helper for rendering
  const displayDateTime = () => {
    // Use user's preference if available, otherwise browser default
    return formatDateTimeInZone(
      appointmentDateTime ? new Date(appointmentDateTime) : parseRomeDate(slot.date, slot.time),
      user?.timezone || null
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Appuntamento</h1>

          {/* Appointment Details */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Dettagli appuntamento</h2>
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="text-gray-500 mr-3">📅</span>
                <div>
                  <p className="text-sm text-gray-500">Data e ora</p>
                  <p className="text-gray-900 font-medium">{displayDateTime()}</p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-gray-500 mr-3">⏱️</span>
                <div>
                  <p className="text-sm text-gray-500">Durata</p>
                  <p className="text-gray-900 font-medium">{slot.duration} minuti</p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-gray-500 mr-3">💬</span>
                <div>
                  <p className="text-sm text-gray-500">Modalità</p>
                  <p className="text-gray-900 font-medium">
                    {slot.mode === 'video' ? 'Videochiamata' : slot.mode === 'voice' ? 'Chiamata vocale' : 'Chat'}
                  </p>
                </div>
              </div>
              {slot.title && (
                <div className="flex items-start">
                  <span className="text-gray-500 mr-3">📝</span>
                  <div>
                    <p className="text-sm text-gray-500">Servizio</p>
                    <p className="text-gray-900 font-medium">{slot.title}</p>
                  </div>
                </div>
              )}
              {isCustomer && consultant && (
                <div className="flex items-start">
                  <span className="text-gray-500 mr-3">👤</span>
                  <div>
                    <p className="text-sm text-gray-500">Consulente</p>
                    <p className="text-gray-900 font-medium">{consultant.name || consultant.email}</p>
                  </div>
                </div>
              )}
              {isConsultant && customer && (
                <div className="flex items-start">
                  <span className="text-gray-500 mr-3">👤</span>
                  <div>
                    <p className="text-sm text-gray-500">Cliente</p>
                    <p className="text-gray-900 font-medium">{customer.nickname || customer.email}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status Messages */}
          {isBeforeWindow && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-yellow-400 text-xl">⏰</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>L'appuntamento non è ancora disponibile.</strong>
                  </p>

                  <p className="text-sm text-yellow-600 mt-2">
                    Il link diventerà attivo 5 minuti prima dell'orario programmato.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAfterWindow && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-red-400 text-xl">❌</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    <strong>L'appuntamento è scaduto.</strong>
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    Il link era valido solo fino a 5 minuti dopo l'orario programmato.
                  </p>
                  {slot.credits_held > 0 && slot.credits_released === 0 && (
                    <p className="text-sm text-red-600 mt-2">
                      I crediti pre-autorizzati verranno rilasciati automaticamente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {isWithinWindow && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-green-400 text-xl">✅</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    <strong>L'appuntamento è disponibile!</strong>
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    Puoi unirti alla chiamata ora. Il link scadrà tra {Math.abs(minutesDiff)} minuti.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Join Button */}
          <div className="mt-8">
            {isWithinWindow ? (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joining ? 'Caricamento...' : 'Unisciti alla chiamata'}
              </button>
            ) : (
              <button
                disabled
                className="w-full py-4 bg-gray-300 text-gray-500 rounded-lg font-semibold text-lg cursor-not-allowed"
              >
                {isBeforeWindow ? 'Link non ancora attivo' : 'Link scaduto'}
              </button>
            )}
          </div>

          {/* Back Button */}
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate('/appointments')}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              ← Torna ai miei appuntamenti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

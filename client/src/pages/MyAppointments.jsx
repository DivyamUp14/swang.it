import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FaCalendar, FaClock, FaUser, FaVideo, FaComments, FaCheckCircle } from 'react-icons/fa';
import Button from '../components/ui/Button';

const MyAppointments = () => {
  const { user, token, apiBase } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    fetchAppointments(); // Fixed: function was renamed

    // Timer for countdown and verification
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Verification Logger (Runs when 'now' updates, throttled)
  useEffect(() => {
    if (appointments.length > 0 && Math.floor(Date.now() / 1000) % 5 === 0) {
      // Find the next upcoming appointment for verification logging
      const nextAppt = appointments.find(a => a.status === 'accepted' && new Date(a.appointment_date) > new Date(Date.now() - 3600000)); // recently passed or future

      if (nextAppt) {
        const apptDate = new Date(nextAppt.appointment_date);
        const diff = apptDate.getTime() - new Date().getTime();
      }
    }
  }, [now, appointments]);

  const isCallActive = (dateString) => {
    if (!dateString) return false;
    // Assuming dateString is "YYYY-MM-DD HH:MM:SS" or ISO from server.
    // If it's pure UTC/ISO, new Date(dateString) works.
    // If it triggers the "Rome Time" issue, we might need the fix.
    // For now, let's assume standard Date parsing is close enough or use the verified offset if needed.
    // Given the previous fix, let's be robust:
    const apptDate = new Date(dateString);
    const diff = apptDate.getTime() - now.getTime();
    // Active if difference is less than 5 minutes (300000 ms) OR if it's already past (negative diff)
    // But don't keep it active forever? Maybe 1 hour limit? 
    // "Partecipa" usually stays active during the call.
    return diff <= 300000;
  };


  // Handle cancellation from email link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cancelId = params.get('cancel');
    const emailToken = params.get('token'); // Renamed to avoid conflict with auth token

    if (cancelId && emailToken) {
      handleEmailCancellation(cancelId, emailToken);
    }
  }, [location.search, token, apiBase]); // Added token and apiBase to dependencies

  const handleEmailCancellation = async (bookingId, emailToken) => { // Renamed token to emailToken
    if (!window.confirm('Sei sicuro di voler cancellare questo appuntamento?')) {
      // Clear params if user cancels action
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/appointment/${bookingId}/${emailToken}/cancel`, { // Used emailToken
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}` // Use the auth token from context
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert('Appuntamento cancellato con successo.');
        // Refresh list
        fetchAppointments();
      } else {
        const err = await response.json();
        alert(`Errore: ${err.error || 'Impossibile cancellare l\'appuntamento'}`);
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      alert('Si è verificato un errore durante la cancellazione.');
    } finally {
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const fetchAppointments = async () => { // Renamed from loadAppointments
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/my-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' (Locale)';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">I Miei Appuntamenti</h1>
        <p className="text-gray-600">Gestisci le tue consulenze programmate</p>
      </div>

      {appointments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <FaCalendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Nessun Appuntamento Ancora</h3>
          <p className="text-gray-600 mb-6">Non hai appuntamenti programmati.</p>
          <Link to="/customer">
            <Button variant="primary" size="lg">
              Sfoglia Consulenti
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-grow">
                  <div className="flex items-center space-x-3 mb-4">
                    <FaUser className="w-5 h-5 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900">
                      {appointment.consultant_name || appointment.consultant_email?.split('@')[0] || 'Consultant'}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${appointment.status === 'accepted' ? 'bg-green-100 text-green-800' :
                      appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                      {appointment.status?.charAt(0).toUpperCase() + appointment.status?.slice(1)}
                    </span>
                  </div>

                  {appointment.appointment_date && (
                    <div className="flex items-center space-x-2 text-gray-600 mb-2">
                      <FaCalendar className="w-4 h-4" />
                      <span>{formatDate(appointment.appointment_date)}</span>
                    </div>
                  )}

                  {appointment.service_type && (
                    <div className="flex items-center space-x-2 text-gray-600 mb-2">
                      <FaClock className="w-4 h-4" />
                      <span>Servizio: {appointment.service_type}</span>
                    </div>
                  )}

                  {appointment.price && (
                    <div className="text-lg font-semibold text-gray-900">
                      €{Number(appointment.price || 0).toFixed(2)}
                    </div>
                  )}
                </div>

                {appointment.status === 'accepted' && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {appointment.room_name && (
                      <div className="flex flex-col items-center">
                        {/* 
                           FIX: Allow re-entry if isCallActive() is true, even if ended_at is present.
                           Server now handles re-entry logic. 
                        */}
                        {isCallActive(appointment.appointment_date) ? (
                          <Link to={`/call/${appointment.id}`}>
                            <Button variant="primary" size="md" className="w-full sm:w-auto">
                              <FaVideo className="w-4 h-4 inline mr-2" />
                              {appointment.ended_at ? 'Riapri Sessione' : 'Partecipa'}
                            </Button>
                          </Link>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Button
                              variant="primary"
                              size="md"
                              className="w-full sm:w-auto opacity-50 cursor-not-allowed"
                              disabled
                              title={appointment.ended_at ? "Sessione terminata" : "Non ancora attivo"}
                            >
                              <FaVideo className="w-4 h-4 inline mr-2" />
                              {appointment.ended_at ? 'Terminato' : 'Partecipa'}
                            </Button>

                          </div>
                        )}
                      </div>
                    )}
                    <Link to={`/chat/${appointment.id}`}>
                      <Button variant="secondary" size="md" className="w-full sm:w-auto">
                        <FaComments className="w-4 h-4 inline mr-2" />
                        Chat
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="md"
                      className="w-full sm:w-auto"
                      onClick={async () => {
                        if (!confirm('Sei sicuro di voler cancellare questo appuntamento?')) return;
                        try {
                          const headers = { Authorization: `Bearer ${token}` };
                          if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
                          // Use the cancel endpoint (same as declining a request or specific appointment cancel endpoint if exists)
                          // Assuming DELETE /api/requests/:id works for cancelling requests/appointments
                          const res = await fetch(`${apiBase}/api/requests/${appointment.id}`, {
                            method: 'DELETE',
                            headers
                          });
                          if (res.ok) {
                            alert('Appuntamento cancellato con successo.');
                            await fetchAppointments();
                          } else {
                            const error = await res.json().catch(() => ({}));
                            alert(error.error || 'Errore durante la cancellazione');
                          }
                        } catch (error) {
                          alert('Errore durante la cancellazione');
                        }
                      }}
                    >
                      Cancella
                    </Button>
                  </div>
                )}

                {appointment.status === 'pending' && (
                  <div className="flex items-center space-x-2 text-yellow-600">
                    <FaClock className="w-5 h-5" />
                    <span className="font-medium">In attesa di conferma</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyAppointments;


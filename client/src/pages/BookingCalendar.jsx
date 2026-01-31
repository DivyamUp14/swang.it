import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FaPlus, FaTrash, FaCalendar, FaClock, FaVideo, FaPhone, FaComments } from 'react-icons/fa';
import ConsultantNav from '../components/layout/ConsultantNav';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { parseRomeDate, formatTimeInZone } from '../utils/dateUtils';

const BookingCalendar = () => {
  const { user, token, apiBase } = useAuth();
  const [slots, setSlots] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSlot, setNewSlot] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: 30,
    mode: 'video',
    price: 0
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSlots();
  }, []);

  const loadSlots = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${apiBase}/api/consultant/slots`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      }
    } catch (error) {
    }
  };

  const addSlot = async () => {
    if (isSubmitting) return;

    if (!newSlot.title || !newSlot.date || !newSlot.time) {
      alert('Compila tutti i campi obbligatori');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      // TIMEZONE FIX: Convert Local Input Time -> Rome Time (Server Standard)
      const localDate = new Date(`${newSlot.date}T${newSlot.time}`);

      // Get the parts in Rome Time
      const romeParts = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD format
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(localDate);

      // Reconstruct specific YYYY-MM-DD and HH:MM
      const getPart = (type) => romeParts.find(p => p.type === type)?.value;
      const romeDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
      const romeTime = `${getPart('hour')}:${getPart('minute')}`;

      const payload = {
        ...newSlot,
        date: romeDate,
        time: romeTime
      };

      const res = await fetch(`${apiBase}/api/consultant/slots`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await loadSlots();
        setNewSlot({
          title: '',
          description: '',
          date: '',
          time: '',
          duration: 30,
          mode: 'video',
          price: 0
        });
        setShowAddModal(false);
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Errore durante la creazione dello slot');
      }
    } catch (error) {
      alert('Errore durante la creazione dello slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteSlot = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questo slot?')) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${apiBase}/api/consultant/slots/${id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        await loadSlots();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Errore durante l\'eliminazione dello slot');
      }
    } catch (error) {
      alert('Errore durante l\'eliminazione dello slot');
    }
  };

  const getModeIcon = (mode) => {
    switch (mode) {
      case 'video': return <FaVideo className="w-4 h-4" />;
      case 'voice': return <FaPhone className="w-4 h-4" />;
      case 'chat': return <FaComments className="w-4 h-4" />;
      default: return <FaVideo className="w-4 h-4" />;
    }
  };

  const getModeColor = (mode) => {
    switch (mode) {
      case 'video': return 'bg-purple-100 text-purple-700';
      case 'voice': return 'bg-green-100 text-green-700';
      case 'chat': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendario Prenotazioni</h1>
            <p className="text-gray-600">Gestisci i tuoi slot temporali disponibili per sessioni programmate</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => setShowAddModal(true)}
          >
            <FaPlus className="w-5 h-5 inline mr-2" />
            Aggiungi Slot Temporale
          </Button>
        </div>

        {slots
          .filter(slot => {
            // FIX: Hide slots older than today (based on local user timezone)
            // convert Rome time to absolute Date object
            const slotDate = parseRomeDate(slot.date, slot.time);

            // Get start of today (Local Browser Time)
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            // Compare: Show if slot is today or future
            return slotDate >= startOfToday;
          })
          .length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <FaCalendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Nessuno Slot Disponibile</h3>
            <p className="text-gray-600 mb-6">Non hai slot futuri disponibili. Aggiungine uno nuovo.</p>
            <Button variant="primary" size="lg" onClick={() => setShowAddModal(true)}>
              Crea Primo Slot
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {slots
              .filter(slot => {
                const slotDate = parseRomeDate(slot.date, slot.time);
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                return slotDate >= startOfToday;
              })
              .map((slot) => (
                <div key={slot.id} className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{slot.title}</h3>
                      {slot.description && (
                        <p className="text-sm text-gray-600 mb-3">{slot.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteSlot(slot.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <FaTrash className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center space-x-2 text-gray-600">
                      <FaCalendar className="w-4 h-4" />
                      <span className="text-sm">
                        {parseRomeDate(slot.date, slot.time).toLocaleDateString(undefined, {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <FaClock className="w-4 h-4" />
                      <span className="text-sm">
                        {formatTimeInZone(parseRomeDate(slot.date, slot.time), user?.timezone)} ({slot.duration} min)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getModeColor(slot.mode)}`}>
                        {getModeIcon(slot.mode)}
                        <span className="ml-1 capitalize">{slot.mode}</span>
                      </span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      €{Number(slot.price || 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    Prenotazione confermata solo dopo il prepagamento
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Add Slot Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Aggiungi Nuovo Slot Temporale"
          className="max-w-2xl"
        >
          <div className="space-y-6">
            <Input
              label="Titolo Servizio"
              value={newSlot.title}
              onChange={(e) => setNewSlot({ ...newSlot, title: e.target.value })}
              placeholder="es. Sessione Lettura Tarocchi"
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Descrizione
              </label>
              <textarea
                value={newSlot.description}
                onChange={(e) => setNewSlot({ ...newSlot, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Descrivi cosa include questa sessione..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Data"
                type="date"
                value={newSlot.date}
                onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                required
              />
              <Input
                label="Ora"
                type="time"
                value={newSlot.time}
                onChange={(e) => setNewSlot({ ...newSlot, time: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Durata (minuti)
                </label>
                <select
                  value={newSlot.duration}
                  onChange={(e) => setNewSlot({ ...newSlot, duration: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Modalità
                </label>
                <select
                  value={newSlot.mode}
                  onChange={(e) => setNewSlot({ ...newSlot, mode: e.target.value })}
                  className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="video">Videochiamata</option>
                  <option value="voice">Chiamata Vocale</option>
                  <option value="chat">Chat</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Prezzo (€)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newSlot.price === 0 ? '' : newSlot.price}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string, otherwise parse as float
                    const numValue = value === '' ? 0 : parseFloat(value);
                    setNewSlot({ ...newSlot, price: isNaN(numValue) ? 0 : numValue });
                  }}
                  onBlur={(e) => {
                    // Ensure minimum value of 0 when field loses focus
                    if (!e.target.value || parseFloat(e.target.value) < 0) {
                      setNewSlot({ ...newSlot, price: 0 });
                    }
                  }}
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> Le prenotazioni saranno confermate solo dopo il prepagamento da parte del cliente.
                I link di riunione automatici e i promemoria email saranno inviati a entrambe le parti.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
              >
                Annulla
              </Button>
              <Button
                variant="primary"
                onClick={addSlot}
              >
                Aggiungi Slot
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default BookingCalendar;


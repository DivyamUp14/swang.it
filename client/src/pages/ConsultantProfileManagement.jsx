import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FaSave, FaUpload, FaUser, FaEdit } from 'react-icons/fa';
import ConsultantNav from '../components/layout/ConsultantNav';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { translateCategory } from '../utils/categoryTranslations';

const ConsultantProfileManagement = () => {
  const { user, token, apiBase } = useAuth();
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    experience: '',
    macro_category: 'coaching',
    micro_categories: [],
    chat_price: 0.10,
    voice_price: 1.50,
    video_price: 2.00,
    profile_photo: null,
    status: 'pending', // pending, active, inactive
    contract_agreed: false,
    address: '',
    tax_code: '',
    iban: '',
    real_name: '' // Added for private real name
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [availableMicroCategories, setAvailableMicroCategories] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    loadProfile();
    loadMicroCategories();
  }, [user?.email]);

  const loadMicroCategories = async () => {
    try {
      const res = await fetch(`${apiBase}/api/micro-categories`);
      if (res.ok) {
        const data = await res.json();
        setAvailableMicroCategories(data.categories || []);
      }
    } catch (error) {
      // Fallback to empty array if API fails
    }
  };

  const loadProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/consultant/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Load user data for email and phone if not in profile
        if (!data.email && user?.email) {
          data.email = user.email;
        }
        if (!data.phone && user?.phone) {
          data.phone = user.phone;
        }
        if (!data.name && user?.nickname) {
          data.name = user.nickname;
        }
        // Set real_name from user data if not in profile response
        if (!data.real_name && user?.full_name) {
          data.real_name = user.full_name;
        }
        setProfile(data);
      }
    } catch (error) {
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return null;

    const formData = new FormData();
    formData.append('profile_photo', file);

    const headers = { Authorization: `Bearer ${token}` };
    if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

    const res = await fetch(`${apiBase}/api/consultant/profile/photo`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      // Return the photo path (could be profile_photo_path or profile_photo)
      return data.profile_photo_path || data.profile_photo;
    } else {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Errore nel caricamento della foto');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // MANDATORY: Validate required fields
    if (!profile.name || !profile.name.trim()) {
      alert('Il nome completo è obbligatorio');
      return;
    }
    if (!profile.email || !profile.email.trim()) {
      alert('L\'email è obbligatoria');
      return;
    }
    if (!profile.phone || !profile.phone.trim()) {
      alert('Il numero di telefono è obbligatorio');
      return;
    }

    // NEW MANDATORY FIELDS
    if (!profile.iban || !profile.iban.trim()) {
      alert('L\'IBAN è obbligatorio');
      return;
    }
    if (!profile.profile_photo) {
      alert('La foto profilo è obbligatoria');
      return;
    }

    // HIGH PRIORITY: Contract acceptance is MANDATORY
    if (!profile.contract_agreed) {
      alert('Devi accettare il contratto di collaborazione per poter salvare il profilo.');
      return;
    }

    setSaving(true);
    setSuccess(false);
    try {
      // Photo is already uploaded when selected, so we just use the current profile_photo
      // Ensure pricing fields are valid numbers (not empty strings)
      const profileToSave = {
        ...profile,
        chat_price: profile.chat_price && profile.chat_price !== '' ? parseFloat(profile.chat_price) : 0.10,
        voice_price: profile.voice_price && profile.voice_price !== '' ? parseFloat(profile.voice_price) : 1.00,
        video_price: profile.video_price && profile.video_price !== '' ? parseFloat(profile.video_price) : 1.00
      };

      const res = await fetch(`${apiBase}/api/consultant/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileToSave)
      });
      if (res.ok) {
        setSuccess(true);
        setSelectedPhotoFile(null);
        // Don't clear photoPreview here - keep it so user sees the photo
        await loadProfile(); // Reload to get updated profile data
        alert('Profilo aggiornato con successo!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Errore durante il salvataggio del profilo');
      }
    } catch (error) {
      alert('Errore durante il salvataggio del profilo');
    } finally {
      setSaving(false);
    }
  };

  const toggleMicroCategory = (category) => {
    const current = profile.micro_categories || [];
    if (current.includes(category)) {
      setProfile({
        ...profile,
        micro_categories: current.filter(c => c !== category)
      });
    } else {
      if (current.length < 6) {
        setProfile({
          ...profile,
          micro_categories: [...current, category]
        });
      } else {
        alert('Massimo 6 micro-categorie consentite');
      }
    }
  };

  const availableMicroCategoriesForMacro = availableMicroCategories
    .filter(cat => cat.macro_category === profile.macro_category && !cat.is_archived)
    .map(cat => cat.name);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestione Profilo Pubblico</h1>
          <p className="text-gray-600">Aggiorna il tuo profilo pubblico e i prezzi</p>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            Profilo aggiornato con successo!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Profile Photo */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Foto Profilo *</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6 space-y-4 sm:space-y-0">
              <div className="flex-shrink-0 mx-auto sm:mx-0">
                <img
                  src={
                    photoPreview ||
                    (profile.profile_photo
                      ? (profile.profile_photo.startsWith('http')
                        ? profile.profile_photo
                        : `${apiBase}${profile.profile_photo}`)
                      : `https://ui-avatars.com/api/?name=${user.email}&background=random`)
                  }
                  alt="Profile"
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                  onError={(e) => {
                    // Fallback to avatar if image fails to load
                    e.target.src = `https://ui-avatars.com/api/?name=${user.email}&background=random`;
                  }}
                />
              </div>
              <div className="text-center sm:text-left">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      // Validate file size (max 5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        alert('La foto deve essere inferiore a 5MB');
                        return;
                      }
                      // Validate file type
                      if (!file.type.startsWith('image/')) {
                        alert('Per favore seleziona un file immagine');
                        return;
                      }

                      // Create preview immediately
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        setPhotoPreview(e.target.result);
                      };
                      reader.readAsDataURL(file);

                      // Upload photo immediately (don't wait for form submit)
                      setUploadingPhoto(true);
                      try {
                        const photoPath = await uploadPhoto(file);
                        if (photoPath) {
                          // Update profile state with new photo path
                          setProfile(prev => ({ ...prev, profile_photo: photoPath }));
                          setSelectedPhotoFile(null); // Clear selected file since it's uploaded
                          // Clear preview so it uses the server image
                          setPhotoPreview(null);
                          // Reload profile to get the updated photo from server
                          await loadProfile();
                        }
                      } catch (error) {
                        alert(error.message || 'Errore nel caricamento della foto');
                        // Clear preview on error
                        setPhotoPreview(null);
                      } finally {
                        setUploadingPhoto(false);
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="md"
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <FaUpload className="w-4 h-4 inline mr-2" />
                  {uploadingPhoto ? 'Caricamento...' : 'Carica Foto'}
                </Button>
                {uploadingPhoto && (
                  <p className="text-sm text-blue-600 mt-2">
                    Caricamento in corso...
                  </p>
                )}
                {!uploadingPhoto && profile.profile_photo && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ Foto caricata con successo
                  </p>
                )}
                {!uploadingPhoto && !profile.profile_photo && (
                  <p className="text-sm text-red-600 mt-2">
                    * Obbligatoria
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Basic Information - MANDATORY FIELDS */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Informazioni Base *</h2>
            <p className="text-sm text-gray-600 mb-4">I campi contrassegnati con * sono obbligatori</p>
            <div className="space-y-4">
              <Input
                label="Nickname (Nome Pubblico)"
                value={profile.name || ''}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Il tuo Nickname / Nome d'Arte"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Bio / Descrizione
                </label>
                <textarea
                  value={profile.bio || ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Raccontaci di te e della tua esperienza..."
                />
              </div>
              <Input
                label="Esperienza"
                value={profile.experience || ''}
                onChange={(e) => setProfile({ ...profile, experience: e.target.value })}
                placeholder="Anni di esperienza, certificazioni, ecc."
              />
            </div>
          </div>

          {/* Personal Data / Admin Only - SENSITIVE DATA */}
          <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-orange-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Dati Personali / Solo Admin *</h2>
            <p className="text-sm text-orange-600 mb-4">
              ⚠️ Questi dati sono visibili solo all'amministratore e non vengono mostrati ai clienti. I campi contrassegnati con * sono obbligatori.
            </p>
            <div className="space-y-4">
              <Input
                label="Nome e Cognome (Reale / Fatturazione)"
                value={profile.real_name || ''}
                onChange={(e) => setProfile({ ...profile, real_name: e.target.value })}
                placeholder="Il tuo vero nome e cognome per il contratto"
                required
              />
              <Input
                label="Email"
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="La tua email"
                required
              />
              <Input
                label="Numero di Telefono"
                type="tel"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="Il tuo numero di telefono"
                required
              />
              <Input
                label="Indirizzo Completo"
                value={profile.address || ''}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="Via, Città, CAP, Provincia, Paese"
              />
              <Input
                label="Codice Fiscale"
                value={profile.tax_code || ''}
                onChange={(e) => setProfile({ ...profile, tax_code: e.target.value.toUpperCase() })}
                placeholder="Inserisci il tuo codice fiscale"
                maxLength={16}
              />
              <Input
                label="IBAN"
                value={profile.iban || ''}
                onChange={(e) => setProfile({ ...profile, iban: e.target.value.toUpperCase().replace(/\s/g, '') })}
                placeholder="IT60 X054 2811 1010 0000 0123 456"
                maxLength={34}
                required
              />
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Categorie</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Macro-Categoria (Obbligatoria)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, macro_category: 'coaching', micro_categories: [] })}
                    className={`p-4 rounded-lg border-2 transition-all ${profile.macro_category === 'coaching'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <h3 className="font-semibold text-gray-900">Coaching & Psychology</h3>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, macro_category: 'cartomancy', micro_categories: [] })}
                    className={`p-4 rounded-lg border-2 transition-all ${profile.macro_category === 'cartomancy'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <h3 className="font-semibold text-gray-900">Cartomanzia & Astrologia</h3>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Micro-Categorie (Seleziona 1-6)
                  <span className="text-gray-500 ml-2">
                    ({profile.micro_categories?.length || 0}/6 selected)
                  </span>
                </label>
                <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {availableMicroCategoriesForMacro.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleMicroCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${profile.micro_categories?.includes(cat)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                      >
                        {translateCategory(cat)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Prezzi</h2>
            <p className="text-sm text-gray-600 mb-4">
              Imposta i tuoi prezzi per ogni tipo di servizio. I prezzi sono collegati alla detrazione crediti in tempo reale.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chat (per messaggio)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10"
                    value={profile.chat_price || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                      if (val === '' || !isNaN(val)) {
                        setProfile({ ...profile, chat_price: val });
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '' || parseFloat(e.target.value) < 0.01) {
                        setProfile({ ...profile, chat_price: 0.10 });
                      } else if (parseFloat(e.target.value) > 10) {
                        setProfile({ ...profile, chat_price: 10 });
                      }
                    }}
                    placeholder="0.10"
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Min €0.01, Max €10</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chiamata Vocale (al minuto)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="10"
                    value={profile.voice_price || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                      if (val === '' || !isNaN(val)) {
                        setProfile({ ...profile, voice_price: val });
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '' || parseFloat(e.target.value) < 1) {
                        setProfile({ ...profile, voice_price: 1 });
                      } else if (parseFloat(e.target.value) > 10) {
                        setProfile({ ...profile, voice_price: 10 });
                      }
                    }}
                    placeholder="1.00"
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Min €1, Max €10</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Videochiamata (al minuto)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="10"
                    value={profile.video_price || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                      if (val === '' || !isNaN(val)) {
                        setProfile({ ...profile, video_price: val });
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '' || parseFloat(e.target.value) < 1) {
                        setProfile({ ...profile, video_price: 1 });
                      } else if (parseFloat(e.target.value) > 10) {
                        setProfile({ ...profile, video_price: 10 });
                      }
                    }}
                    placeholder="1.00"
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Min €1, Max €10</p>
              </div>
            </div>
          </div>

          {/* Activation Status */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Stato Attivazione</h2>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Stato Profilo</span>
                <span className={`inline-flex justify-center px-3 py-1 rounded-full text-sm font-medium ${profile.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : profile.status === 'inactive'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                  }`}>
                  {profile.status === 'active'
                    ? 'Attivo'
                    : profile.status === 'inactive'
                      ? 'Inattivo'
                      : 'In Attesa di Approvazione'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <span className="font-medium text-gray-700">Accordo Contratto</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Prima di confermare, leggi attentamente il contratto di collaborazione.
                    Puoi aprirlo cliccando sul link qui sotto.
                  </p>
                  <a
                    href="/contratto-collaborazione-professionisti.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mt-2 underline"
                  >
                    Visualizza il contratto di collaborazione (PDF)
                  </a>
                </div>
                <label className="flex items-start sm:items-center space-x-2 cursor-pointer mt-3 sm:mt-0">
                  <input
                    type="checkbox"
                    checked={profile.contract_agreed || false}
                    onChange={(e) => setProfile({ ...profile, contract_agreed: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    required
                  />
                  <span className="text-sm text-gray-700">
                    <span className="text-red-600 font-semibold">*</span> Dichiaro di aver letto e accettato il contratto di collaborazione
                    <span className="block text-xs text-red-600 mt-1">(Obbligatorio)</span>
                  </span>
                </label>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Il tuo profilo sarà attivo dopo l'approvazione dell'amministratore e l'accordo sul contratto.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={saving}
              className="min-w-[200px]"
            >
              {saving ? (
                'Salvataggio...'
              ) : (
                <>
                  <FaSave className="w-5 h-5 inline mr-2" />
                  Aggiorna Profilo
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConsultantProfileManagement;


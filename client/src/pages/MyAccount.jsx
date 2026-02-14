import React, { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import {
  FaUser,
  FaLock,
  FaCreditCard,
  FaStar,
  FaHeart,
  FaTrash,
  FaEye,
  FaEyeSlash,
  FaEdit
} from 'react-icons/fa'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Modal from '../components/ui/Modal.jsx'

import { Country, City } from 'country-state-city';
import tz from 'tz-lookup';

export default function MyAccount() {
  const { user, token, apiBase, setUser } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1)

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Mock data - replace with API calls
  const [savedCard, setSavedCard] = useState(null)
  const [reviews, setReviews] = useState([])
  const [favorites, setFavorites] = useState([])
  const [showCityDropdown, setShowCityDropdown] = useState(false)

  // User profile data
  const [profileData, setProfileData] = useState({
    nickname: user?.nickname || '',
    fullName: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    country: user?.country || '',
    city: user?.city || '',
    timezone: user?.timezone || ''
  })

  // Track if we've initialized the form data from the user object
  const [isInitialized, setIsInitialized] = useState(false)

  // Update profileData AND initialize only once when user data becomes available
  // This prevents overwriting user input during background refreshes (e.g. auth polling)
  useEffect(() => {
    if (user && !isInitialized) {
      setProfileData({
        nickname: user?.nickname || '',
        fullName: user?.full_name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        country: user?.country || '',
        city: user?.city || '',
        timezone: user?.timezone || ''
      })
      setIsInitialized(true)
    }
  }, [user, isInitialized])

  // Helper to find country ISO code by name (for Country dropdown value)
  const getCountryCode = (name) => {
    if (!name) return '';
    const c = Country.getAllCountries().find(c => c.name === name);
    return c ? c.isoCode : '';
  }

  // Handle Country Change
  const handleCountryChange = (e) => {
    const isoCode = e.target.value;
    const countryObj = Country.getCountryByCode(isoCode);
    if (!countryObj) return;

    setProfileData(prev => ({
      ...prev,
      country: countryObj.name,
      city: '', // Reset city
      timezone: '' // Reset timezone (will be re-detected on city select)
    }));
  }

  // Handle City Change
  const handleCityChange = (e) => {
    const cityName = e.target.value;
    // We need country code to find city details (lat/lng)
    const countryCode = getCountryCode(profileData.country);

    // Find city object to get Lat/Lng
    // Note: City names might not be unique globally, but unique within Country usually?
    // City.getCitiesOfCountry returns array.
    const cities = City.getCitiesOfCountry(countryCode) || [];
    const cityObj = cities.find(c => c.name === cityName);

    let detectedTimezone = profileData.timezone;
    if (cityObj) {
      try {
        // Detect timezone from Lat/Lng
        const foundTz = tz(Number(cityObj.latitude), Number(cityObj.longitude));
        if (foundTz) detectedTimezone = foundTz;
      } catch (err) {
        console.error('Timezone detection failed:', err);
      }
    }

    setProfileData(prev => ({
      ...prev,
      city: cityName,
      timezone: detectedTimezone
    }));
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('Le nuove password non corrispondono')
      return
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

      const res = await fetch(`${apiBase}/api/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      if (res.ok) {
        alert('Password aggiornata con successo')
        setShowPasswordModal(false)
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      } else {
        const error = await res.json()
        alert(error.error || 'Errore nel cambio password')
      }
    } catch (error) {
      alert('Errore nel cambio password')
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2)
      return
    }

    try {
      const headers = {
        Authorization: `Bearer ${token}`
      }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

      const res = await fetch(`${apiBase}/api/account`, {
        method: 'DELETE',
        headers
      })

      if (res.ok) {
        alert('Account eliminato con successo')
        setUser(null)
        navigate('/')
      } else {
        const error = await res.json()
        alert(error.error || 'Errore durante l\'eliminazione dell\'account')
      }
    } catch (error) {
      alert('Errore durante l\'eliminazione dell\'account')
    }
  }

  // Helper to mask card number
  const maskCardNumber = (last4) => {
    return `•••• •••• •••• ${last4}`
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Il mio account</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="md:w-64 flex-shrink-0">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'profile'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <FaUser className={`mr-3 h-5 w-5 ${activeTab === 'profile' ? 'text-blue-500' : 'text-gray-400'}`} />
              Profilo
            </button>

            <button
              onClick={() => setActiveTab('password')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'password'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <FaLock className={`mr-3 h-5 w-5 ${activeTab === 'password' ? 'text-blue-500' : 'text-gray-400'}`} />
              Sicurezza
            </button>

            <button
              onClick={() => setActiveTab('payment')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'payment'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <FaCreditCard className={`mr-3 h-5 w-5 ${activeTab === 'payment' ? 'text-blue-500' : 'text-gray-400'}`} />
              Metodi di pagamento
            </button>

            <button
              onClick={() => setActiveTab('reviews')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'reviews'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <FaStar className={`mr-3 h-5 w-5 ${activeTab === 'reviews' ? 'text-blue-500' : 'text-gray-400'}`} />
              Le tue recensioni
            </button>

            <button
              onClick={() => setActiveTab('favorites')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'favorites'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <FaHeart className={`mr-3 h-5 w-5 ${activeTab === 'favorites' ? 'text-blue-500' : 'text-gray-400'}`} />
              Preferiti
            </button>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">INFORMAZIONI DI BASE</h2>

                  {user?.role === 'customer' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nickname (Pubblico) <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="text"
                          value={profileData.nickname}
                          onChange={(e) => setProfileData({ ...profileData, nickname: e.target.value })}
                          placeholder="Il tuo nickname visibile"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Questo è il nome che vedranno i consulenti.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Localizzazione</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Paese <span className="text-red-500">*</span>
                        </label>
                        <select
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                          value={getCountryCode(profileData.country)}
                          onChange={handleCountryChange}
                        >
                          <option value="">Seleziona Paese</option>
                          {Country.getAllCountries().map(c => (
                            <option key={c.isoCode} value={c.isoCode}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Città <span className="text-red-500">*</span>
                        </label>
                        {/* City Searchable Input */}
                        <div className="relative">
                          <Input
                            type="text"
                            className="!w-full !rounded-md !border-gray-300 !shadow-sm !focus:border-blue-500 !focus:ring-blue-500 !text-sm !p-2 !border"
                            value={profileData.city}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProfileData({ ...profileData, city: val });
                              // Reset timezone if city changes manually to something invalid, but we'll try to match exact first
                              // Actually, better to just let them type and we try to match on blur or selection
                            }}
                            onFocus={() => setShowCityDropdown(true)}
                            // We use a custom dropdown, so handle blur carefully (might need timeout to allow click)
                            onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                            placeholder={profileData.country ? "Inizia a digitare la città..." : "Seleziona prima il paese"}
                            disabled={!profileData.country}
                          />
                          {showCityDropdown && profileData.country && profileData.city && (
                            <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                              {City.getCitiesOfCountry(getCountryCode(profileData.country))
                                .filter(c => c.name.toLowerCase().includes(profileData.city.toLowerCase()))
                                .slice(0, 50) // Limit to 50 results
                                .map(c => (
                                  <div
                                    key={c.name}
                                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                    onClick={() => {
                                      setProfileData(prev => {
                                        let detectedTimezone = prev.timezone;
                                        try {
                                          const foundTz = tz(Number(c.latitude), Number(c.longitude));
                                          if (foundTz) detectedTimezone = foundTz;
                                        } catch (err) { }
                                        return { ...prev, city: c.name, timezone: detectedTimezone };
                                      });
                                      setShowCityDropdown(false);
                                    }}
                                  >
                                    {c.name}
                                  </div>
                                ))}
                              {City.getCitiesOfCountry(getCountryCode(profileData.country))
                                .filter(c => c.name.toLowerCase().includes(profileData.city.toLowerCase()))
                                .length === 0 && (
                                  <div className="px-4 py-2 text-sm text-gray-500">Nessuna città trovata</div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Dati reali</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nome completo
                        </label>
                        <Input
                          type="text"
                          value={profileData.fullName}
                          onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                          placeholder="Nome e cognome"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email
                        </label>
                        <Input
                          type="email"
                          value={profileData.email}
                          disabled
                          className="bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Numero di telefono
                        </label>
                        <Input
                          type="tel"
                          value={profileData.phone}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                          placeholder="+39 123 456 7890"
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button
                        variant="primary"
                        size="md"
                        onClick={async () => {
                          // NICKNAME IS MANDATORY for customers
                          if (user?.role === 'customer' && (!profileData.nickname || !profileData.nickname.trim())) {
                            alert('Il nickname è obbligatorio per garantire l\'anonimato')
                            return
                          }

                          if (!profileData.country || !profileData.city || !profileData.timezone) {
                            alert('Per favore seleziona Paese e Città per impostare il fuso orario corretto.');
                            return;
                          }

                          try {
                            const headers = {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${token}`
                            }
                            if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

                            const res = await fetch(`${apiBase}/api/profile`, {
                              method: 'PUT',
                              headers,
                              body: JSON.stringify({
                                nickname: profileData.nickname.trim(),
                                full_name: profileData.fullName.trim(),
                                phone: profileData.phone.trim(),
                                country: profileData.country,
                                city: profileData.city,
                                timezone: profileData.timezone
                              })
                            })

                            if (res.ok) {
                              const data = await res.json()
                              alert('Profilo aggiornato con successo')
                              if (data.user) {
                                setUser(data.user)
                              }
                            } else {
                              const error = await res.json().catch(() => ({}))
                              alert(error.error || 'Errore nell\'aggiornamento del profilo')
                            }
                          } catch (error) {
                            alert('Errore nell\'aggiornamento del profilo')
                          }
                        }}
                      >
                        Salva modifiche
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Modifica password</h2>
                  <p className="text-gray-600 mb-4">
                    Per motivi di sicurezza, ti chiediamo di inserire la password attuale prima di cambiarla.
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setShowPasswordModal(true)}
                  >
                    <FaLock className="inline mr-2" />
                    Cambia password
                  </Button>
                </div>
              </div>
            )}

            {/* Payment Method Tab */}
            {activeTab === 'payment' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Metodo di pagamento salvato</h2>
                  {savedCard ? (
                    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Carta salvata</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {maskCardNumber(savedCard.last4)}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Scade: {savedCard.expMonth}/{savedCard.expYear}
                          </p>
                        </div>
                        <Button variant="danger" size="sm">
                          Rimuovi carta
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 text-center">
                      <FaCreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-4">Nessuna carta salvata</p>
                      <p className="text-sm text-gray-500">
                        La prossima volta che effettui un acquisto, puoi salvare la carta per pagamenti futuri
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Le tue recensioni</h2>
                  {reviews.length > 0 ? (
                    <div className="space-y-4">
                      {reviews.map((review, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-grow">
                              <div className="flex items-center mb-2">
                                {[...Array(5)].map((_, i) => (
                                  <FaStar
                                    key={i}
                                    className={`w-4 h-4 ${i < review.rating
                                      ? 'text-yellow-400 fill-current'
                                      : 'text-gray-300'
                                      }`}
                                  />
                                ))}
                                <span className="ml-2 text-sm text-gray-600">
                                  {review.consultant_name || 'Consulente'}
                                </span>
                              </div>
                              <p className="text-gray-700">{review.comment}</p>
                              <p className="text-xs text-gray-500 mt-2">
                                {new Date(review.created_at).toLocaleDateString('it-IT')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-8 border border-gray-200 text-center">
                      <FaStar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Non hai ancora lasciato recensioni</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Favorites Tab */}
            {activeTab === 'favorites' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">I tuoi preferiti</h2>
                  {favorites.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {favorites.map((favorite, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">
                                {favorite.consultant_name || 'Consulente'}
                              </p>
                              <p className="text-sm text-gray-600">{favorite.email}</p>
                            </div>
                            <button className="text-red-500 hover:text-red-700">
                              <FaHeart className="w-5 h-5 fill-current" />
                            </button>
                          </div>
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full mt-3"
                            onClick={() => navigate(`/consultant/${favorite.consultant_id}`)}
                          >
                            Vedi profilo
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-8 border border-gray-200 text-center">
                      <FaHeart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Non hai ancora salvato consulenti nei preferiti</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Section: MOVED OUTSIDE FLEX-ROW */}
      <div className="bg-red-50 rounded-lg border border-red-200 p-6 mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              Elimina account
            </h3>
            <p className="text-sm text-red-700">
              Questa azione non può essere annullata. Tutti i tuoi dati verranno eliminati permanentemente.
            </p>
          </div>
          <Button
            variant="danger"
            size="md"
            onClick={() => setShowDeleteModal(true)}
          >
            <FaTrash className="inline mr-2" />
            Elimina account
          </Button>
        </div>
      </div>

      {/* Password Change Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false)
          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        }}
        title="Cambia password"
      >
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password attuale
            </label>
            <div className="relative">
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Inserisci la password attuale"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showCurrentPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nuova password
            </label>
            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Inserisci la nuova password"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showNewPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conferma nuova password
            </label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Conferma la nuova password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowPasswordModal(false)
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
              }}
            >
              Annulla
            </Button>
            <Button type="submit" variant="primary">
              Salva nuova password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeleteConfirmStep(1)
        }}
        title="Elimina account"
      >
        <div className="space-y-4">
          {deleteConfirmStep === 1 && (
            <>
              <p className="text-gray-700">
                Sei sicuro di voler eliminare il tuo account? Questa azione non può essere annullata.
              </p>
              <p className="text-sm text-gray-600">
                Tutti i tuoi dati, inclusi profilo, recensioni, preferiti e cronologia, verranno eliminati permanentemente.
              </p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirmStep(1)
                  }}
                >
                  Annulla
                </Button>
                <Button variant="danger" onClick={handleDeleteAccount}>
                  Continua
                </Button>
              </div>
            </>
          )}
          {deleteConfirmStep === 2 && (
            <>
              <p className="text-red-700 font-semibold">
                Attenzione: Questa è l'ultima conferma!
              </p>
              <p className="text-gray-700">
                Per confermare l'eliminazione definitiva, clicca su "Elimina definitivamente".
              </p>
              <p className="text-sm text-gray-600">
                Questa azione eliminerà permanentemente il tuo account e tutti i dati associati.
              </p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirmStep(1)
                  }}
                >
                  Annulla
                </Button>
                <Button variant="danger" onClick={handleDeleteAccount}>
                  Elimina definitivamente
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

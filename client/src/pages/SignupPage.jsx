import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { useAuth } from '../auth/AuthContext.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import logoImage from '../assets/images/logo.png'

export default function SignupPage() {
  const { signup, apiBase } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState('customer')
  const [invitationToken, setInvitationToken] = useState('')
  const [tokenValid, setTokenValid] = useState(null)
  const [tokenEmail, setTokenEmail] = useState('')
  const [validatingToken, setValidatingToken] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Check for token in URL and validate it
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      setInvitationToken(token)
      validateToken(token)
    }
  }, [searchParams])

  const validateToken = async (token) => {
    setValidatingToken(true)
    setError(null)
    try {
      const headers = {}
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/register/${token}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setTokenValid(true)
        setTokenEmail(data.email)
        setEmail(data.email) // Pre-fill email from token
        setRole('consultant') // Auto-select consultant role
      } else {
        const errorData = await res.json().catch(() => ({}))
        setTokenValid(false)
        setError(errorData.error || 'Token di invito non valido o scaduto')
      }
    } catch (error) {
      setTokenValid(false)
      setError('Errore nella validazione del token')
    } finally {
      setValidatingToken(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // MANDATORY: Validate required fields
    if (!fullName || !fullName.trim()) {
      setError('Il nome completo è obbligatorio')
      return
    }
    if (!phone || !phone.trim()) {
      setError('Il numero di telefono è obbligatorio')
      return
    }
    // NICKNAME IS MANDATORY: Required for anonymity in appointments
    if (!nickname || !nickname.trim()) {
      setError('Il nickname è obbligatorio per garantire l\'anonimato')
      return
    }

    // OPTIONAL TOKEN FOR CONSULTANT REGISTRATION
    // if (role === 'consultant') {
    //   if (!invitationToken || !invitationToken.trim()) {
    //     setError('Token di invito richiesto per registrarsi come consulente. Contatta l\'amministratore per ricevere un invito.')
    //     return
    //   }
    // }

    setLoading(true)
    try {
      const newUser = await signup(
        email,
        password,
        role,
        fullName.trim(),
        phone.trim(),
        nickname.trim(),
        role === 'consultant' ? invitationToken : null
      )
      // Navigate based on user role after signup
      if (newUser?.role === 'customer') {
        navigate('/customer')
      } else if (newUser?.role === 'consultant') {
        navigate('/consultant')
      } else {
        navigate('/')
      }
    } catch (e) {
      setError(e.message || 'Registrazione fallita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-lg">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <img
              src={logoImage}
              alt="Swang.it Logo"
              className="h-16 w-auto object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold text-blue-600 mb-2">
            Registrati e approfitta di 5 minuti di consultazione gratuita
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            per trovare risposte alle tue domande
          </p>
          <div className="space-y-2 text-sm text-gray-700 text-left mb-6">
            <div className="flex items-start space-x-2">
              <HiArrowRight className="w-5 h-5 text-black mt-0.5" />
              <span>Nessuna carta di credito richiesta</span>
            </div>
            <div className="flex items-start space-x-2">
              <HiArrowRight className="w-5 h-5 text-black mt-0.5" />
              <span>Consultazioni confidenziali</span>
            </div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <Input
            label="Nome Completo"
            type="text"
            placeholder="Inserisci il tuo nome completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label="Nickname"
            type="text"
            placeholder="Scegli un nickname (per l'anonimato)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
          <p className="text-xs text-gray-500 -mt-4">
            Questo nome verrà mostrato ai consulenti al posto del tuo nome reale per garantire l'anonimato
          </p>
          <Input
            label="Indirizzo Email"
            type="email"
            placeholder="Inserisci la tua email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!!invitationToken && tokenValid === true}
          />
          {invitationToken && tokenValid === true && (
            <p className="text-xs text-gray-500 -mt-4">
              L'email è precompilata dal tuo invito e non può essere modificata
            </p>
          )}
          <Input
            label="Numero di Telefono"
            type="tel"
            placeholder="Inserisci il tuo numero di telefono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Inserisci la tua password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {validatingToken && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
              Validazione token in corso...
            </div>
          )}
          {invitationToken && tokenValid === false && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error || 'Token di invito non valido o scaduto. Contatta l\'amministratore per un nuovo invito.'}
            </div>
          )}
          {invitationToken && tokenValid === true && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              ✓ Token di invito valido. Puoi completare la registrazione come consulente.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Sono un
            </label>
            <select
              value={role}
              onChange={(e) => {
                const newRole = e.target.value
                setRole(newRole)
                // Token no longer mandatory
                setError(null)
              }}
              className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!!invitationToken && tokenValid === true} // Disable if valid token forces consultant role
            >
              <option value="customer">Cliente</option>
              <option value="consultant">Consulente</option>
            </select>
            {role === 'consultant' && !invitationToken && (
              <p className="text-xs text-blue-600 mt-1">
                ℹ️ La tua registrazione come consulente richiederà l'approvazione dell'amministratore prima di essere attiva.
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={loading || !email || !password || !fullName || !phone || !nickname}
          >
            {loading ? 'CREAZIONE ACCOUNT...' : 'CREA ACCOUNT'}
          </Button>
        </form>
        <div className="text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            Ho già un account, connettimi
          </Link>
        </div>
        <div className="text-xs text-gray-500 text-center">
          Continuando, accetti i nostri{' '}
          <Link to="/terms" className="text-blue-600 hover:underline">Termini di Servizio</Link>
          {' '}e la nostra{' '}
          <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}



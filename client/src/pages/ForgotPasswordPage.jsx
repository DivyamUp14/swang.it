import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import logoImage from '../assets/images/logo.png'

export default function ForgotPasswordPage() {
  const { apiBase } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)
    
    try {
      const headers = { 'Content-Type': 'application/json' }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      
      const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || 'Si è verificato un errore')
      }
    } catch (e) {
      setError('Si è verificato un errore. Riprova più tardi.')
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
          <h2 className="text-3xl font-bold text-gray-900">Password dimenticata?</h2>
          <p className="mt-2 text-sm text-gray-600">
            Inserisci la tua email e ti invieremo un link per reimpostare la password
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">Email inviata con successo!</p>
              <p className="mt-1">
                Se un account con questa email esiste, ti abbiamo inviato un link per reimpostare la password.
                Controlla la tua casella di posta (e la cartella spam) e clicca sul link per reimpostare la password.
              </p>
              <p className="mt-2 text-xs">
                Il link scade tra 1 ora per motivi di sicurezza.
              </p>
            </div>
            <Link to="/login">
              <Button variant="primary" size="lg" className="w-full">
                Torna al login
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <Input
              label="Indirizzo Email"
              type="email"
              placeholder="Inserisci la tua email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'INVIO IN CORSO...' : 'INVIA LINK RESET'}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            Torna al login
          </Link>
        </div>
      </div>
    </div>
  )
}


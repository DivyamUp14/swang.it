import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import logoImage from '../assets/images/logo.png'

export default function ResetPasswordPage() {
  const { apiBase } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Token di reset non valido. Richiedi un nuovo link di reset password.')
    }
  }, [token])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!token) {
      setError('Token di reset non valido')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Le password non corrispondono')
      return
    }

    if (newPassword.length < 6) {
      setError('La password deve essere di almeno 6 caratteri')
      return
    }

    setLoading(true)
    
    try {
      const headers = { 'Content-Type': 'application/json' }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      
      const res = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token, newPassword })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          navigate('/login')
        }, 3000)
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
          <h2 className="text-3xl font-bold text-gray-900">Reimposta Password</h2>
          <p className="mt-2 text-sm text-gray-600">
            Inserisci la tua nuova password
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">Password reimpostata con successo!</p>
              <p className="mt-1">
                La tua password è stata aggiornata. Verrai reindirizzato al login tra pochi secondi.
              </p>
            </div>
            <Link to="/login">
              <Button variant="primary" size="lg" className="w-full">
                Vai al login
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
              label="Nuova Password"
              type="password"
              placeholder="Inserisci la nuova password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <Input
              label="Conferma Password"
              type="password"
              placeholder="Conferma la nuova password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading || !token}
            >
              {loading ? 'REIMPOSTAZIONE IN CORSO...' : 'REIMPOSTA PASSWORD'}
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


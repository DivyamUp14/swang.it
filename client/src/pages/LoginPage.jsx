import React, { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import logoImage from '../assets/images/logo.png'

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const loggedInUser = await login(email, password)

      // Check if there's a return url in location state
      if (location.state?.from?.pathname) {
        navigate(location.state.from.pathname);
        return;
      }

      // Navigate based on user role immediately
      if (loggedInUser?.role === 'customer') {
        navigate('/customer')
      } else if (loggedInUser?.role === 'consultant') {
        navigate('/consultant')
      } else {
        navigate('/')
      }
    } catch (e) {
      setError('Email o password non validi')
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
          <h2 className="text-3xl font-bold text-gray-900">ACCEDI</h2>
        </div>
        <form onSubmit={onSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <Input
            label="Indirizzo Email o Telefono"
            type="text"
            placeholder="Inserisci la tua email o telefono"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Ricordami</span>
            </label>
            <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
              Password dimenticata?
            </Link>
          </div>
          <Button
            type="submit"
            variant="danger"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'ACCESSO IN CORSO...' : 'ACCEDI'}
          </Button>
        </form>
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Non sei ancora registrato?{' '}
            <Link to="/signup" className="text-blue-600 hover:underline font-medium">
              REGISTRATI
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}



import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

// If VITE_API_BASE is empty or '/', use relative paths (will go through Vite proxy)
// Otherwise use the configured base URL
const apiBaseEnv = import.meta.env.VITE_API_BASE
const API_BASE = !apiBaseEnv || apiBaseEnv === '/' || apiBaseEnv === ''
  ? ''  // Relative path - will use current origin (works with ngrok)
  : apiBaseEnv || 'http://localhost:4000'

function withNgrok(headers = {}) {
  // ngrok shows an interstitial page unless this header is sent
  if ((API_BASE || '').includes('ngrok')) {
    return { 'ngrok-skip-browser-warning': 'true', ...headers }
  }
  return headers
}

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const fetchMe = useCallback(async (t) => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, { headers: withNgrok({ Authorization: `Bearer ${t}` }) })

      // Handle Unauthorized (401) - Token invalid/expired
      if (res.status === 401) {
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        throw new Error('unauth')
      }

      // Handle Rate Limit (429) - Don't logout, just skip update
      if (res.status === 429) {
        console.warn('Rate limit on fetchMe, skipping update')
        return
      }

      if (!res.ok) throw new Error('Request failed')

      const ctype = res.headers.get('content-type') || ''
      if (!ctype.includes('application/json')) {
        throw new Error('invalid_json')
      }
      const data = await res.json()
      setUser(data.user)
      setPendingCount(data.pendingCount || 0)
    } catch (e) {
      if (e.message !== 'unauth') {
        // Only reset user if it's not a temporary error, or maybe we shouldn't reset user on network error?
        // Existing behavior was setUser(null), but that causes logout on network glitch. 
        // Safest is to only set null onAuth error. 
        // But if we return early on 429, we are good.
        // Let's keep existing behavior for other errors for now to be safe, or maybe just log?
        // If we set user null on network error, the app thinks we are logged out.
        // Better to NOT set user null on random fetch errors if we already have a user.
        console.warn('fetchMe failed:', e)
        // setUser(null) // removing this to prevent logout in case of transient errors
      }
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      if (token) {
        await fetchMe(token)
      } else {
        setUser(null)
      }
      setLoading(false)
    }
    init()

    // Set up periodic refresh for credits (every 5 seconds)
    let refreshInterval = null
    if (token) {
      refreshInterval = setInterval(() => {
        fetchMe(token).catch(() => { }) // Silently fail if refresh fails
      }, 30000) // Refresh every 30 seconds
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]) // Removed fetchMe to prevent excessive calls

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, { method: 'POST', headers: withNgrok({ 'Content-Type': 'application/json' }), body: JSON.stringify({ email, password }) })
    if (!res.ok) throw new Error('Login failed')
    const data = await res.json()
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user // Return user for immediate use
  }

  const signup = async (email, password, role, full_name, phone, nickname, invitation_token = null) => {
    const body = { email, password, role, full_name, phone, nickname }
    if (invitation_token) {
      body.invitation_token = invitation_token
    }
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: withNgrok({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.error || 'Signup failed')
    }
    const data = await res.json()
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user // Return user for immediate use
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('lastLocationPrompt') // Clear prompt history so it shows on next login
    setToken(null)
    setUser(null)
  }

  const value = { token, user, loading, pendingCount, setUser, login, signup, logout, apiBase: API_BASE, refreshUser: () => token && fetchMe(token) }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}



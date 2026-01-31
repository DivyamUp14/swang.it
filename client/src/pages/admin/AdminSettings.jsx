import React, { useState, useEffect } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import { FaKey, FaUser, FaLock, FaTools, FaDatabase, FaEnvelope } from 'react-icons/fa'

export default function AdminSettings() {
  const { user, token, apiBase } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [platformVisible, setPlatformVisible] = useState(false)
  const [backupStatus, setBackupStatus] = useState(null)
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastRole, setBroadcastRole] = useState('all')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadMaintenanceMode()
    loadPlatformVisibility()
    loadBackupStatus()
  }, [])

  const loadMaintenanceMode = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/maintenance-mode`, { headers })
      if (res.ok) {
        const data = await res.json()
        setMaintenanceMode(data.maintenance_mode)
      }
    } catch (error) {
    }
  }

  const loadPlatformVisibility = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/platform-visibility`, { headers })
      if (res.ok) {
        const data = await res.json()
        setPlatformVisible(data.platform_visible)
      }
    } catch (error) {
    }
  }

  const loadBackupStatus = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/backup-status`, { headers })
      if (res.ok) {
        const data = await res.json()
        setBackupStatus(data)
      }
    } catch (error) {
    }
  }

  const toggleMaintenanceMode = async () => {
    if (!window.confirm(`Are you sure you want to ${maintenanceMode ? 'disable' : 'enable'} maintenance mode?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/maintenance-mode`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ enabled: !maintenanceMode })
      })
      if (res.ok) {
        setMaintenanceMode(!maintenanceMode)
        alert(`Maintenance mode ${!maintenanceMode ? 'enabled' : 'disabled'}`)
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to update maintenance mode')
      }
    } catch (error) {
      alert('Error updating maintenance mode')
    }
  }

  const togglePlatformVisibility = async () => {
    const action = platformVisible ? 'nascondere' : 'rendere visibile'
    if (!window.confirm(`Sei sicuro di voler ${action} la piattaforma?`)) return

    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/platform-visibility`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ visible: !platformVisible })
      })
      if (res.ok) {
        setPlatformVisible(!platformVisible)
        alert(`Piattaforma ${!platformVisible ? 'ora è visibile' : 'ora è nascosta'}`)
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Errore nell\'aggiornamento della visibilità')
      }
    } catch (error) {
      alert('Errore nell\'aggiornamento della visibilità')
    }
  }

  const triggerBackup = async () => {
    if (!window.confirm('Are you sure you want to create a manual backup?')) return

    try {
      const headers = { Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/backup`, {
        method: 'POST',
        headers
      })
      if (res.ok) {
        alert('Backup created successfully')
        loadBackupStatus()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to create backup')
      }
    } catch (error) {
      alert('Error creating backup')
    }
  }

  const sendBroadcast = async (e) => {
    e.preventDefault()
    if (!broadcastSubject || !broadcastMessage) {
      alert('Subject and message are required')
      return
    }

    if (!window.confirm('Are you sure you want to send this broadcast email to all users?')) return

    setSending(true)
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'
      const res = await fetch(`${apiBase}/api/admin/broadcast-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subject: broadcastSubject, message: broadcastMessage, target_role: broadcastRole })
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Broadcast email sent to ${data.recipients} users`)
        setBroadcastSubject('')
        setBroadcastMessage('')
        setBroadcastRole('all')
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || 'Failed to send broadcast email')
      }
    } catch (error) {
      alert('Error sending broadcast email')
    } finally {
      setSending(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields' })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters long' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (currentPassword === newPassword) {
      setMessage({ type: 'error', text: 'New password must be different from current password' })
      return
    }

    setChanging(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true'

      const res = await fetch(`${apiBase}/api/auth/change-password`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const error = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: error.error || 'Failed to change password' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error changing password. Please try again.' })
    } finally {
      setChanging(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-gray-600 mt-2">Manage your admin account settings</p>
      </div>

      <div className="max-w-2xl">
        {/* Account Info */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaUser className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Account Information</h2>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <p className="mt-1 text-sm text-gray-900 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-6">
            <FaKey className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Change Password</h2>
          </div>

          {message.text && (
            <div
              className={`mb-4 p-4 rounded-lg ${message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
                }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Password must be at least 6 characters long</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={changing}
                className="w-full sm:w-auto"
              >
                {changing ? 'Changing Password...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </div>

        {/* Platform Visibility */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaTools className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Visibilità Piattaforma</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                {platformVisible ? 'La piattaforma è attualmente visibile al pubblico' : 'La piattaforma è attualmente nascosta al pubblico'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Quando nascosta, solo gli utenti con invito possono registrarsi. I consulenti approvati saranno visibili quando la piattaforma diventa pubblica.
              </p>
            </div>
            <Button
              variant={platformVisible ? "danger" : "primary"}
              onClick={togglePlatformVisibility}
            >
              {platformVisible ? 'Nascondi' : 'Rendi Visibile'}
            </Button>
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaTools className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Maintenance Mode</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                {maintenanceMode ? 'Maintenance mode is currently enabled' : 'Maintenance mode is currently disabled'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, only admins can access the system
              </p>
            </div>
            <Button
              variant={maintenanceMode ? "danger" : "primary"}
              onClick={toggleMaintenanceMode}
            >
              {maintenanceMode ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>

        {/* Backup Status */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaDatabase className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Backup Status</h2>
          </div>
          {backupStatus && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Last Backup</p>
                <p className="text-sm text-gray-900">
                  {backupStatus.last_backup_time ? new Date(backupStatus.last_backup_time).toLocaleString() : 'Never'}
                </p>
              </div>
              {backupStatus.database_size && (
                <div>
                  <p className="text-sm text-gray-600">Database Size</p>
                  <p className="text-sm text-gray-900">
                    {Number((backupStatus.database_size || 0) / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
              <Button onClick={triggerBackup} variant="primary">
                Create Manual Backup
              </Button>
            </div>
          )}
        </div>

        {/* Broadcast Email */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaEnvelope className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Broadcast Email</h2>
          </div>
          <form onSubmit={sendBroadcast} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <select
                value={broadcastRole}
                onChange={(e) => setBroadcastRole(e.target.value)}
                className="w-full border border-gray-300 rounded px-4 py-2"
              >
                <option value="all">All Users</option>
                <option value="customer">Customers Only</option>
                <option value="consultant">Consultants Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <Input
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder="Email subject"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Email message"
                className="w-full border border-gray-300 rounded px-4 py-2"
                rows={6}
                required
              />
            </div>
            <Button type="submit" variant="primary" disabled={sending}>
              {sending ? 'Sending...' : 'Send Broadcast Email'}
            </Button>
          </form>
        </div>
      </div>
    </div >
  )
}


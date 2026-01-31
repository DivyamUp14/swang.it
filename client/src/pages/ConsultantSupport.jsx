import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FaBell, FaEnvelope, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import ConsultantNav from '../components/layout/ConsultantNav';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const ConsultantSupport = () => {
  const { user } = useAuth();
  const [reportForm, setReportForm] = useState({
    subject: '',
    description: ''
  });

  const announcements = [
    {
      id: 1,
      type: 'approval',
      title: 'Profile Approved!',
      message: 'Your consultant profile has been approved and is now live.',
      date: '2025-01-03',
      read: false
    },
    {
      id: 2,
      type: 'update',
      title: 'New Feature: Booking Calendar',
      message: 'You can now offer scheduled appointments to your clients.',
      date: '2025-01-01',
      read: true
    }
  ];

  const [sending, setSending] = useState(false);

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { apiBase, token, commonHeaders } = JSON.parse(localStorage.getItem('vcapp_config') || '{}');
      if (!apiBase || !token) {
        // Fallback or error if context missing (though it should be there)
        console.warn('Missing API config');
      }

      // We need to fetch config from context or store usually, but let's try assuming standard fetch wrapper or just fetch
      // Since this component uses `useAuth`, we might need to get token from there or local storage. 
      // The snippet assumes `user` is from `useAuth`. Let's get the token from localStorage directly as is common in this app
      const storedToken = localStorage.getItem('token');
      const api = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

      const res = await fetch(`${api}/api/support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${storedToken}`
        },
        body: JSON.stringify(reportForm)
      });

      if (res.ok) {
        alert('Problem report submitted. We will get back to you soon.');
        setReportForm({ subject: '', description: '' });
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to submit report'}`);
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support & Notifications</h1>
          <p className="text-gray-600">Stay updated with announcements and report issues</p>
        </div>

        {/* Notifications/Announcements */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
              <FaBell className="w-6 h-6" />
              <span>Official Announcements</span>
            </h2>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {announcements.filter(a => !a.read).length} new
            </span>
          </div>

          <div className="space-y-4">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className={`border rounded-lg p-4 ${!announcement.read
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white'
                  }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      {announcement.type === 'approval' && (
                        <FaCheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      {announcement.type === 'update' && (
                        <FaBell className="w-5 h-5 text-blue-600" />
                      )}
                      <h3 className="font-semibold text-gray-900">{announcement.title}</h3>
                      {!announcement.read && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">New</span>
                      )}
                    </div>
                    <p className="text-gray-700 mb-2">{announcement.message}</p>
                    <span className="text-sm text-gray-500">{announcement.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Problem Reporting */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
            <FaExclamationTriangle className="w-6 h-6 text-orange-600" />
            <span>Report a Problem</span>
          </h2>
          <form onSubmit={handleSubmitReport} className="space-y-6">
            <Input
              label="Subject"
              value={reportForm.subject}
              onChange={(e) => setReportForm({ ...reportForm, subject: e.target.value })}
              placeholder="Brief description of the issue"
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description
              </label>
              <textarea
                value={reportForm.description}
                onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                rows={6}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Please provide detailed information about the issue..."
                required
              />
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <FaEnvelope className="w-4 h-4" />
              <span>Or contact us directly at:</span>
              <a href="mailto:servizioclienti@swang.it" className="text-blue-600 hover:underline">
                servizioclienti@swang.it
              </a>
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={sending}>
              {sending ? 'Sending...' : 'Submit Report'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConsultantSupport;


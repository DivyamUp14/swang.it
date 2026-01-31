import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FaHome, 
  FaUser, 
  FaCalendar, 
  FaVideo, 
  FaMoneyBillWave, 
  FaStar, 
  FaQuestionCircle 
} from 'react-icons/fa';

const ConsultantNav = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: '/consultant', label: 'Dashboard', icon: FaHome },
    { path: '/consultant/profile/edit', label: 'Profilo Pubblico', icon: FaUser },
    { path: '/consultant/calendar', label: 'Calendario', icon: FaCalendar },
    { path: '/consultant', label: 'Chiamate / Chat', icon: FaVideo },
    { path: '/consultant/earnings', label: 'Guadagni e Fatture', icon: FaMoneyBillWave },
    { path: '/consultant/reviews', label: 'Recensioni', icon: FaStar },
    { path: '/consultant/support', label: 'Supporto', icon: FaQuestionCircle },
  ];

  const isActive = (path) => {
    if (path === '/consultant') {
      return location.pathname === '/consultant';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="md:w-64 md:flex-shrink-0">
      <div className="md:hidden px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Menu Consulente</h2>
        <button
          onClick={() => setMobileOpen(prev => !prev)}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          {mobileOpen ? 'Chiudi' : 'Apri'}
        </button>
      </div>

      <div
        className={`bg-white border-b border-gray-200 md:border-b-0 md:border-r md:min-h-screen md:p-6 ${mobileOpen ? 'block' : 'hidden md:block'}`}
      >
        <h2 className="hidden md:block text-lg font-bold text-gray-900 mb-6">Menu Consulente</h2>
        <nav className="space-y-2 px-4 py-4 md:px-0 md:py-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default ConsultantNav;


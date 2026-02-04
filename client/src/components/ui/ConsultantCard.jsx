import React from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaPhone, FaHeart, FaVideo, FaComments, FaCalendar } from 'react-icons/fa';
import { useAuth } from '../../auth/AuthContext';
import { translateCategory } from '../../utils/categoryTranslations';
import Button from './Button';

const ConsultantCard = ({ consultant, requestStatus, onSendRequest, onFavorite, onMicroCategoryClick, isFavorite: externalIsFavorite }) => {
  const { apiBase, user } = useAuth();
  const isOnline = consultant.is_online || false;
  const isBusy = consultant.is_busy || false;
  const rating = consultant.rating || 0;
  const reviewCount = consultant.review_count || 0;
  // Get minimum price from available services
  const prices = [
    consultant.video_price || 2.00,
    consultant.voice_price || 1.50,
    consultant.chat_price || 0.10
  ].filter(p => p > 0);
  const pricePerMin = prices.length > 0 ? Math.min(...prices) : 1.50;
  const microCategories = Array.isArray(consultant.micro_categories) ? consultant.micro_categories : [];
  const consultantName = consultant.name || consultant.email?.split('@')[0] || 'Consultant';
  const isFavorite = externalIsFavorite !== undefined ? externalIsFavorite : false;

  const getProfilePhotoUrl = (photo) => {
    if (!photo) return `https://ui-avatars.com/api/?name=${consultant?.email || 'User'}&background=random`;
    if (photo.startsWith('http')) return photo;
    return `${apiBase || ''}${photo}`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-start space-x-4">
        {/* Profile Photo - Clickable */}
        <Link to={`/consultant/${consultant.id}`} className="flex-shrink-0">
          <div className="relative">
            <img
              src={getProfilePhotoUrl(consultant.profile_photo)}
              alt={consultant.email}
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
            />
            {isBusy ? (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-orange-500 rounded-full border-2 border-white whitespace-nowrap" title="In consultazione"></span>
            ) : isOnline && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" title="Disponibile"></span>
            )}
          </div>
        </Link>

        {/* Consultant Info */}
        <div className="flex-grow">
          <div className="flex items-start justify-between mb-2">
            <div>
              <Link to={`/consultant/${consultant.id}`}>
                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer">
                  {consultantName}
                </h3>
              </Link>
              <div className="flex items-center space-x-2 mt-1">
                <FaStar className="text-yellow-500" />
                <span className="text-sm font-medium text-gray-700">{Number(rating || 0).toFixed(2)}</span>
                <span className="text-sm text-gray-500">({reviewCount} {reviewCount === 1 ? 'recensione' : 'recensioni'})</span>
                {isBusy && (
                  <span className="px-2 whitespace-nowrap py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                    In consultazione
                  </span>
                )}
              </div>
            </div>
            {user && user.role === 'customer' && (
              <button
                onClick={() => onFavorite && onFavorite(consultant.id)}
                className={`transition-colors ${isFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                aria-label="Aggiungi ai preferiti"
              >
                <FaHeart className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Micro Categories */}
          {microCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {microCategories.slice(0, 3).map((cat, idx) => (
                <button
                  key={idx}
                  onClick={() => onMicroCategoryClick && onMicroCategoryClick(cat)}
                  className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors cursor-pointer"
                >
                  {translateCategory(cat)}
                </button>
              ))}
            </div>
          )}

          {/* Pricing */}
          <div className="mb-3">
            <span className="text-sm text-gray-600">A partire da </span>
            <span className="text-lg font-bold text-blue-600">€{Number(pricePerMin || 0).toFixed(2)}/min</span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!user ? (
              // Non-logged-in users: Show registration prompt
              <>
                <Link to="/signup">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                  >
                    Registrati per Contattare
                  </Button>
                </Link>
                <Link to={`/consultant/${consultant.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    title="Vedi Profilo"
                  >
                    <FaCalendar className="w-4 h-4" />
                  </Button>
                </Link>
              </>
            ) : user.role === 'customer' ? (
              // Logged-in customers: Always show all action buttons consistently
              <>
                {/* Voice Call Button - Always visible */}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSendRequest && onSendRequest(consultant.id, 'voice')}
                  disabled={!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')}
                  className={(!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')) ? 'opacity-50 cursor-not-allowed' : ''}
                  title={requestStatus && requestStatus.status === 'pending' ? 'Richiesta in attesa' : 'Chiamata Vocale'}
                >
                  <FaPhone className="w-4 h-4" />
                </Button>

                {/* Video Call Button - Always visible */}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSendRequest && onSendRequest(consultant.id, 'video')}
                  disabled={!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')}
                  className={(!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')) ? 'opacity-50 cursor-not-allowed' : ''}
                  title={requestStatus && requestStatus.status === 'pending' ? 'Richiesta in attesa' : 'Videochiamata'}
                >
                  <FaVideo className="w-4 h-4" />
                </Button>

                {/* Chat Button - Disabled when consultant is offline */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSendRequest && onSendRequest(consultant.id, 'chat')}
                  disabled={!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')}
                  className={(!isOnline || isBusy || (requestStatus && requestStatus.status === 'pending')) ? 'opacity-50 cursor-not-allowed' : ''}
                  title={!isOnline ? 'Consulente offline' : (requestStatus && requestStatus.status === 'pending' ? 'Richiesta in attesa' : 'Chat')}
                >
                  <FaComments className="w-4 h-4" />
                </Button>

                {/* Calendar/Profile Button - Always visible */}
                <Link to={`/consultant/${consultant.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    title="Vedi Profilo e Prenota"
                  >
                    <FaCalendar className="w-4 h-4" />
                  </Button>
                </Link>
              </>
            ) : (
              // Other logged-in users (consultants, etc.): Just show profile link
              <Link to={`/consultant/${consultant.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  title="Vedi Profilo"
                >
                  <FaCalendar className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsultantCard;


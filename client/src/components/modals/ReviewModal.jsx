import React, { useState } from 'react';
import { FaStar, FaTimes } from 'react-icons/fa';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../auth/AuthContext';

const ReviewModal = ({ isOpen, onClose, consultantId, requestId, consultantName, onSubmitted }) => {
  const { token, apiBase } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating || rating < 1) {
      setError('Per favore seleziona una valutazione');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      const res = await fetch(`${apiBase}/api/reviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          consultantId,
          requestId,
          rating,
          comment: comment.trim() || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Errore nell\'invio della recensione');
      }

      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Errore nell\'invio della recensione');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setRating(0);
      setComment('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Lascia una Recensione">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className="text-gray-700 mb-4">
            Come valuti la consulenza con <strong>{consultantName || 'il consulente'}</strong>?
          </p>
          
          {/* Star Rating */}
          <div className="flex justify-center space-x-2 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="focus:outline-none transition-transform hover:scale-110"
                disabled={submitting}
              >
                <FaStar
                  className={`w-10 h-10 transition-colors ${
                    star <= (hoveredRating || rating)
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600">
            {rating === 0 && 'Seleziona una valutazione'}
            {rating === 1 && 'Molto Insoddisfatto'}
            {rating === 2 && 'Insoddisfatto'}
            {rating === 3 && 'Neutro'}
            {rating === 4 && 'Soddisfatto'}
            {rating === 5 && 'Molto Soddisfatto'}
          </p>
        </div>

        {/* Comment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Commento (opzionale)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Condividi la tua esperienza..."
            disabled={submitting}
            maxLength={500}
          />
          <p className="text-xs text-gray-500 mt-1">{comment.length}/500 caratteri</p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Salta
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || rating < 1}
          >
            {submitting ? 'Invio in corso...' : 'Invia Recensione'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ReviewModal;

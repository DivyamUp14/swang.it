import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import ConsultantNav from '../components/layout/ConsultantNav';
import { FaStar, FaReply } from 'react-icons/fa';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';

const ConsultantReviews = () => {
  const { user, token, apiBase } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyModal, setReplyModal] = useState({ open: false, reviewId: null, reply: '' });

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    if (!token || !user || user.role !== 'consultant') return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      const res = await fetch(`${apiBase}/api/consultants/${user.id}/reviews`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyModal.reviewId || !replyModal.reply.trim()) return;

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      const res = await fetch(`${apiBase}/api/reviews/${replyModal.reviewId}/reply`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ reply: replyModal.reply })
      });

      if (res.ok) {
        await loadReviews();
        setReplyModal({ open: false, reviewId: null, reply: '' });
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Errore nell\'invio della risposta');
      }
    } catch (error) {
      alert('Errore nell\'invio della risposta');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Recensioni</h1>
          <p className="text-gray-600">Leggi e rispondi alle recensioni dei tuoi clienti</p>
        </div>

        {reviews.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <FaStar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Nessuna recensione ancora</p>
            <p className="text-gray-500 text-sm mt-2">Le recensioni dei tuoi clienti appariranno qui</p>
          </div>
        ) : (
          <div className="space-y-6">
            {reviews.map((review) => (
              <div key={review.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <FaStar
                            key={i}
                            className={`w-5 h-5 ${i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                              }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">
                        {review.customer_nickname || review.customer_email?.split('@')[0] || 'Cliente'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(review.created_at).toLocaleDateString('it-IT')}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="text-gray-700 mt-2">{review.comment}</p>
                    )}
                  </div>
                </div>

                {
                  review.reply ? (
                    <div className="mt-4 pl-4 border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                      <div className="flex items-center space-x-2 mb-2">
                        <FaReply className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-900">La tua risposta</span>
                      </div>
                      <p className="text-gray-700">{review.reply}</p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReplyModal({ open: true, reviewId: review.id, reply: '' })}
                      >
                        <FaReply className="w-4 h-4 mr-2" />
                        Rispondi
                      </Button>
                    </div>
                  )
                }
              </div>
            ))}
          </div>
        )}

        {/* Reply Modal */}
        <Modal
          isOpen={replyModal.open}
          onClose={() => setReplyModal({ open: false, reviewId: null, reply: '' })}
          title="Rispondi alla Recensione"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                La tua risposta
              </label>
              <textarea
                value={replyModal.reply}
                onChange={(e) => setReplyModal({ ...replyModal, reply: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Scrivi la tua risposta alla recensione..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setReplyModal({ open: false, reviewId: null, reply: '' })}
              >
                Annulla
              </Button>
              <Button variant="primary" onClick={handleReply}>
                Invia Risposta
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div >
  );
};

export default ConsultantReviews;


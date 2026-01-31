import React, { useEffect, useRef } from 'react';
import { FaPhone, FaVideo, FaTimes, FaComments } from 'react-icons/fa';
import Button from '../ui/Button';

const IncomingCallModal = ({ isOpen, onAccept, onDecline, requestData }) => {
  const audioRef = useRef(null);
  const audioIntervalRef = useRef(null);

  useEffect(() => {
    if (isOpen && requestData) {
      // Play ringing sound repeatedly
      const playRing = () => {
        try {
          // Create audio element for ringing sound
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.7;
          audio.play().catch(() => {
            // If notification.mp3 doesn't exist, try using Web Audio API for a simple beep
            try {
              const audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();

              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);

              oscillator.frequency.value = 800;
              oscillator.type = 'sine';
              gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

              oscillator.start(audioContext.currentTime);
              oscillator.stop(audioContext.currentTime + 0.5);
            } catch (e) {
              // Silently fail if audio can't play
            }
          });
        } catch (e) {
          // Silently fail if audio can't play
        }
      };

      // Play immediately
      playRing();

      // Then play every 2 seconds
      audioIntervalRef.current = setInterval(playRing, 2000);

      return () => {
        if (audioIntervalRef.current) {
          clearInterval(audioIntervalRef.current);
        }
      };
    }
  }, [isOpen, requestData]);

  if (!isOpen || !requestData) return null;

  const customerName = requestData.customer_name || requestData.customer_email?.split('@')[0] || 'Cliente';
  const isChat = requestData.type === 'chat';
  const callType = requestData.type === 'video' ? 'Videochiamata' : requestData.type === 'voice' ? 'Chiamata Vocale' : 'Chat';
  const headerTitle = isChat ? 'Richiesta Chat' : 'Chiamata in Arrivo';
  const headerGradient = isChat ? 'from-green-600 to-emerald-600' : 'from-blue-600 to-purple-600';
  const iconGradient = isChat ? 'from-green-500 to-emerald-500' : 'from-blue-500 to-purple-500';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100 animate-pulse-slow">
        {/* Header */}
        <div className={`bg-gradient-to-r ${headerGradient} text-white rounded-t-2xl p-6 text-center`}>
          <div className="flex justify-center mb-4">
            {requestData.type === 'video' ? (
              <FaVideo className="w-16 h-16 animate-bounce" />
            ) : requestData.type === 'voice' ? (
              <FaPhone className="w-16 h-16 animate-bounce" />
            ) : (
              <FaComments className="w-16 h-16 animate-bounce" />
            )}
          </div>
          <h2 className="text-2xl font-bold mb-2">{headerTitle}</h2>
          <p className="text-blue-100">{callType}</p>
        </div>

        {/* Body */}
        <div className="p-6 text-center">
          <div className="mb-6">
            <div className={`w-24 h-24 bg-gradient-to-br ${iconGradient} rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold`}>
              {customerName.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{customerName}</h3>
            <p className="text-gray-600">vuole iniziare una {callType.toLowerCase()}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <Button
              variant="danger"
              size="lg"
              onClick={onDecline}
              className="flex items-center gap-2 min-w-[140px]"
            >
              <FaTimes className="w-5 h-5" />
              Rifiuta
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onAccept}
              className={`flex items-center gap-2 min-w-[140px] ${isChat ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isChat ? <FaComments className="w-5 h-5" /> : <FaPhone className="w-5 h-5" />}
              Accetta
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in;
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default IncomingCallModal;

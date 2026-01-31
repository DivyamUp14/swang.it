import React, { useEffect, useState } from 'react';
import { FaPhone, FaVideo, FaTimes, FaComments, FaCircle } from 'react-icons/fa';
import Button from '../ui/Button';

const OutboundCallModal = ({ isOpen, onCancel, requestData }) => {
    const [dots, setDots] = useState('');

    useEffect(() => {
        if (isOpen) {
            const interval = setInterval(() => {
                setDots(prev => prev.length >= 3 ? '' : prev + '.');
            }, 500);
            return () => clearInterval(interval);
        }
    }, [isOpen, requestData]);

    if (!isOpen || !requestData) {
        // console.log('[DEBUG-MODAL] OutboundCallModal hidden (null props)')
        return null;
    }

    const consultantName = requestData.consultant_name || requestData.consultant_email?.split('@')[0] || 'Consulente';
    const isChat = requestData.type === 'chat';
    const callType = requestData.type === 'video' ? 'Videochiamata' : requestData.type === 'voice' ? 'Chiamata Vocale' : 'Chat';
    const headerGradient = isChat ? 'from-green-600 to-emerald-600' : 'from-blue-600 to-purple-600';
    const iconGradient = isChat ? 'from-green-500 to-emerald-500' : 'from-blue-500 to-purple-500';

    return (
        <div className="fixed bottom-4 right-4 z-[9999] animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-80 border border-gray-100 overflow-hidden transform transition-all duration-300 scale-100 hover:shadow-3xl">

                {/* Header - Compact */}
                <div className={`bg-gradient-to-r ${headerGradient} text-white p-4 text-center relative overflow-hidden`}>
                    {/* Compact Ripples */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                        <div className="w-32 h-32 bg-white rounded-full animate-ping-slow absolute"></div>
                    </div>

                    <div className="relative z-10 flex items-center justify-center gap-3 mb-1">
                        <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm animate-pulse-slow">
                            {requestData.type === 'video' ? (
                                <FaVideo className="w-5 h-5" />
                            ) : requestData.type === 'voice' ? (
                                <FaPhone className="w-5 h-5" />
                            ) : (
                                <FaComments className="w-5 h-5" />
                            )}
                        </div>
                        <h2 className="text-lg font-bold">
                            {isChat ? 'In attesa' : 'Chiamata...'}
                        </h2>
                    </div>
                    <p className="relative z-10 text-blue-100 text-xs opacity-90">Attendere risposta...</p>
                </div>

                {/* Body - Compact */}
                <div className="p-4 text-center">
                    <div className="flex items-center gap-3 mb-4 text-left">
                        <div className={`w-12 h-12 bg-gradient-to-br ${iconGradient} rounded-full flex-shrink-0 flex items-center justify-center text-white text-lg font-bold shadow-md`}>
                            {consultantName.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <h3 className="text-base font-bold text-gray-900 truncate">{consultantName}</h3>
                            <p className="text-gray-500 flex items-center gap-1 text-xs">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                Contattando...{dots}
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between items-center bg-gray-50 rounded-lg p-1">
                        <span className="text-xs text-gray-400 pl-2">Annulla se necessario</span>
                        <button
                            onClick={onCancel}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors duration-200"
                            title="Annulla Richiesta"
                        >
                            <FaTimes className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>


            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        @keyframes ping-slow {
          0% { transform: scale(0.8); opacity: 0.8; }
          80%, 100% { transform: scale(2); opacity: 0; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in;
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
        .animate-ping-slow {
          animation: ping-slow 3s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .delay-700 {
          animation-delay: 700ms;
        }
      `}</style>
        </div>
    );
};

export default OutboundCallModal;

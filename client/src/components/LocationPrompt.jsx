import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { FaMapMarkerAlt, FaExclamationTriangle } from 'react-icons/fa';

export default function LocationPrompt() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (loading || !user) return;

        // Don't show prompt if user is already on the account page
        if (location.pathname === '/account') {
            setShowModal(false);
            return;
        }

        // Check if location info is missing
        const isLocationMissing = !user.country || !user.city || !user.timezone;

        if (isLocationMissing) {
            const lastPrompt = localStorage.getItem('lastLocationPrompt');
            const now = Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;

            // Show if never shown or if 24 hours have passed
            if (!lastPrompt || (now - parseInt(lastPrompt)) > ONE_DAY) {
                setShowModal(true);
            }
        }
    }, [user, loading]);

    const handleGoToProfile = () => {
        setShowModal(false);
        navigate('/account');
    };

    const handleClose = () => {
        // Save timestamp when dismissed so it doesn't show again for 24h
        localStorage.setItem('lastLocationPrompt', Date.now().toString());
        setShowModal(false);
    };

    if (!showModal) return null;

    return (
        <Modal isOpen={showModal} onClose={handleClose} title="Aggiornamento richiesto">
            <div className="text-center p-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
                    <FaExclamationTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aggiornamento Profilo Richiesto</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Per garantirti il corretto funzionamento del fuso orario e degli appuntamenti,
                    è <strong>obbligatorio</strong> impostare Paese e Città nel tuo profilo.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button variant="secondary" onClick={handleClose}>
                        Ricordamelo dopo
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleGoToProfile}
                        className="whitespace-nowrap flex items-center"
                    >
                        <FaMapMarkerAlt className="mr-2" />
                        Aggiorna ora
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

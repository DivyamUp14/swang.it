import React, { useEffect, useMemo, useState } from 'react';
import { HiX, HiCheck } from 'react-icons/hi';
import { FaChevronRight } from 'react-icons/fa';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../auth/AuthContext';

// Import payment logos
import visaLogo from '../../assets/images/visa-logo.png';
import amexLogo from '../../assets/images/amex-logo.png';
import paypalLogo from '../../assets/images/paypal-logo.png';
import swangLogo from '../../assets/images/logo.png';

const cardElementOptions = {
  style: {
    base: {
      color: '#1f2937',
      fontFamily: '"Inter", sans-serif',
      fontSize: '16px',
      '::placeholder': {
        color: '#9ca3af'
      }
    },
    invalid: {
      color: '#ef4444'
    }
  }
};

// Wrapper component that safely uses Stripe hooks
function StripeTopUpContent({ isOpen, onClose, currentBalance }) {
  // Hooks must be called unconditionally at the top level
  const stripe = useStripe();
  const elements = useElements();
  const { token, apiBase, user, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('recharge');
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const amounts = useMemo(() => {
    // Show €10 offer ONLY if user has no previous top-ups
    if (!user?.has_topups) {
      return [10, 25, 50, 100];
    }
    return [25, 50, 100];
  }, [user]);

  const baseHeaders = useMemo(() => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
    return headers;
  }, [token, apiBase]);

  // Early return if Stripe is not available
  if (!stripe || !elements) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Ricarica Crediti">
        <div className="p-6">
          <p className="text-gray-600 mb-4">Stripe payment is not configured. Please contact support.</p>
          <Button onClick={onClose} variant="primary">Close</Button>
        </div>
      </Modal>
    );
  }

  const handleConfirm = async () => {
    if (!selectedAmount) {
      setError('Seleziona un importo da ricaricare');
      return;
    }
    if (!agreementAccepted) {
      setError('Devi accettare i Termini di Servizio');
      return;
    }
    if (!stripe || !elements) {
      setError('Pagamento non disponibile. Riprova più tardi.');
      return;
    }

    setError(null);
    setSuccess(false);
    setIsProcessing(true);

    try {
      const headers = { ...baseHeaders, 'Content-Type': 'application/json' };
      const createRes = await fetch(`${apiBase}/api/payments/create-intent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount: selectedAmount })
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || 'Impossibile creare il pagamento');
      }

      const { clientSecret } = await createRes.json();
      const cardElement = elements.getElement(CardElement);
      const paymentResult = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email: user?.email || undefined
          }
        }
      });

      if (paymentResult.error) {
        throw new Error(paymentResult.error.message || 'Pagamento non riuscito');
      }

      const paymentIntentId = paymentResult.paymentIntent?.id;
      if (!paymentIntentId) {
        throw new Error('Pagamento completato ma impossibile verificare l\'operazione');
      }

      const confirmRes = await fetch(`${apiBase}/api/payments/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentIntentId })
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({}));
        throw new Error(err.error || 'Impossibile confermare il pagamento');
      }

      const data = await confirmRes.json();
      if (data.user) {
        setUser(data.user);
      }

      setSuccess(true);
      cardElement.clear();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Pagamento non riuscito');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <img
            src={swangLogo}
            alt="Swang Logo"
            className="h-10 object-contain"
          />
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100"
        >
          <HiX className="w-6 h-6" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('recharge')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'recharge'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'
            }`}
        >
          RICARICA
        </button>
        <button
          onClick={() => setActiveTab('payment')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'payment'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900'
            }`}
        >
          PAGAMENTO
        </button>
      </div>

      {activeTab === 'recharge' && (
        <div>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Ricarica</h3>
            <p className="text-sm text-gray-600">
              Credito Attuale: <span className="font-semibold text-gray-900">€{Number(currentBalance || 0).toFixed(2)}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {amounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                className={`
                  relative p-4 border-2 rounded-xl transition-all flex flex-col items-center justify-center min-h-[100px]
                  ${selectedAmount === amount
                    ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600'
                    : amount === 10
                      ? 'border-purple-300 bg-purple-50 hover:border-purple-400'
                      : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                  }
                `}
              >
                {selectedAmount === amount && (
                  <div className="absolute -top-3 -right-3 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shadow-sm z-10">
                    <HiCheck className="w-4 h-4 text-white" />
                  </div>
                )}

                {amount === 10 && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                    OFFERTA BENVENUTO
                  </div>
                )}

                {amount === 50 && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    POPOLARE
                  </div>
                )}

                <div className="text-center">
                  <div className={`text-2xl font-bold ${amount === 10 ? 'text-purple-700' : 'text-gray-900'}`}>€{amount}</div>
                  <div className={`text-xs font-medium mt-1 ${amount === 10 ? 'text-purple-600' : 'text-gray-500'}`}>
                    {amount === 10 ? 'Ricevi 15 crediti' : `${amount} crediti`}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {
            selectedAmount && (
              <Button
                variant="primary"
                size="lg"
                className="w-full mb-4"
                onClick={() => setActiveTab('payment')}
              >
                CONFERMA LA MIA SCELTA
              </Button>
            )
          }

          {/* Payment Methods */}
          <div className="flex items-center justify-center space-x-4 mb-4">
            <img src={visaLogo} alt="Visa" className="h-8" />
            <img src={amexLogo} alt="Amex" className="h-8" />
          </div>

          <p className="text-xs text-center text-gray-500">
            Pagamento 100% Sicuro ✓ Norton by Symantec
          </p>
        </div >
      )
      }

      {
        activeTab === 'payment' && selectedAmount && (
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {selectedAmount === 10
                ? `Ottieni 15 Crediti per €10.00`
                : `Ricarica €${Number(selectedAmount).toFixed(2)}`
              }
            </h3>

            {/* Credit Card Payment */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-900">Carta di Credito/Prepagata</h4>
                <div className="flex space-x-2">
                  <img src={visaLogo} alt="Visa" className="h-6" />
                  <img src={amexLogo} alt="Amex" className="h-6" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
                  <CardElement options={cardElementOptions} />
                </div>
                <p className="text-xs text-gray-500">
                  I pagamenti sono elaborati in modo sicuro tramite Stripe.
                </p>
              </div>
            </div>

            {/* Terms */}
            <div className="mb-6">
              <label className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={agreementAccepted}
                  onChange={(e) => setAgreementAccepted(e.target.checked)}
                />
                <span className="text-sm text-gray-600">
                  Ho letto e accetto i{' '}
                  <a href="/terms" className="text-blue-600 hover:underline">Termini Generali di Servizio</a>
                </span>
              </label>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-600">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-600">
                Pagamento completato! Il tuo saldo sarà aggiornato tra pochi secondi.
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full mb-4"
              onClick={handleConfirm}
              disabled={isProcessing || !stripe}
            >
              {isProcessing ? 'Elaborazione...' : 'CONFERMA'}
            </Button>

            <p className="text-xs text-center text-gray-500">
              Pagamento 100% Sicuro ✓ Norton by Symantec
            </p>
          </div>
        )
      }
    </Modal >
  );
}

// Main component that wraps Stripe content
const TopUpModal = ({ isOpen, onClose, currentBalance }) => {
  // Always render StripeTopUpContent - it will handle null stripe/elements gracefully
  // The Elements provider is always present in App.jsx, so hooks will work
  return <StripeTopUpContent isOpen={isOpen} onClose={onClose} currentBalance={currentBalance} />;
};

export default TopUpModal;


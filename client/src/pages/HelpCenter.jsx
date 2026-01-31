import React, { useState } from 'react';
import { FaEnvelope, FaQuestionCircle, FaSearch } from 'react-icons/fa';
import { useAuth } from '../auth/AuthContext.jsx';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const HelpCenter = () => {
  const { apiBase } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const faqs = [
    {
      question: "Come posso iniziare una consulenza?",
      answer: "Sfoglia i nostri consulenti, seleziona uno che corrisponde alle tue esigenze e clicca 'Invia Richiesta'. Una volta accettata, puoi iniziare una chat, chiamata vocale o videochiamata."
    },
    {
      question: "Come funziona il sistema di crediti?",
      answer: "I crediti vengono detratti in base ai prezzi del consulente. I messaggi di chat sono per messaggio, mentre le chiamate vocali e video sono al minuto. I crediti vengono detratti in tempo reale durante la sessione."
    },
    {
      question: "Posso ottenere un rimborso?",
      answer: "I crediti non sono rimborsabili una volta utilizzati. Tuttavia, se riscontri problemi tecnici, contatta il nostro team di supporto a servizioclienti@swang.it"
    },
    {
      question: "Come posso prenotare un appuntamento?",
      answer: "I consulenti possono offrire appuntamenti programmati. Clicca 'Prenota Appuntamento' sul loro profilo per vedere gli slot disponibili e prenotarne uno adatto a te."
    },
    {
      question: "Le mie informazioni sono private?",
      answer: "Sì, prendiamo sul serio la tua privacy. Tutte le consulenze sono confidenziali e le tue informazioni personali sono protette secondo le normative GDPR."
    },
    {
      question: "Come posso diventare consulente?",
      answer: "Clicca 'Diventa Consulente' nel footer o contattaci direttamente. Dovrai completare il tuo profilo e superare il nostro processo di approvazione."
    }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMessage(null);
    
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
      
      const res = await fetch(`${apiBase}/api/support/contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify(contactForm)
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSubmitMessage({ type: 'success', text: data.message || 'Grazie per averci contattato! Ti risponderemo presto.' });
        setContactForm({ name: '', email: '', subject: '', message: '' });
      } else {
        setSubmitMessage({ type: 'error', text: data.error || 'Errore nell\'invio del messaggio. Riprova più tardi.' });
      }
    } catch (error) {
      setSubmitMessage({ type: 'error', text: 'Errore di connessione. Riprova più tardi.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFAQs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Hai Bisogno di Aiuto? Siamo Qui per Te
        </h1>
        <p className="text-xl text-gray-600">
          Trova risposte alle domande comuni o contatta il nostro team di supporto
        </p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Cerca aiuto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
        </div>
      </div>

      {/* Contact Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-12 max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <FaEnvelope className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Supporto Email</h3>
              <a
                href="mailto:servizioclienti@swang.it"
                className="text-blue-600 hover:underline"
              >
                servizioclienti@swang.it
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Domande Frequenti
        </h2>
        <div className="space-y-4">
          {filteredFAQs.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              Nessuna FAQ trovata corrispondente alla tua ricerca.
            </div>
          ) : (
            filteredFAQs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))
          )}
        </div>
      </div>

      {/* Contact Form */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Inviaci un Messaggio</h2>
        {submitMessage && (
          <div className={`mb-6 p-4 rounded-lg ${
            submitMessage.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {submitMessage.text}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Il Tuo Nome"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              required
            />
            <Input
              label="La Tua Email"
              type="email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              required
            />
          </div>
          <Input
            label="Oggetto"
            value={contactForm.subject}
            onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Messaggio
            </label>
            <textarea
              value={contactForm.message}
              onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
              rows={6}
              className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            {submitting ? 'Invio in corso...' : 'Invia Messaggio'}
          </Button>
        </form>
      </div>
    </div>
  );
};

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900">{question}</span>
        <FaQuestionCircle className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-6 pb-4 text-gray-600">
          {answer}
        </div>
      )}
    </div>
  );
};

export default HelpCenter;


import React from 'react';

const FAQ = () => {
  const faqs = [
    {
      question: "Che cos'è Swang e come funziona?",
      answer: (
        <>
          Swang è la piattaforma italiana più innovativa per parlare subito con psicologi, coach, 
          cartomanti ed esperti del benessere. Puoi farlo tramite chiamata o chat, in totale anonimato 
          e quando vuoi.
          <ol className="list-decimal list-inside mt-3 space-y-2 ml-4">
            <li>Registri il tuo account su www.swang.it</li>
            <li>Scegli il professionista</li>
            <li>Avvii la chiamata o la chat</li>
            <li>Paghi solo i minuti utilizzati</li>
          </ol>
          La registrazione è gratuita e non richiede abbonamenti.
        </>
      )
    },
    {
      question: "Serve un appuntamento?",
      answer: "No. Su Swang puoi parlare subito, quando ne hai bisogno. Se preferisci, puoi anche prenotare un orario."
    },
    {
      question: "Le conversazioni sono anonime?",
      answer: "Sì. I professionisti vedono solo il tuo nickname. Nessun nome, numero di telefono o dato personale viene mostrato."
    },
    {
      question: "Chi sono i professionisti su Swang?",
      answer: "Sono psicologi, coach, cartomanti, consulenti ed esperti verificati dal team Swang. Ogni profilo è controllato manualmente per garantire competenza, serietà, esperienza e qualità del servizio."
    },
    {
      question: "Come scelgo il professionista giusto per me?",
      answer: "Ogni profilo contiene: presentazione, competenze, recensioni, prezzo al minuto e disponibilità."
    },
    {
      question: "Quanto costa un consulto?",
      answer: "Ogni professionista stabilisce la propria tariffa al minuto. Il prezzo è sempre visibile sul profilo."
    },
    {
      question: "Come posso ricaricare il mio credito?",
      answer: "Le ricariche si effettuano esclusivamente tramite carta di credito o debito, attraverso Stripe. Pagamento immediato, dati protetti, credito aggiunto subito. Swang non salva mai i dati della tua carta."
    },
    {
      question: "Perché usate solo Stripe?",
      answer: "Per garantire massima sicurezza, zero rischi di addebiti non autorizzati e transazioni affidabili."
    },
    {
      question: "Perché non esiste il pagamento al minuto?",
      answer: "Per garantire trasparenza e sicurezza. Decidi tu quanto ricaricare, non ci sono blocchi sulla carta e non puoi spendere più di ciò che hai scelto."
    },
    {
      question: "Il credito scade?",
      answer: "No. Rimane disponibile finché non lo utilizzi."
    },
    {
      question: "Le chiamate compaiono sulla mia bolletta?",
      answer: "No. I consulti non passano dalla tua linea telefonica."
    },
    {
      question: "Come funziona il consulto via chat?",
      answer: "Accedi al tuo account, scegli un professionista che offre la chat e clicca CHAT. La conversazione si apre subito."
    },
    {
      question: "Come lascio una recensione?",
      answer: "Al termine della chiamata o della chat puoi lasciare una recensione nella tua Area Personale."
    },
    {
      question: "Non ricevo le email di Swang. Cosa posso fare?",
      answer: "Controlla lo spam. Puoi anche modificare le preferenze email dalla tua Area Utente."
    },
    {
      question: "Come contatto l'assistenza Swang?",
      answer: (
        <>
          Email: <a href="mailto:servizioclienti@swang.it" className="text-blue-600 hover:underline">servizioclienti@swang.it</a>
          <br />
          Modulo di contatto sul sito.
        </>
      )
    },
    {
      question: "Ho dimenticato la password. Come la recupero?",
      answer: "Vai su ACCEDI → Hai dimenticato la password? → inserisci la tua email e riceverai il link di reset."
    },
    {
      question: "Come posso eliminare il mio account Swang?",
      answer: (
        <>
          Puoi eliminare il tuo account in qualsiasi momento.
          <br />
          Ti basta accedere alla tua Area Personale, andare nella sezione Account e selezionare Elimina account.
          <br />
          <br />
          <strong>L'eliminazione è definitiva e non reversibile.</strong>
          <br />
          Tutti i dati associati al tuo profilo verranno rimossi in modo permanente.
        </>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">FAQ SWANG</h1>
          <p className="text-gray-600 text-lg">Domande Frequenti dei Clienti</p>
        </div>

        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                {faq.question}
              </h2>
              <div className="text-gray-700 leading-relaxed">
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FAQ;


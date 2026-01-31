import React from 'react';

const ReviewPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">POLITICA DELLE RECENSIONI – SWANG</h1>
        </div>

        <div className="space-y-8">
          {/* Chi può lasciare una recensione */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Chi può lasciare una recensione?
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Possono lasciare una recensione solo gli utenti che hanno effettuato un consulto reale con 
              un professionista. La recensione può essere pubblicata esclusivamente al termine della 
              chiamata o della chat. Non è possibile inserirla successivamente.
            </p>
          </section>

          {/* Cosa comprende una recensione */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Cosa comprende una recensione?
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Una recensione su Swang può includere:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>una valutazione da 1 a 5 stelle</li>
              <li>un commento scritto</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              La recensione viene pubblicata immediatamente sul profilo del professionista.
            </p>
          </section>

          {/* Moderazione dei contenuti */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Moderazione dei contenuti
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Swang utilizza un sistema di moderazione automatica e manuale. Vengono rimossi i 
              commenti che includono:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>linguaggio offensivo o discriminatorio</li>
              <li>numeri di telefono</li>
              <li>email o contatti esterni</li>
              <li>link a social o siti esterni</li>
              <li>contenuti illeciti</li>
              <li>violazioni delle Condizioni d'Uso</li>
            </ul>
          </section>

          {/* Ordine e visibilità delle recensioni */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Ordine e visibilità delle recensioni
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Le recensioni vengono pubblicate subito, appaiono in ordine cronologico e contribuiscono 
              alla valutazione globale del professionista. Le recensioni negative non vengono rimosse se 
              rispettano il regolamento.
            </p>
          </section>

          {/* Modifica o rimozione delle recensioni */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Modifica o rimozione delle recensioni
            </h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Swang può intervenire solo se:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>la recensione è illecita</li>
              <li>viola le Condizioni d'Uso</li>
              <li>contiene dati personali o sensibili</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              Le recensioni non vengono modificate su richiesta dell'utente, salvo casi eccezionali e 
              giustificati.
            </p>
          </section>

          {/* Cosa succede se una recensione viene rimossa */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Cosa succede se una recensione viene rimossa?
            </h2>
            <p className="text-gray-700 leading-relaxed">
              La recensione non sarà più visibile sul profilo e non verrà più conteggiata nella valutazione 
              globale del professionista.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ReviewPolicy;


import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const BecomeConsultant = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            ⭐ UNISCITI AL TEAM SWANG ⭐
          </h1>
          <h2 className="text-3xl font-semibold text-blue-900 mb-4">
            Diventa un Professionista su Swang
          </h2>
        </div>

        <div className="space-y-8">
          {/* Introduzione */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <p className="text-gray-700 text-lg leading-relaxed">
              Swang è la piattaforma italiana che connette persone in cerca di supporto immediato con 
              professionisti affidabili e qualificati. Se sei psicologo, coach, cartomante, consulente o 
              operatore del benessere, puoi mettere a disposizione le tue competenze e aiutare chi ha 
              bisogno, con totale libertà.
            </p>
          </section>

          {/* Perché scegliere Swang */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Perché scegliere Swang
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Entrare nel team Swang significa entrare in una realtà moderna, trasparente e pensata per 
              valorizzare il tuo talento.
            </p>
            <p className="text-gray-700 font-semibold mb-3">Con Swang puoi:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>lavorare quando vuoi, senza turni obbligatori</li>
              <li>ricevere chiamate e chat ovunque tu sia</li>
              <li>mantenere autonomia professionale</li>
              <li>decidere la tua tariffa al minuto</li>
              <li>accedere a una piattaforma sicura e in crescita</li>
            </ul>
          </section>

          {/* Cosa cerchiamo */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Cosa cerchiamo
            </h2>
            <p className="text-gray-700 font-semibold mb-3">Cerchiamo professionisti con:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>competenze reali e comprovate</li>
              <li>esperienza nel proprio settore</li>
              <li>empatia e capacità comunicativa</li>
              <li>professionalità e serietà</li>
            </ul>
          </section>

          {/* Come funziona la candidatura */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Come funziona la candidatura su Swang
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Per diventare un professionista Swang, la procedura è semplice ma rigorosa:
            </p>
            <ol className="list-decimal list-inside space-y-3 text-gray-700 ml-4">
              <li>Registrati sulla piattaforma e crea un nuovo account</li>
              <li>Durante la registrazione, seleziona l'opzione "Consulente / Professionista"</li>
              <li>
                Compila completamente il tuo profilo, inserendo:
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li>foto</li>
                  <li>descrizione professionale</li>
                  <li>competenze</li>
                  <li>tariffa</li>
                  <li>disponibilità</li>
                  <li>documenti richiesti (se previsti)</li>
                </ul>
              </li>
              <li>
                Una volta completato il profilo, il tuo account rimarrà offline e non visibile agli utenti
              </li>
              <li>
                Il team Swang valuterà la tua candidatura e ti contatterà in un secondo momento
              </li>
              <li>
                Se superi la selezione e i controlli, il tuo profilo verrà approvato e messo online
              </li>
              <li>
                Da quel momento potrai iniziare a ricevere chiamate e chat dagli utenti
              </li>
            </ol>
          </section>

          {/* I tuoi guadagni */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              I tuoi guadagni
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Decidi tu la tua tariffa al minuto. Swang trattiene una commissione chiara e trasparente sul 
              consulto. Nessun costo fisso, nessun vincolo.
            </p>
          </section>

          {/* Call to Action */}
          <section className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-8 text-white text-center">
            <p className="text-2xl font-bold mb-4">Lavora in libertà. Aiuta chi ha bisogno. Cresci con Swang.</p>
            <p className="text-lg mb-6">
              Se vuoi unirti al nostro team, inizia ora creando il tuo profilo.
            </p>
            <Link to="/signup">
              <Button variant="blue" size="lg" className="bg-white hover:bg-gray-100">
                Registrati Ora
              </Button>
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};

export default BecomeConsultant;


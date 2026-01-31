import React from 'react';
import chiSiamoImg from '../../assets/images/chiSimo.jpg';
import positiveConnectionsImg from '../../assets/images/postivieConnections.jpg';

const AboutUs = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Image */}
        <div className="mb-12">
          <div className="h-1 bg-gray-300 mb-6"></div>
          <div className="flex justify-center mb-8">
            <img
              src={chiSiamoImg}
              alt="Team Swang"
              className="max-w-full h-auto rounded-lg shadow-lg"
            />
          </div>
        </div>

        {/* Chi è Swang */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-blue-900 mb-4">Chi è Swang</h2>
          <p className="text-gray-700 text-lg leading-relaxed">
            Creata nel 2025, Swang rivoluziona il modo in cui chiediamo e riceviamo supporto. Non
            siamo un marketplace: siamo un ecosistema progettato per offrire risposte immediate e
            totale privacy.
          </p>
        </section>

        {/* La nostra essenza */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-blue-900 mb-4">La nostra essenza</h2>
          <p className="text-gray-700 text-lg leading-relaxed">
            Swang rende accessibile, immediato e sicuro qualsiasi supporto umano e professionale.
            Psicologi, coach, cartomanti, esperti: puoi parlare con loro ora, senza attese.
          </p>
        </section>

        {/* La nostra filosofia */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-blue-900 mb-4">La nostra filosofia</h2>
          <ul className="space-y-3 text-gray-700 text-lg">
            <li className="flex items-start">
              <span className="text-blue-600 mr-3">•</span>
              <span>Il nuovo mondo è fatto di immediatezza, non di attesa.</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-3">•</span>
              <span>Crediamo nel valore delle connessioni umane.</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-3">•</span>
              <span>Abbattiamo barriere, non le creiamo.</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-3">•</span>
              <span>La tecnologia deve essere invisibile e semplice.</span>
            </li>
          </ul>
        </section>

        {/* I nostri punti di forza */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">I nostri punti di forza</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="text-blue-600 mr-3">•</span>
                <span className="text-gray-700 text-lg">Tecnologia reale, veloce e intuitiva</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-600 mr-3">•</span>
                <span className="text-gray-700 text-lg">Professionisti verificati uno a uno</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="text-blue-600 mr-3">•</span>
                <span className="text-gray-700 text-lg">Anonimato totale: tu decidi quanto condividere</span>
              </div>
              <div className="flex items-start">
                <span className="text-blue-600 mr-3">•</span>
                <span className="text-gray-700 text-lg">Paghi solo ciò che utilizzi, senza abbonamenti</span>
              </div>
            </div>
          </div>
        </section>

        {/* Perché Swang è diversa */}
        <section className="mb-12">
          <div className="flex justify-center mb-6">
          </div>
          <h2 className="text-3xl font-bold text-blue-900 mb-4 text-center">Perché Swang è diversa</h2>
          <p className="text-gray-700 text-lg leading-relaxed text-center">
            Mentre le vecchie piattaforme parlano di 'servizi LIVE multicanale', Swang punta all'impatto
            immediato nella vita reale. Non vogliamo essere la copia di nessuno: siamo il nuovo standard.
          </p>
          <div className="mt-6 text-center">
            <img
              src={positiveConnectionsImg}
              alt="Positive Connections"
              className="w-1/2 mx-auto h-auto rounded-lg shadow-lg"
            />
            <div className="h-1 bg-gray-300 mt-4 max-w-md mx-auto"></div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutUs;


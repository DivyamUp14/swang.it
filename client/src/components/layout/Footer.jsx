import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa';
import { HiCheck } from 'react-icons/hi';

const Footer = () => {
  useEffect(() => {
    const consentStorageKey = 'swang-cookie-consent';

    const ensureHideStyle = () => {
      if (document.getElementById('iubenda-hide-style')) return;
      const style = document.createElement('style');
      style.id = 'iubenda-hide-style';
      style.innerHTML = `
        #iubenda-cs-banner,
        #iubenda-cs-overlay {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `;
      document.head.appendChild(style);
    };

    const hideConsentBanner = () => {
      ensureHideStyle();
      const banner = document.getElementById('iubenda-cs-banner');
      const overlay = document.getElementById('iubenda-cs-overlay');
      if (banner) banner.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    };

    const persistAndHide = (status) => {
      if (!status) return;
      localStorage.setItem(consentStorageKey, status);
      setTimeout(hideConsentBanner, 50);
    };

    const handleStatusChange = (event) => {
      const status = event?.detail?.status || event?.detail || '';
      persistAndHide(status || 'custom');
    };

    const handleGiven = () => persistAndHide('accepted');
    const handleRejected = () => persistAndHide('rejected');

    document.addEventListener('iubenda_consent_status_changed', handleStatusChange);
    document.addEventListener('iubenda_consent_given', handleGiven);
    document.addEventListener('iubenda_consent_rejected', handleRejected);

    const clickHandler = (event) => {
      const text = event?.target?.textContent?.trim().toLowerCase();
      if (text === 'accetta tutto') {
        persistAndHide('accepted');
      }
      if (text === 'rifiuta tutto') {
        persistAndHide('rejected');
      }
    };
    document.addEventListener('click', clickHandler, true);

    const ensureScript = (src, id) => {
      if (document.getElementById(id) || document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.id = id;
      document.body.appendChild(script);
    };

    ensureScript('https://cdn.iubenda.com/iubenda.js', 'iubenda-js');

    const storedConsent = localStorage.getItem(consentStorageKey);
    if (storedConsent) {
      ensureHideStyle();
    } else {
      ensureScript('https://embeds.iubenda.com/widgets/7dd77a0a-25f1-4cd2-b00a-ae890c78edca.js', 'iubenda-privacy-controls');
    }

    const observer = new MutationObserver(() => {
      if (localStorage.getItem(consentStorageKey)) {
        hideConsentBanner();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('iubenda_consent_status_changed', handleStatusChange);
      document.removeEventListener('iubenda_consent_given', handleGiven);
      document.removeEventListener('iubenda_consent_rejected', handleRejected);
      document.removeEventListener('click', clickHandler, true);
      observer.disconnect();
    };
  }, []);

  return (
    <footer className="bg-gray-800 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* General */}
          <div>
            <h3 className="text-white font-semibold mb-4">Generale</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/about" className="hover:text-white transition-colors">Chi Siamo</Link></li>
              <li><Link to="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Termini di Servizio</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Termini di Utilizzo</Link></li>
              <li>
                <a
                  href="https://www.iubenda.com/privacy-policy/77402283"
                  className="iubenda-white iubenda-noiframe hover:text-white transition-colors"
                  title="Privacy Policy"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://www.iubenda.com/privacy-policy/77402283/cookie-policy"
                  className="iubenda-white iubenda-noiframe hover:text-white transition-colors"
                  title="Cookie Policy"
                  rel="noopener noreferrer"
                >
                  Cookie Policy
                </a>
              </li>
              <li><Link to="/reviews" className="hover:text-white transition-colors">Politica delle Recensioni</Link></li>
            </ul>
          </div>

          {/* Have a Talent? */}
          <div>
            <h3 className="text-white font-semibold mb-4">Hai un Talento?</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/become-consultant" className="hover:text-white transition-colors">Diventa Consulente</Link></li>
            </ul>
          </div>

          {/* Need Help? */}
          <div>
            <h3 className="text-white font-semibold mb-4">Hai Bisogno di Aiuto?</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link 
                  to="/help" 
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  Contattaci via email
                </Link>
              </li>
              <li className="text-sm mt-4">
                Servizio Clienti<br />
                Lun-Ven: 9:30 - 20:30<br />
                Weekend: 11:30 - 17:30
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h3 className="text-white font-semibold mb-4">Seguici</h3>
            <p className="text-sm mb-2">
              Seguici sui nostri canali social:
            </p>
            <p className="text-sm mb-4">
              Resta connesso con l'energia di <span className="font-bold">Swang ✨</span>
            </p>
            <div className="flex space-x-4">
              <a 
                href="https://www.facebook.com/profile.php?id=61570520129189" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors" 
                aria-label="Facebook"
              >
                <FaFacebook className="w-6 h-6" />
              </a>
              <a 
                href="https://www.instagram.com/swang.italia" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors" 
                aria-label="Instagram"
              >
                <FaInstagram className="w-6 h-6" />
              </a>
              <a 
                href="https://www.tiktok.com/@swang.italia" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors" 
                aria-label="TikTok"
              >
                <FaTiktok className="w-6 h-6" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <span className="text-sm">Pagamento 100% Sicuro</span>
            <HiCheck className="w-5 h-5 text-green-500" />
            <span className="text-sm">Norton by Symantec</span>
          </div>
          <div className="text-sm">
            © 2025 Swang Group – All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FaUpload, FaFilePdf, FaDownload, FaCheckCircle, FaClock } from 'react-icons/fa';
import ConsultantNav from '../components/layout/ConsultantNav';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';

const EarningsInvoices = () => {
  const { user, token, apiBase } = useAuth();
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const [earnings, setEarnings] = useState({
    totalEarnings: 0,
    thisMonth: 0,
    lastMonth: 0,
    swangCommission: 0,
    consultantEarnings: 0,
    availableForPayout: 0,
    available: 0,
    inRequest: 0,
    paid: 0
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize] = useState(20);

  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [invoicePath, setInvoicePath] = useState(null);
  const [payoutCooldown, setPayoutCooldown] = useState(null);

  useEffect(() => {
    if (!token || !apiBase) return;

    const commonHeaders = { Authorization: `Bearer ${token}` };
    if ((apiBase || '').includes('ngrok')) commonHeaders['ngrok-skip-browser-warning'] = 'true';

    // Load earnings summary with monthly history support
    const loadEarnings = async () => {
      try {
        const params = new URLSearchParams({ month: selectedMonth, year: selectedYear });
        const res = await fetch(`${apiBase}/api/consultant/earnings-summary?${params}`, { headers: commonHeaders });
        if (res.ok) {
          const data = await res.json();
          setEarnings({
            totalEarnings: Number(data.totalEarnings || 0),
            thisMonth: Number(data.thisMonth || 0),
            lastMonth: Number(data.lastMonth || 0),
            swangCommission: Number(data.swangCommission || 0),
            consultantEarnings: Number(data.consultantEarnings || 0),
            availableForPayout: Number(data.available || 0),
            available: Number(data.available || 0),
            inRequest: Number(data.inRequest || 0),
            paid: Number(data.paid || 0)
          });
        }
      } catch { }
    };

    // Load transactions (earnings)
    const loadTransactions = async () => {
      try {
        const params = new URLSearchParams({
          page: String(txPage),
          pageSize: String(txPageSize),
          month: String(selectedMonth),
          year: String(selectedYear)
        });
        const res = await fetch(`${apiBase}/api/consultant/transactions?${params.toString()}`, { headers: commonHeaders });
        if (res.ok) {
          const data = await res.json();
          setTxTotal(Number(data.total || 0));
          const items = Array.isArray(data.transactions) ? data.transactions : [];
          setTransactions(items);
        }
      } catch { }
    };

    // Load invoices archive
    const loadInvoices = async () => {
      try {
        const res = await fetch(`${apiBase}/api/consultant/invoices`, { headers: commonHeaders });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.invoices) ? data.invoices : [];
          // Map to UI shape
          const mapped = items.map(inv => ({
            id: inv.id,
            name: (inv.file_path || '').split('/').pop() || 'Invoice PDF',
            date: inv.created_at ? new Date(inv.created_at).toLocaleDateString('it-IT') : '',
            amount: Number(inv.amount || 0),
            status: 'uploaded',
            href: `${apiBase}${inv.file_path}`
          }));
          setInvoices(mapped);
        }
      } catch { }
    };

    // Check for pending payout requests
    const checkPendingPayouts = async () => {
      try {
        const res = await fetch(`${apiBase}/api/consultant/payouts`, { headers: commonHeaders });
        if (res.ok) {
          const data = await res.json();
          const payouts = Array.isArray(data.payouts) ? data.payouts : [];
          const hasPending = payouts.some(p => p.status === 'pending');
          // If there's a pending payout, disable the button (credits are locked)
          setPayoutCooldown(hasPending ? 1 : null);
        }
      } catch { }
    };

    // Initial load
    loadEarnings();
    loadTransactions();
    loadInvoices();
    checkPendingPayouts();

    // Reload earnings when month/year changes
    if (selectedMonth && selectedYear) {
      loadEarnings();
    }

    // Auto-refresh earnings every 30 seconds
    const refreshInterval = setInterval(() => {
      loadEarnings();
      loadTransactions();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiBase, txPage, txPageSize, selectedMonth, selectedYear]);

  const PLATFORM_RATE = 0.45;
  const CONSULTANT_RATE = 0.55;

  const displayedTransactions = useMemo(() => {
    return transactions.map(tx => {
      const net = Number(tx.amount || 0); // earnings are net to consultant
      const commission = Math.round((net * (PLATFORM_RATE / CONSULTANT_RATE)) * 100) / 100;
      const gross = Math.round((net + commission) * 100) / 100;
      return {
        id: tx.id,
        date: tx.created_at ? new Date(tx.created_at).toLocaleDateString('it-IT') : '',
        client: '—',
        service: tx.description || 'Sessione',
        amount: gross,
        commission,
        net,
        status: tx.status || 'completed'
      };
    });
  }, [transactions]);

  const handleInvoiceUpload = async (file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed');
      return;
    }

    setUploadingInvoice(true);
    try {
      const formData = new FormData();
      formData.append('invoice', file);

      const headers = { Authorization: `Bearer ${token}` };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      const res = await fetch(`${apiBase}/api/consultant/invoice`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setInvoicePath(data.invoice_file_path);
        setInvoiceFile(file);
        alert('Fattura caricata con successo!');
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Errore nel caricamento della fattura');
      }
    } catch (error) {
      alert('Errore nel caricamento della fattura');
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handlePayoutRequest = async () => {
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
      alert('Inserisci un importo valido');
      return;
    }
    if (parseFloat(payoutAmount) > earnings.available) {
      alert('L\'importo supera i guadagni disponibili');
      return;
    }
    if (!invoicePath) {
      alert('Carica una fattura PDF');
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';

      const res = await fetch(`${apiBase}/api/consultant/payout-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: parseFloat(payoutAmount),
          invoice_file_path: invoicePath
        })
      });

      if (res.ok) {
        alert('Richiesta di pagamento inviata con successo!');
        setShowPayoutModal(false);
        setPayoutAmount('');
        setInvoiceFile(null);
        setInvoicePath(null);
        // Reload earnings to update available/inRequest amounts
        const earningsHeaders = { Authorization: `Bearer ${token}` };
        if ((apiBase || '').includes('ngrok')) earningsHeaders['ngrok-skip-browser-warning'] = 'true';
        const earningsRes = await fetch(`${apiBase}/api/consultant/earnings-summary?month=${selectedMonth}&year=${selectedYear}`, { headers: earningsHeaders });
        if (earningsRes.ok) {
          const earningsData = await earningsRes.json();
          setEarnings(prev => ({
            ...prev,
            available: Number(earningsData.available || 0),
            inRequest: Number(earningsData.inRequest || 0),
            availableForPayout: Number(earningsData.available || 0)
          }));
        }
        // Check for pending payouts
        const payoutsRes = await fetch(`${apiBase}/api/consultant/payouts`, { headers });
        if (payoutsRes.ok) {
          const payoutsData = await payoutsRes.json();
          const payouts = Array.isArray(payoutsData.payouts) ? payoutsData.payouts : [];
          const hasPending = payouts.some(p => p.status === 'pending');
          setPayoutCooldown(hasPending ? 1 : null);
        }
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.error || 'Errore nell\'invio della richiesta');
      }
    } catch (error) {
      alert('Errore nell\'invio della richiesta');
    }
  };


  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50">
      <ConsultantNav />
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Guadagni e Fatture</h1>
          <p className="text-gray-600">Traccia i tuoi guadagni e gestisci le richieste di pagamento</p>
        </div>

        {/* Revenue Split Info */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-blue-100 text-sm mb-1">Guadagni Totali</p>
              <p className="text-3xl font-bold">€{Number(earnings.totalEarnings || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-1">Commissione Swang (45%)</p>
              <p className="text-3xl font-bold">€{Number(earnings.swangCommission || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-1">I Tuoi Guadagni Netti (55%)</p>
              <p className="text-3xl font-bold">€{Number(earnings.consultantEarnings || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Earnings Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-500">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Disponibile</h3>
            <p className="text-3xl font-bold text-green-600 mb-2">€{Number(earnings.available || 0).toFixed(2)}</p>
            <p className="text-sm text-gray-600">Guadagni disponibili per il pagamento</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-yellow-500">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">In Richiesta</h3>
            <p className="text-3xl font-bold text-yellow-600 mb-2">€{Number(earnings.inRequest || 0).toFixed(2)}</p>
            <p className="text-sm text-gray-600">Guadagni bloccati in una richiesta di pagamento</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pagato</h3>
            <p className="text-3xl font-bold text-blue-600 mb-2">€{Number(earnings.paid || 0).toFixed(2)}</p>
            <p className="text-sm text-gray-600">Guadagni già pagati (periodo selezionato)</p>
          </div>
        </div>

        {/* Payout Request Box */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8 border-2 border-blue-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Richiedi Pagamento</h2>
              <p className="text-gray-600 mb-2">
                Disponibile per il pagamento: <span className="font-bold text-green-600">€{Number(earnings.available || 0).toFixed(2)}</span>
              </p>
              <p className="text-sm text-gray-600">
                I pagamenti avvengono il 15 e il 30 di ogni mese. Invia le richieste entro il 14 o il 29.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowPayoutModal(true)}
              disabled={earnings.available <= 0 || payoutCooldown !== null}
            >
              {payoutCooldown !== null
                ? 'Richiesta in elaborazione'
                : 'Richiedi Pagamento'}
            </Button>
          </div>
        </div>

        {/* Monthly History Selector */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-gray-900">Storico Pagamenti</h2>
            <div className="flex gap-4">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('it-IT', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Questo Mese</h3>
              <p className="text-3xl font-bold text-gray-900 mb-2">€{Number(earnings.thisMonth || 0).toFixed(2)}</p>
              <p className="text-sm text-gray-600">Guadagni netti dopo commissione</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Mese Scorso</h3>
              <p className="text-3xl font-bold text-gray-900 mb-2">€{Number(earnings.lastMonth || 0).toFixed(2)}</p>
              <p className="text-sm text-gray-600">Guadagni netti dopo commissione</p>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Cronologia Transazioni</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Servizio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Importo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commissione (45%)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Netto (55%)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{tx.date}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{tx.client}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {tx.service} {tx.duration && `(${tx.duration} min)`} {tx.messages && `(${tx.messages} msgs)`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">€{Number(tx.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-red-600">-€{Number(tx.commission || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">€{Number(tx.net || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoices Archive */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Archivio Fatture</h2>
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nessuna fattura ancora. Le fatture appariranno qui dopo le richieste di pagamento.</p>
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <FaFilePdf className="w-8 h-8 text-red-500" />
                    <div>
                      <p className="font-medium text-gray-900">{invoice.name}</p>
                      <p className="text-sm text-gray-600">{invoice.date} • €{Number(invoice.amount || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${invoice.status === 'approved' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                      {invoice.status}
                    </span>
                    {invoice.href ? (
                      <a href={invoice.href} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                        <FaDownload className="w-5 h-5" />
                      </a>
                    ) : (
                      <span className="text-gray-400">
                        <FaDownload className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payout Request Modal */}
        <Modal
          isOpen={showPayoutModal}
          onClose={() => setShowPayoutModal(false)}
          title="Richiedi Pagamento"
          className="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Politica di Pagamento:</strong> I pagamenti avvengono due volte al mese (15 e 30).
                Invia le richieste entro il giorno prima (14 o 29). Dopo la verifica dell'amministratore,
                il pagamento viene elaborato tramite bonifico bancario o PayPal.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Importo Richiesto (€)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={earnings.available}
                  value={payoutAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow empty string for clearing, or valid number
                    if (val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0)) {
                      setPayoutAmount(val);
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure value is within valid range on blur
                    const val = parseFloat(e.target.value);
                    if (isNaN(val) || val < 0.01) {
                      setPayoutAmount('');
                    } else if (val > earnings.availableForPayout) {
                      setPayoutAmount(Number(earnings.availableForPayout || 0).toFixed(2));
                    }
                  }}
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Disponibile: €{Number(earnings.available || 0).toFixed(2)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Carica Fattura (PDF) *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      handleInvoiceUpload(file);
                    }
                  }}
                  className="hidden"
                  id="invoice-upload"
                  disabled={uploadingInvoice}
                  required
                />
                <label htmlFor="invoice-upload" className={`cursor-pointer ${uploadingInvoice ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <FaUpload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    {uploadingInvoice ? 'Caricamento in corso...' : (invoiceFile ? invoiceFile.name : 'Clicca per caricare la fattura PDF')}
                  </p>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Il caricamento di una fattura o ricevuta PDF è obbligatorio per richiedere il pagamento.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowPayoutModal(false)}>
                Annulla
              </Button>
              <Button
                variant="primary"
                onClick={handlePayoutRequest}
                disabled={!invoicePath || !payoutAmount || parseFloat(payoutAmount) <= 0}
              >
                Invia Richiesta
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default EarningsInvoices;


import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const TransactionHistory = () => {
  const { user, token, apiBase } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Cronologia Transazioni</h1>
        <p className="text-gray-600">Visualizza tutte le tue transazioni di credito e la cronologia dei pagamenti</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <p className="text-sm text-gray-600 mb-1">Ricariche Totali</p>
          <p className="text-2xl font-bold text-gray-900">
            €{Number(transactions
              .filter(t => t.type === 'topup')
              .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0)).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <p className="text-sm text-gray-600 mb-1">Bonus Totali</p>
          <p className="text-2xl font-bold text-gray-900">
            €{Number(transactions
              .filter(t => t.type === 'bonus')
              .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0)).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <p className="text-sm text-gray-600 mb-1">Saldo Attuale</p>
          <p className="text-2xl font-bold text-green-600">
            €{Number(user.credits || 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            Nessuna transazione ancora.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrizione</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consulente</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Importo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metodo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(tx.created_at).toLocaleString('it-IT')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="capitalize">{tx.type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {tx.description || '---'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {tx.consultant ? tx.consultant.name : '---'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">
                    <span className={tx.amount < 0 ? 'text-red-600' : 'text-green-600'}>
                      {tx.amount < 0 ? '-' : '+'}€{Math.abs(Number(tx.amount || 0)).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tx.method || '---'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${tx.status === 'succeeded' || tx.status === 'completed' ? 'bg-green-100 text-green-800' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                      {tx.status || '---'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TransactionHistory;


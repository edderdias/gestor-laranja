import React from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tables } from "@/integrations/supabase/types";

type CreditCardTransactionWithGeneratedFlag = Tables<'credit_card_transactions'> & {
  is_generated_fixed_instance?: boolean;
  expense_categories?: { name: string } | null;
  responsible_persons?: { name: string } | null;
};

interface PrintStatementProps {
  transactions: CreditCardTransactionWithGeneratedFlag[];
  cardName: string;
  monthYear: string;
}

export const PrintStatementComponent = React.forwardRef<HTMLDivElement, PrintStatementProps>(({
  transactions,
  cardName,
  monthYear,
}, ref) => {
  const formattedMonthYear = format(parseISO(`${monthYear}-01`), "MMMM yyyy", { locale: ptBR });

  const totalGeneralAmount = transactions.reduce((sum, transaction) => {
    return sum + transaction.amount;
  }, 0);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, "dd/MM/yyyy") : "N/A";
  };

  return (
    <div ref={ref} className="p-8 bg-white text-slate-900 font-sans min-h-[297mm]">
      {/* Header Section */}
      <div className="flex justify-between items-start border-b-2 border-slate-200 pb-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Extrato do Cartão: {cardName}</h1>
          <p className="text-slate-500 font-medium">Mês de Referência: <span className="text-slate-800 capitalize">{formattedMonthYear}</span></p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Geral</p>
          <p className="text-3xl font-black text-red-600">R$ {totalGeneralAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200">
              <th className="py-3 px-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Data</th>
              <th className="py-3 px-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Descrição</th>
              <th className="py-3 px-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Categoria</th>
              <th className="py-3 px-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Responsável</th>
              <th className="py-3 px-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Valor</th>
              <th className="py-3 px-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Parcela</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.length > 0 ? (
              transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">
                    {formatDate(transaction.purchase_date)}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-slate-800">
                    {transaction.description}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {transaction.expense_categories?.name || "N/A"}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {transaction.responsible_persons?.name || "N/A"}
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-red-600 text-right whitespace-nowrap">
                    R$ {transaction.amount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500 text-right whitespace-nowrap">
                    {transaction.is_fixed ? "Fixo" : `${transaction.current_installment || 1}/${transaction.installments || 1}`}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                  Nenhum lançamento encontrado para este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="mt-12 pt-6 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between">
        <p>Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
        <p>Método Certo - Gestão Financeira Familiar</p>
      </div>
    </div>
  );
});

PrintStatementComponent.displayName = "PrintStatementComponent";
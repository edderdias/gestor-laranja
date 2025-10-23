import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tables } from "@/integrations/supabase/types";

type CreditCardTransactionWithGeneratedFlag = Tables<'credit_card_transactions'> & {
  is_generated_fixed_instance?: boolean;
  expense_categories?: Tables<'expense_categories'>;
  responsible_persons?: Tables<'responsible_persons'>;
};

interface PrintStatementProps {
  transactions: CreditCardTransactionWithGeneratedFlag[];
  cardName: string;
  monthYear: string;
  printType: 'general' | 'byResponsiblePerson';
}

export const PrintStatementComponent: React.FC<PrintStatementProps> = ({
  transactions,
  cardName,
  monthYear,
  printType,
}) => {
  const formattedMonthYear = format(parseISO(`${monthYear}-01`), "MMMM yyyy", { locale: ptBR });

  // Group transactions by responsible person for 'byResponsiblePerson' print type
  const groupedTransactions = React.useMemo(() => {
    if (printType !== 'byResponsiblePerson') return {};
    return transactions.reduce((acc, transaction) => {
      const responsiblePersonName = transaction.responsible_persons?.name || "Não Atribuído";
      if (!acc[responsiblePersonName]) {
        acc[responsiblePersonName] = [];
      }
      acc[responsiblePersonName].push(transaction);
      return acc;
    }, {} as Record<string, CreditCardTransactionWithGeneratedFlag[]>);
  }, [transactions, printType]);

  return (
    <div className="p-6 print-only"> {/* 'print-only' class will control visibility via CSS */}
      <h1 className="text-2xl font-bold mb-4">Extrato do Cartão: {cardName}</h1>
      <h2 className="text-xl font-semibold mb-6">Mês de Referência: {formattedMonthYear}</h2>

      {printType === 'general' ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 text-left">Data</th>
              <th className="py-2 text-left">Descrição</th>
              <th className="py-2 text-left">Categoria</th>
              <th className="py-2 text-left">Responsável</th>
              <th className="py-2 text-right">Valor</th>
              <th className="py-2 text-right">Parcela</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="border-b border-gray-200 last:border-b-0">
                <td className="py-2">{format(new Date(transaction.purchase_date), "dd/MM/yyyy")}</td>
                <td className="py-2">{transaction.description}</td>
                <td className="py-2">{(transaction.expense_categories as Tables<'expense_categories'>)?.name || "N/A"}</td>
                <td className="py-2">{(transaction.responsible_persons as Tables<'responsible_persons'>)?.name || "N/A"}</td>
                <td className="py-2 text-right">R$ {transaction.amount.toFixed(2)}</td>
                <td className="py-2 text-right">
                  {transaction.is_fixed ? "Fixo" : `${transaction.current_installment}/${transaction.installments}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        // printType === 'byResponsiblePerson'
        <div>
          {Object.entries(groupedTransactions).map(([personName, personTransactions]) => (
            <div key={personName} className="mb-8">
              <h3 className="text-xl font-bold mb-4">Responsável: {personName}</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="py-2 text-left">Data</th>
                    <th className="py-2 text-left">Descrição</th>
                    <th className="py-2 text-left">Categoria</th>
                    <th className="py-2 text-right">Valor</th>
                    <th className="py-2 text-right">Parcela</th>
                  </tr>
                </thead>
                <tbody>
                  {personTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-gray-200 last:border-b-0">
                      <td className="py-2">{format(new Date(transaction.purchase_date), "dd/MM/yyyy")}</td>
                      <td className="py-2">{transaction.description}</td>
                      <td className="py-2">{(transaction.expense_categories as Tables<'expense_categories'>)?.name || "N/A"}</td>
                      <td className="py-2 text-right">R$ {transaction.amount.toFixed(2)}</td>
                      <td className="py-2 text-right">
                        {transaction.is_fixed ? "Fixo" : `${transaction.current_installment}/${transaction.installments}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
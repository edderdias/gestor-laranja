import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, isSameMonth, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
import { MonthlyIncomeChart } from "@/components/charts/MonthlyIncomeChart";
import { ResponsiblePersonExpensesChart } from "@/components/charts/ResponsiblePersonExpensesChart";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, CreditCard } from "lucide-react";

export default function Dashboard() {
  const { familyMemberIds, user } = useAuth();
  const today = new Date();
  
  const effectiveIds = familyMemberIds.length > 0 ? familyMemberIds : (user?.id ? [user.id] : []);

  const { data: accountsPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), responsible_persons(name)")
        .in("created_by", effectiveIds);
      if (error) throw error;
      return data;
    },
    enabled: effectiveIds.length > 0,
  });

  const { data: accountsReceivable } = useQuery({
    queryKey: ["dashboard-accounts-receivable", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*")
        .in("created_by", effectiveIds);
      if (error) throw error;
      return data;
    },
    enabled: effectiveIds.length > 0,
  });

  const { data: creditCards } = useQuery({
    queryKey: ["dashboard-credit-cards", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .in("created_by", effectiveIds);
      if (error) throw error;
      return data;
    },
    enabled: effectiveIds.length > 0,
  });

  // Cálculos para os cards
  const stats = useMemo(() => {
    const currentMonthIncome = accountsReceivable?.filter(a => isSameMonth(parseISO(a.receive_date), today)) || [];
    const currentMonthExpenses = accountsPayable?.filter(a => isSameMonth(parseISO(a.due_date), today)) || [];

    const received = currentMonthIncome.filter(a => a.received).reduce((sum, a) => sum + a.amount, 0);
    const totalIncomeForecast = currentMonthIncome.reduce((sum, a) => sum + a.amount, 0);
    
    const paid = currentMonthExpenses.filter(a => a.paid).reduce((sum, a) => sum + a.amount, 0);
    const openExpenses = currentMonthExpenses.filter(a => !a.paid).reduce((sum, a) => sum + a.amount, 0);

    const cardExpenses = currentMonthExpenses
      .filter(a => a.payment_type_id && a.card_id) // Simplificação: assume que se tem card_id é gasto de cartão
      .reduce((sum, a) => sum + a.amount, 0);

    return {
      received,
      incomeCount: currentMonthIncome.filter(a => a.received).length,
      incomeForecast: totalIncomeForecast,
      paid,
      expenseCount: currentMonthExpenses.filter(a => a.paid).length,
      openExpenses,
      balance: received - paid,
      cardExpenses,
      cardCount: creditCards?.length || 0
    };
  }, [accountsReceivable, accountsPayable, creditCards, today]);

  const categoryData = useMemo(() => {
    if (!accountsPayable) return [];
    const currentMonthExpenses = accountsPayable.filter(a => isSameMonth(parseISO(a.due_date), today));
    const categories: Record<string, number> = {};
    currentMonthExpenses.forEach(exp => {
      const catName = (exp.expense_categories as any)?.name || "Outros";
      categories[catName] = (categories[catName] || 0) + exp.amount;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [accountsPayable, today]);

  const responsibleData = useMemo(() => {
    if (!accountsPayable) return [];
    const currentMonthExpenses = accountsPayable.filter(a => isSameMonth(parseISO(a.due_date), today));
    const persons: Record<string, number> = {};
    currentMonthExpenses.forEach(exp => {
      const personName = (exp.responsible_persons as any)?.name || "Não Atribuído";
      persons[personName] = (persons[personName] || 0) + exp.amount;
    });
    return Object.entries(persons).map(([name, value]) => ({ name, value }));
  }, [accountsPayable, today]);

  const monthlyExpenseData = useMemo(() => {
    if (!accountsPayable) return [];
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(today, i);
      const monthLabel = format(monthDate, "MMM", { locale: ptBR });
      const total = accountsPayable
        .filter(a => isSameMonth(parseISO(a.due_date), monthDate))
        .reduce((sum, a) => sum + a.amount, 0);
      months.push({ month: monthLabel, total });
    }
    return months;
  }, [accountsPayable, today]);

  const monthlyIncomeData = useMemo(() => {
    if (!accountsReceivable) return [];
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(today, i);
      const monthLabel = format(monthDate, "MMM", { locale: ptBR });
      const total = accountsReceivable
        .filter(a => isSameMonth(parseISO(a.receive_date), monthDate))
        .reduce((sum, a) => sum + a.amount, 0);
      months.push({ month: monthLabel, total });
    }
    return months;
  }, [accountsReceivable, today]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        {/* Cards Superiores conforme Imagem 1 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-green-50/50 border-green-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-green-600 mb-1">Receitas do Mês</p>
              <h2 className="text-3xl font-bold text-green-600 mb-4">R$ {stats.received.toFixed(2)}</h2>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-green-600"><TrendingUp className="h-3 w-3" /> {stats.incomeCount} recebimentos</span>
                <span>Previsão: R$ {stats.incomeForecast.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-red-50/50 border-red-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-red-600 mb-1">Despesas do Mês</p>
              <h2 className="text-3xl font-bold text-red-600 mb-4">R$ {stats.paid.toFixed(2)}</h2>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-red-600"><TrendingDown className="h-3 w-3" /> {stats.expenseCount} pagamentos</span>
                <span>Em Aberto: R$ {stats.openExpenses.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50/50 border-blue-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-blue-600 mb-1">Saldo</p>
              <h2 className="text-3xl font-bold text-green-600 mb-4">R$ {stats.balance.toFixed(2)}</h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" /> Disponível
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-600 mb-1">Gastos de Cartão (Mês)</p>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">R$ {stats.cardExpenses.toFixed(2)}</h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CreditCard className="h-3 w-3" /> {stats.cardCount} cartões
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <MonthlyExpensesChart data={monthlyExpenseData} />
          <MonthlyIncomeChart data={monthlyIncomeData} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryExpensesChart data={categoryData} />
          <ResponsiblePersonExpensesChart data={responsibleData} />
        </div>
      </main>
    </div>
  );
}
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, isSameMonth, format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
import { useMemo } from "react";

export default function Dashboard() {
  const { familyMemberIds, user } = useAuth();
  const today = new Date();
  
  // Garante que sempre temos ao menos o ID do usuário atual para a busca inicial
  const effectiveIds = familyMemberIds.length > 0 ? familyMemberIds : (user?.id ? [user.id] : []);

  const { data: accountsPayable, isLoading: loadingPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name)")
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

  const totalIncome = useMemo(() => 
    accountsReceivable?.filter(a => isSameMonth(parseISO(a.receive_date), today))
      .reduce((sum, a) => sum + a.amount, 0) || 0
  , [accountsReceivable, today]);

  const totalExpenses = useMemo(() => 
    accountsPayable?.filter(a => isSameMonth(parseISO(a.due_date), today))
      .reduce((sum, a) => sum + a.amount, 0) || 0
  , [accountsPayable, today]);

  // Dados para o gráfico de categorias
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

  // Dados para o gráfico mensal (últimos 6 meses)
  const monthlyData = useMemo(() => {
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

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-income-light border-income/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-income">Receitas (Mês)</CardDescription>
              <CardTitle className="text-2xl text-income">R$ {totalIncome.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-expense-light border-expense/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-expense">Despesas (Mês)</CardDescription>
              <CardTitle className="text-2xl text-expense">R$ {totalExpenses.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saldo</CardDescription>
              <CardTitle className="text-2xl">R$ {(totalIncome - totalExpenses).toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Status</CardDescription>
              <CardTitle className="text-2xl">{loadingPayable ? "Carregando..." : "Atualizado"}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlyExpensesChart data={monthlyData} />
          <CategoryExpensesChart data={categoryData} />
        </div>
      </main>
    </div>
  );
}
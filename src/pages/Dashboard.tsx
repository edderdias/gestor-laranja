import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, CreditCard, Wallet, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, getMonth, getYear, isSameMonth, isSameYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
import { ResponsiblePersonExpensesChart } from "@/components/charts/ResponsiblePersonExpensesChart";
import { MonthlyIncomeChart } from "@/components/charts/MonthlyIncomeChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const { user, familyMemberIds, isFamilySchemaReady } = useAuth();
  const today = new Date();

  const { data: accountsPayable, isLoading: isLoadingPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), payment_types(name), responsible_persons(name)")
        .in("created_by", familyMemberIds);
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  const { data: accountsReceivable, isLoading: isLoadingReceivable } = useQuery({
    queryKey: ["dashboard-accounts-receivable", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_types(name)")
        .in("created_by", familyMemberIds);
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  const { data: creditCards } = useQuery({
    queryKey: ["dashboard-credit-cards", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id")
        .in("created_by", familyMemberIds);
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  const isLoading = isLoadingPayable || isLoadingReceivable;

  // Cálculos de resumo
  const totalIncome = accountsReceivable?.filter(a => a.received && isSameMonth(parseISO(a.receive_date), today)).reduce((sum, a) => sum + a.amount, 0) || 0;
  const totalExpenses = accountsPayable?.filter(a => a.paid && isSameMonth(parseISO(a.due_date), today)).reduce((sum, a) => sum + a.amount, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        {!isFamilySchemaReady && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Aviso de Configuração</AlertTitle>
            <AlertDescription>
              A identificação de família não foi encontrada. O sistema está mostrando apenas seus dados individuais.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-income-light border-income/20">
            <CardHeader className="pb-2"><CardDescription className="text-income">Receitas (Mês)</CardDescription><CardTitle className="text-2xl text-income">R$ {totalIncome.toFixed(2)}</CardTitle></CardHeader>
          </Card>
          <Card className="bg-expense-light border-expense/20">
            <CardHeader className="pb-2"><CardDescription className="text-expense">Despesas (Mês)</CardDescription><CardTitle className="text-2xl text-expense">R$ {totalExpenses.toFixed(2)}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Saldo</CardDescription><CardTitle className="text-2xl">R$ {(totalIncome - totalExpenses).toFixed(2)}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Cartões</CardDescription><CardTitle className="text-2xl">{creditCards?.length || 0}</CardTitle></CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlyExpensesChart data={[]} />
          <CategoryExpensesChart data={[]} />
        </div>
      </main>
    </div>
  );
}
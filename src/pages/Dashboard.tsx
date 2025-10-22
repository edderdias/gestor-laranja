import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  CreditCard, 
  Wallet,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, getMonth, getYear, isSameMonth, isSameYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
import { Tables } from "@/integrations/supabase/types"; // Importar tipos do Supabase

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date();
  const currentMonth = getMonth(today);
  const currentYear = getYear(today);

  // Fetch current user's profile to check family status
  const { data: userProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, is_family_member, invited_by_user_id")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Determine which user IDs to fetch data for
  const userIdsToFetch = [user?.id];
  if (userProfile?.is_family_member && userProfile?.invited_by_user_id) {
    userIdsToFetch.push(userProfile.invited_by_user_id);
  }

  // Fetch all necessary data for the dashboard
  const { data: accountsPayable, isLoading: isLoadingPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", userIdsToFetch],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), payment_types(name)")
        .in("created_by", userIdsToFetch); // Fetch for all relevant user IDs
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !isLoadingProfile,
  });

  const { data: accountsReceivable, isLoading: isLoadingReceivable } = useQuery({
    queryKey: ["dashboard-accounts-receivable", userIdsToFetch],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_types(name)")
        .in("created_by", userIdsToFetch); // Fetch for all relevant user IDs
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !isLoadingProfile,
  });

  const { data: creditCards, isLoading: isLoadingCreditCards } = useQuery({
    queryKey: ["dashboard-credit-cards", userIdsToFetch],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id, credit_limit")
        .in("created_by", userIdsToFetch); // Fetch for all relevant user IDs
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !isLoadingProfile,
  });

  const isLoading = isLoadingPayable || isLoadingReceivable || isLoadingCreditCards || isLoadingProfile;

  // Process data for summary cards and charts
  let totalConfirmedMonthlyIncome = 0;
  let monthlyIncomeForecast = 0;
  let numIncomeTransactions = 0;

  let totalConfirmedMonthlyExpenses = 0;
  let monthlyExpensesForecast = 0;
  let numExpenseTransactions = 0;

  let totalMonthlyCreditCardDebits = 0;
  let numCreditCards = 0;

  const monthlyPaidExpensesChartDataMap = new Map<string, number>();
  const categoryPaidExpensesChartDataMap = new Map<string, number>();

  if (accountsPayable) {
    accountsPayable.forEach(account => {
      const amount = account.amount * (account.installments || 1);
      const dueDate = parseISO(account.due_date);

      if (isSameMonth(dueDate, today) && isSameYear(dueDate, today)) {
        if (account.paid) {
          totalConfirmedMonthlyExpenses += amount;
          numExpenseTransactions++;

          // For charts, only use paid expenses
          const monthKey = format(dueDate, "MMM/yyyy", { locale: ptBR });
          monthlyPaidExpensesChartDataMap.set(monthKey, (monthlyPaidExpensesChartDataMap.get(monthKey) || 0) + amount);

          if (account.expense_categories) {
            const categoryName = account.expense_categories.name;
            categoryPaidExpensesChartDataMap.set(categoryName, (categoryPaidExpensesChartDataMap.get(categoryName) || 0) + amount);
          }
        } else {
          monthlyExpensesForecast += amount;
        }

        // Credit card debits for the month (only if paid)
        if (account.card_id && account.paid) {
          totalMonthlyCreditCardDebits += amount;
        }
      }
    });
  }

  if (accountsReceivable) {
    accountsReceivable.forEach(account => {
      const amount = account.amount * (account.installments || 1);
      const receiveDate = parseISO(account.receive_date);

      if (isSameMonth(receiveDate, today) && isSameYear(receiveDate, today)) {
        if (account.received) {
          totalConfirmedMonthlyIncome += amount;
          numIncomeTransactions++;
        } else {
          monthlyIncomeForecast += amount;
        }
      }
    });
  }

  if (creditCards) {
    numCreditCards = creditCards.length;
  }

  const balance = totalConfirmedMonthlyIncome - totalConfirmedMonthlyExpenses;

  const monthlyExpensesChartData = Array.from(monthlyPaidExpensesChartDataMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => parseISO(`01-${a.month.replace('/', '-')}`).getTime() - parseISO(`01-${b.month.replace('/', '-')}`).getTime());

  const categoryExpensesChartData = Array.from(categoryPaidExpensesChartDataMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        {/* Cards de Resumo */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-income/20 bg-income-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-income">Receitas do Mês</CardDescription>
              <CardTitle className="text-3xl text-income">
                {isLoading ? "Carregando..." : `R$ ${totalConfirmedMonthlyIncome.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-income">
                <TrendingUp className="h-4 w-4" />
                <span>{numIncomeTransactions} recebimentos</span>
                {monthlyIncomeForecast > 0 && (
                  <span className="ml-auto text-muted-foreground">Previsão: R$ {monthlyIncomeForecast.toFixed(2)}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-expense/20 bg-expense-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-expense">Despesas do Mês</CardDescription>
              <CardTitle className="text-3xl text-expense">
                {isLoading ? "Carregando..." : `R$ ${totalConfirmedMonthlyExpenses.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-expense">
                <TrendingDown className="h-4 w-4" />
                <span>{numExpenseTransactions} pagamentos</span>
                {monthlyExpensesForecast > 0 && (
                  <span className="ml-auto text-muted-foreground">Previsão: R$ {monthlyExpensesForecast.toFixed(2)}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral/20 bg-neutral-light">
            <CardHeader className="pb-3">
              <CardDescription>Saldo</CardDescription>
              <CardTitle className="text-3xl" style={{ color: balance >= 0 ? 'hsl(var(--income))' : 'hsl(var(--expense))' }}>
                {isLoading ? "Carregando..." : `R$ ${balance.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span>Disponível</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Cartões de Crédito</CardDescription>
              <CardTitle className="text-3xl">
                {isLoading ? "Carregando..." : `R$ ${totalMonthlyCreditCardDebits.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span>{numCreditCards} cartões</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <MonthlyExpensesChart data={monthlyExpensesChartData} />
          <CategoryExpensesChart data={categoryExpensesChartData} />
        </div>

        {/* Menu de Navegação */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link to="/accounts-payable">
            <Card className="hover:border-expense transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-expense/10 p-3 rounded-lg">
                    <ArrowDownCircle className="h-6 w-6 text-expense" />
                  </div>
                  <div>
                    <CardTitle>Contas a Pagar</CardTitle>
                    <CardDescription>Gerenciar despesas</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/accounts-receivable">
            <Card className="hover:border-income transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-income/10 p-3 rounded-lg">
                    <ArrowUpCircle className="h-6 w-6 text-income" />
                  </div>
                  <div>
                    <CardTitle>Contas a Receber</CardTitle>
                    <CardDescription>Gerenciar receitas</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/credit-cards">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Cartões de Crédito</CardTitle>
                    <CardDescription>Transações de cartão</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
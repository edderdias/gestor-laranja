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
import { format, parseISO, getMonth, getYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
// import { ResponsiblePartyExpensesChart } from "@/components/charts/ResponsiblePartyExpensesChart"; // Removido

export default function Dashboard() {
  const { user } = useAuth();
  const currentMonth = getMonth(new Date());
  const currentYear = getYear(new Date());

  // Fetch all necessary data for the dashboard
  const { data: accountsPayable, isLoading: isLoadingPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name)") // Removido responsible_parties(name)
        .eq("created_by", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: accountsReceivable, isLoading: isLoadingReceivable } = useQuery({
    queryKey: ["dashboard-accounts-receivable", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*")
        .eq("created_by", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: creditCards, isLoading: isLoadingCreditCards } = useQuery({
    queryKey: ["dashboard-credit-cards", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id, credit_limit")
        .eq("created_by", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const isLoading = isLoadingPayable || isLoadingReceivable || isLoadingCreditCards;

  // Process data for summary cards and charts
  let totalMonthlyIncome = 0;
  let totalMonthlyExpenses = 0;
  let totalCreditCardUsage = 0;
  let totalCreditLimit = 0;
  let numIncomeTransactions = 0;
  let numExpenseTransactions = 0;

  const monthlyExpensesMap = new Map<string, number>();
  const categoryExpensesMap = new Map<string, number>();
  // const responsiblePartyExpensesMap = new Map<string, number>(); // Removido

  if (accountsPayable) {
    accountsPayable.forEach(account => {
      const amount = account.amount * (account.installments || 1);
      const dueDate = parseISO(account.due_date);

      // Monthly expenses for current month
      if (getMonth(dueDate) === currentMonth && getYear(dueDate) === currentYear) {
        totalMonthlyExpenses += amount;
        numExpenseTransactions++;
      }

      // Monthly expenses for chart
      const monthKey = format(dueDate, "MMM/yyyy", { locale: ptBR });
      monthlyExpensesMap.set(monthKey, (monthlyExpensesMap.get(monthKey) || 0) + amount);

      // Category expenses for chart
      if (account.expense_categories) {
        const categoryName = account.expense_categories.name;
        categoryExpensesMap.set(categoryName, (categoryExpensesMap.get(categoryName) || 0) + amount);
      }

      // Responsible party expenses for chart - REMOVIDO
      // if (account.responsible_parties) {
      //   const responsibleName = account.responsible_parties.name;
      //   responsiblePartyExpensesMap.set(responsibleName, (responsiblePartyExpensesMap.get(responsibleName) || 0) + amount);
      // }

      // Credit card usage
      if (account.payment_type === "cartao") {
        totalCreditCardUsage += amount;
      }
    });
  }

  if (accountsReceivable) {
    accountsReceivable.forEach(account => {
      const amount = account.amount * (account.installments || 1);
      const receiveDate = parseISO(account.receive_date);

      // Monthly income for current month
      if (getMonth(receiveDate) === currentMonth && getYear(receiveDate) === currentYear) {
        totalMonthlyIncome += amount;
        numIncomeTransactions++;
      }
    });
  }

  if (creditCards) {
    creditCards.forEach(card => {
      totalCreditLimit += card.credit_limit || 0;
    });
  }

  const balance = totalMonthlyIncome - totalMonthlyExpenses;

  const monthlyExpensesChartData = Array.from(monthlyExpensesMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => parseISO(`01-${a.month.replace('/', '-')}`).getTime() - parseISO(`01-${b.month.replace('/', '-')}`).getTime());

  const categoryExpensesChartData = Array.from(categoryExpensesMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // const responsiblePartyExpensesChartData = Array.from(responsiblePartyExpensesMap.entries()) // Removido
  //   .map(([name, total]) => ({ name, total }))
  //   .sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen bg-background">
      {/* Header removido, agora gerenciado por MainLayout */}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Cards de Resumo */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-income/20 bg-income-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-income">Receitas do Mês</CardDescription>
              <CardTitle className="text-3xl text-income">
                {isLoading ? "Carregando..." : `R$ ${totalMonthlyIncome.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-income">
                <TrendingUp className="h-4 w-4" />
                <span>{numIncomeTransactions} recebimentos</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-expense/20 bg-expense-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-expense">Despesas do Mês</CardDescription>
              <CardTitle className="text-3xl text-expense">
                {isLoading ? "Carregando..." : `R$ ${totalMonthlyExpenses.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-expense">
                <TrendingDown className="h-4 w-4" />
                <span>{numExpenseTransactions} pagamentos</span>
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
                {isLoading ? "Carregando..." : `R$ ${totalCreditCardUsage.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span>{creditCards?.length || 0} cartões</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <MonthlyExpensesChart data={monthlyExpensesChartData} />
          <CategoryExpensesChart data={categoryExpensesChartData} />
          {/* <ResponsiblePartyExpensesChart data={responsiblePartyExpensesChartData} /> */} {/* Removido */}
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
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  CreditCard, 
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank as PiggyBankIcon, // Importar PiggyBankIcon
  CalendarIcon // Importar CalendarIcon
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, getMonth, getYear, isSameMonth, isSameYear, subMonths, addMonths, endOfMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MonthlyExpensesChart } from "@/components/charts/MonthlyExpensesChart";
import { CategoryExpensesChart } from "@/components/charts/CategoryExpensesChart";
import { ResponsiblePersonExpensesChart } from "@/components/charts/ResponsiblePersonExpensesChart"; // Novo gráfico
import { MonthlyIncomeChart } from "@/components/charts/MonthlyIncomeChart"; // Novo gráfico
import { Tables } from "@/integrations/supabase/types"; // Importar tipos do Supabase

// Imports para o formulário de transferência
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Importar Select

// Esquema de validação para o formulário de transferência para o cofrinho
const transferToPiggyBankSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  entry_date: z.date({ required_error: "Data é obrigatória" }),
  bank_id: z.string().min(1, "Banco é obrigatório"), // Alterado para obrigatório
});

type TransferToPiggyBankFormData = z.infer<typeof transferToPiggyBankSchema>;

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date();
  const currentMonth = getMonth(today);
  const currentYear = getYear(today);

  const [isTransferFormOpen, setIsTransferForm] = useState(false);

  const transferForm = useForm<TransferToToPiggyBankFormData>({
    resolver: zodResolver(transferToPiggyBankSchema),
    defaultValues: {
      description: "",
      amount: 0,
      entry_date: today,
      bank_id: "", // Valor padrão vazio para campo obrigatório
    },
  });

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

  // Fetch payment types to identify credit card payment type
  const { data: paymentTypes, isLoading: isLoadingPaymentTypes } = useQuery({
    queryKey: ["payment-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_types")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const creditCardPaymentTypeId = paymentTypes?.find(pt => pt.name === "cartao")?.id;

  // Fetch all necessary data for the dashboard
  const { data: accountsPayable, isLoading: isLoadingPayable } = useQuery({
    queryKey: ["dashboard-accounts-payable", userIdsToFetch],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), payment_types(name), responsible_persons(name)") // Adicionado responsible_persons
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

  // Fetch all credit card transactions to calculate total used limit (no filter by responsible person)
  const { data: allCreditCardTransactions, isLoading: isLoadingAllCreditCardTransactions } = useQuery({
    queryKey: ["all-credit-card-transactions", userIdsToFetch],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("amount, purchase_date, responsible_persons(is_principal, name)") // Incluir dados do responsável e nome
        .in("created_by", userIdsToFetch);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !isLoadingProfile,
  });

  // Buscar bancos
  const { data: banks, isLoading: isLoadingBanks } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banks")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  const isLoading = isLoadingPayable || isLoadingReceivable || isLoadingCreditCards || isLoadingProfile || isLoadingBanks || isLoadingAllCreditCardTransactions || isLoadingPaymentTypes;

  // Process data for summary cards and charts
  let totalConfirmedMonthlyIncome = 0;
  let monthlyIncomeForecast = 0;
  let numIncomeTransactions = 0;

  let totalConfirmedMonthlyExpensesNonCreditCard = 0; // Renomeado para evitar dupla contagem
  let monthlyExpensesForecast = 0;
  let numExpenseTransactions = 0;

  // Calculate total used credit card limit for the CURRENT MONTH
  let totalCreditCardUsedLimit = 0;
  if (allCreditCardTransactions) {
    totalCreditCardUsedLimit = allCreditCardTransactions.reduce((sum, transaction) => {
      const transactionDate = parseISO(transaction.purchase_date); // Parse purchase_date
      // Soma apenas se a transação for do mês atual E o responsável for principal
      if (
        isSameMonth(transactionDate, today) && 
        isSameYear(transactionDate, today) &&
        (transaction.responsible_persons as Tables<'responsible_persons'>)?.is_principal === true
      ) {
        return sum + transaction.amount; // Soma o valor da parcela individual para o mês atual
      }
      return sum;
    }, 0);
  }

  let numCreditCards = 0;

  const monthlyPaidExpensesChartDataMap = new Map<string, number>();
  const categoryPaidExpensesChartDataMap = new Map<string, number>();
  const responsiblePersonExpensesChartDataMap = new Map<string, number>(); // Novo mapa para gastos por responsável
  const monthlyIncomeChartDataMap = new Map<string, number>(); // Novo mapa para ganhos mensais

  // Data para os últimos 6 meses (incluindo o atual) para o gráfico de ganhos mensais
  const sixMonthsAgo = subMonths(today, 5); // 5 meses atrás + mês atual = 6 meses

  if (accountsPayable && creditCardPaymentTypeId !== undefined) { // Ensure creditCardPaymentTypeId is available
    accountsPayable.forEach(account => {
      // Usar account.amount que já é o valor da parcela
      const installmentAmount = account.amount; 
      const dueDate = parseISO(account.due_date);

      if (isSameMonth(dueDate, today) && isSameYear(dueDate, today)) {
        if (account.paid) {
          // Only add to totalConfirmedMonthlyExpensesNonCreditCard if NOT paid by credit card
          if (account.payment_type_id !== creditCardPaymentTypeId) {
            totalConfirmedMonthlyExpensesNonCreditCard += installmentAmount;
            numExpenseTransactions++;

            // For charts, only use paid expenses NOT by credit card
            const monthKey = format(dueDate, "MMM/yyyy", { locale: ptBR });
            monthlyPaidExpensesChartDataMap.set(monthKey, (monthlyPaidExpensesChartDataMap.get(monthKey) || 0) + installmentAmount);

            if (account.expense_categories) {
              const categoryName = account.expense_categories.name;
              categoryPaidExpensesChartDataMap.set(categoryName, (categoryPaidExpensesChartDataMap.get(categoryName) || 0) + installmentAmount);
            }
          }
        } else {
          // Forecast should still include all unpaid accounts payable
          monthlyExpensesForecast += installmentAmount;
        }
      }

      // Adicionar gastos por responsável (contas a pagar) para o mês atual
      if (isSameMonth(dueDate, today) && isSameYear(dueDate, today) && account.paid) {
        const responsiblePersonName = (account.responsible_persons as Tables<'responsible_persons'>)?.name || "Não Atribuído";
        responsiblePersonExpensesChartDataMap.set(responsiblePersonName, (responsiblePersonExpensesChartDataMap.get(responsiblePersonName) || 0) + installmentAmount);
      }
    });
  }

  // Adicionar gastos por responsável (transações de cartão) para o mês atual
  if (allCreditCardTransactions) {
    allCreditCardTransactions.forEach(transaction => {
      const transactionDate = parseISO(transaction.purchase_date);
      if (isSameMonth(transactionDate, today) && isSameYear(transactionDate, today)) {
        const responsiblePersonName = (transaction.responsible_persons as Tables<'responsible_persons'>)?.name || "Não Atribuído";
        responsiblePersonExpensesChartDataMap.set(responsiblePersonName, (responsiblePersonExpensesChartDataMap.get(responsiblePersonName) || 0) + transaction.amount);
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

      // Adicionar ganhos mensais para o gráfico de ganhos mensais (últimos 6 meses)
      if (receiveDate >= sixMonthsAgo && receiveDate <= endOfMonth(today) && account.received) {
        const monthKey = format(receiveDate, "MMM/yyyy", { locale: ptBR });
        monthlyIncomeChartDataMap.set(monthKey, (monthlyIncomeChartDataMap.get(monthKey) || 0) + amount);
      }
    });
  }

  if (creditCards) {
    numCreditCards = creditCards.length;
  }

  // Calculate total monthly expenses (only non-credit card accounts payable)
  const totalMonthlyExpenses = totalConfirmedMonthlyExpensesNonCreditCard;

  const balance = totalConfirmedMonthlyIncome - totalMonthlyExpenses;

  const monthlyExpensesChartData = Array.from(monthlyPaidExpensesChartDataMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => parseISO(`01-${a.month.replace('/', '-')}`).getTime() - parseISO(`01-${b.month.replace('/', '-')}`).getTime());

  const categoryExpensesChartData = Array.from(categoryPaidExpensesChartDataMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const responsiblePersonExpensesChartData = Array.from(responsiblePersonExpensesChartDataMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Preencher meses vazios para o gráfico de ganhos mensais
  const monthlyIncomeChartData: { month: string; total: number }[] = [];
  let dateIterator = startOfMonth(sixMonthsAgo);
  while (dateIterator <= endOfMonth(today)) {
    const monthKey = format(dateIterator, "MMM/yyyy", { locale: ptBR });
    monthlyIncomeChartData.push({
      month: monthKey,
      total: monthlyIncomeChartDataMap.get(monthKey) || 0,
    });
    dateIterator = addMonths(dateIterator, 1);
  }


  // Mutation para transferir para o cofrinho
  const transferToPiggyBankMutation = useMutation({
    mutationFn: async (values: TransferToPiggyBankFormData) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível transferir para o cofrinho.");
        throw new Error("User not authenticated.");
      }

      const entryData = {
        description: values.description,
        amount: values.amount,
        entry_date: format(values.entry_date, "yyyy-MM-dd"),
        type: "deposit" as const, // Sempre um depósito
        user_id: user.id,
        bank_id: values.bank_id, // Incluir bank_id
      };

      const { error } = await supabase
        .from("piggy_bank_entries")
        .insert(entryData);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] }); // Invalida o cache do cofrinho
      toast.success("Valor transferido para o cofrinho com sucesso!");
      setIsTransferForm(false);
      transferForm.reset();
    },
    onError: (error) => {
      toast.error("Erro ao transferir para o cofrinho: " + error.message);
    },
  });

  const onTransferSubmit = (values: TransferToPiggyBankFormData) => {
    transferToPiggyBankMutation.mutate(values);
  };

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
                {isLoading ? "Carregando..." : `R$ ${totalMonthlyExpenses.toFixed(2)}`} {/* Usando totalMonthlyExpenses */}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-expense">
                <TrendingDown className="h-4 w-4" />
                <span>{numExpenseTransactions} pagamentos</span>
                {monthlyExpensesForecast > 0 && (
                  <span className="ml-auto text-muted-foreground">Em Aberto: R$ {monthlyExpensesForecast.toFixed(2)}</span>
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
              <CardDescription>Gastos de Cartão (Mês)</CardDescription>
              <CardTitle className="text-3xl">
                {isLoading ? "Carregando..." : `R$ ${totalCreditCardUsedLimit.toFixed(2)}`}
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
          <ResponsiblePersonExpensesChart data={responsiblePersonExpensesChartData} /> {/* Novo gráfico */}
          <MonthlyIncomeChart data={monthlyIncomeChartData} /> {/* Novo gráfico */}
        </div>
      </main>
    </div>
  );
}
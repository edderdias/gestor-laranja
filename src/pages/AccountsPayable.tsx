import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, CheckCircle, RotateCcw, CalendarIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, getMonth, getYear, subMonths, parseISO, addMonths, endOfMonth, isSameMonth, isSameYear, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tables } from "@/integrations/supabase/types";

// Estender o tipo de conta para incluir a flag de instância gerada
type AccountPayableWithGeneratedFlag = Tables<'accounts_payable'> & {
  is_generated_fixed_instance?: boolean;
};

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  payment_type_id: z.string().min(1, "Tipo de pagamento é obrigatório"),
  card_id: z.string().optional(), // Optional by default, will be conditionally validated
  purchase_date: z.string().optional(),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  installments: z.string().optional(), // Make optional here, refine later
  amount: z.string().min(1, "Valor é obrigatório"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  is_fixed: z.boolean().default(false),
  responsible_person_id: z.string().optional(),
}).superRefine((data, ctx) => {
  // Validação condicional para purchase_date
  if (!data.is_fixed && !data.purchase_date && data.payment_type_id !== "cartao") { // Only require purchase_date if not fixed AND not credit card
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Data da compra é obrigatória para contas não fixas",
      path: ["purchase_date"],
    });
  }
  // Validação condicional para installments
  if (!data.is_fixed && data.payment_type_id !== "cartao") { // Only validate installments if not fixed AND not credit card
    const numInstallments = parseInt(data.installments || "0");
    if (numInstallments < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quantidade de parcelas é obrigatória e deve ser no mínimo 1 para contas não fixas",
        path: ["installments"],
      });
    }
  }
});

type FormData = z.infer<typeof formSchema>;

export default function AccountsPayable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountPayableWithGeneratedFlag | null>(null);
  const queryClient = useQueryClient();

  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));

  // Estados para o diálogo de confirmação de data de pagamento
  const [showConfirmPaidDateDialog, setShowConfirmPaidDateDialog] = useState(false);
  const [currentConfirmingAccount, setCurrentConfirmingAccount] = useState<AccountPayableWithGeneratedFlag | null>(null);
  const [selectedPaidDate, setSelectedPaidDate] = useState<Date | undefined>(new Date());

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      payment_type_id: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      due_date: format(new Date(), "yyyy-MM-dd"),
      installments: "1",
      amount: "",
      category_id: "",
      is_fixed: false,
      responsible_person_id: undefined,
    },
  });

  const selectedPaymentTypeId = form.watch("payment_type_id");
  const isFixed = form.watch("is_fixed");
  const selectedCardId = form.watch("card_id");
  const selectedDueDate = form.watch("due_date");

  // Encontrar o ID do tipo de pagamento "cartao"
  const { data: paymentTypes, isLoading: isLoadingPaymentTypes } = useQuery({
    queryKey: ["payment-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_types")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });
  const creditCardPaymentTypeId = paymentTypes?.find(pt => pt.name === "cartao")?.id;

  // Fetch credit card transactions for the selected card and due date month
  const { data: monthlyCardTransactions, isLoading: isLoadingMonthlyCardTransactions } = useQuery({
    queryKey: ["credit_card_transactions_for_bill", selectedCardId, selectedDueDate],
    queryFn: async () => {
      if (!selectedCardId || !selectedDueDate) return [];

      const billMonthStart = startOfMonth(parseISO(selectedDueDate));
      const billMonthEnd = endOfMonth(parseISO(selectedDueDate));

      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("amount")
        .eq("card_id", selectedCardId)
        .gte("purchase_date", format(billMonthStart, "yyyy-MM-dd"))
        .lte("purchase_date", format(billMonthEnd, "yyyy-MM-dd"));

      if (error) throw error;
      return data;
    },
    enabled: !!selectedCardId && !!selectedDueDate && selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount, // Only enable for new entries
  });

  useEffect(() => {
    if (isFormOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        payment_type_id: editingAccount.payment_type_id || "",
        card_id: editingAccount.card_id || "",
        purchase_date: editingAccount.purchase_date || format(new Date(), "yyyy-MM-dd"),
        due_date: editingAccount.due_date,
        installments: editingAccount.installments?.toString() || "1", // Set to "1" if null/undefined
        amount: editingAccount.amount.toString(),
        category_id: editingAccount.category_id || "",
        is_fixed: editingAccount.is_fixed || false,
        responsible_person_id: editingAccount.responsible_person_id || undefined,
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        payment_type_id: "",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
        due_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        category_id: "",
        is_fixed: false,
        responsible_person_id: undefined,
      });
    }
  }, [isFormOpen, editingAccount, form]);

  // Effect to auto-fill amount and description for credit card bills
  useEffect(() => {
    if (selectedPaymentTypeId === creditCardPaymentTypeId && selectedCardId && selectedDueDate && !editingAccount) {
      if (monthlyCardTransactions) {
        const totalBillAmount = monthlyCardTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
        form.setValue("amount", totalBillAmount.toFixed(2));
        form.setValue("installments", "1"); // Force 1 installment for bill payment
        form.setValue("is_fixed", false); // Bill payment is not fixed
        
        // Suggest description
        const cardName = cards?.find(c => c.id === selectedCardId)?.name || "Cartão";
        const formattedMonth = format(parseISO(selectedDueDate), "MMMM/yyyy", { locale: ptBR });
        form.setValue("description", `Fatura ${cardName} - ${formattedMonth}`);
      }
    } else if (!editingAccount) {
      // Reset amount and description if card/payment type changes or is not credit card
      form.setValue("amount", "");
      form.setValue("description", "");
      form.setValue("installments", "1");
      form.setValue("is_fixed", false);
    }
  }, [selectedPaymentTypeId, selectedCardId, selectedDueDate, monthlyCardTransactions, editingAccount, form, cards, creditCardPaymentTypeId]);


  // Buscar contas a pagar
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-payable"],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), credit_cards(name), payment_types(name), responsible_persons(name)")
        .eq("created_by", user.id)
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar cartões
  const { data: cards, isLoading: isLoadingCards } = useQuery({
    queryKey: ["credit-cards"],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .eq("created_by", user.id)
        .order("name");
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar categorias
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar responsáveis
  const { data: responsiblePersons, isLoading: isLoadingResponsiblePersons } = useQuery({
    queryKey: ["responsible-persons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responsible_persons")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Criar/Atualizar conta
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível salvar conta.");
        throw new Error("User not authenticated.");
      }

      let finalCardId = values.card_id;
      // Validação condicional para card_id
      if (values.payment_type_id === creditCardPaymentTypeId && !values.card_id) {
        toast.error("Selecione um cartão de crédito para o tipo de pagamento 'Cartão'.");
        throw new Error("Credit card selection required.");
      } else if (values.payment_type_id !== creditCardPaymentTypeId) {
        finalCardId = null; // Clear card_id if not a credit card payment
      }

      const baseAccountData = {
        payment_type_id: values.payment_type_id,
        card_id: finalCardId,
        amount: parseFloat(values.amount),
        category_id: values.category_id,
        expense_type: "variavel" as const, // Mantido como enum fixo
        responsible_person_id: values.responsible_person_id || null,
        created_by: user.id,
      };

      if (editingAccount) {
        // Se estiver editando uma conta existente (fixa original ou não fixa)
        // Não permite editar instâncias geradas (is_generated_fixed_instance)
        const { error } = await supabase
          .from("accounts_payable")
          .update({
            ...baseAccountData,
            description: editingAccount.is_fixed ? values.description : editingAccount.description, // Only update description for original fixed
            purchase_date: values.is_fixed || values.payment_type_id === creditCardPaymentTypeId ? null : values.purchase_date, // Null if fixed or credit card
            due_date: values.due_date,
            installments: values.is_fixed || values.payment_type_id === creditCardPaymentTypeId ? 1 : parseInt(values.installments || "1"), // 1 if fixed or credit card
            is_fixed: values.is_fixed,
          })
          .eq("id", editingAccount.id);
        
        if (error) throw error;
      } else {
        // Criar nova conta
        if (values.is_fixed) {
          // Inserir uma única conta fixa (template)
          const { error } = await supabase
            .from("accounts_payable")
            .insert({
              ...baseAccountData,
              description: values.description,
              purchase_date: null, // Fixed accounts don't have a single purchase date
              due_date: values.due_date,
              installments: 1, // Fixed accounts always have 1 installment in DB
              current_installment: 1,
              is_fixed: true,
              original_fixed_account_id: null,
            });
          if (error) throw error;
        } else {
          // Lidar com contas não fixas com múltiplas parcelas
          const numInstallments = parseInt(values.installments || "1");
          let firstInstallmentId: string | null = null;

          for (let i = 0; i < numInstallments; i++) {
            const currentDueDate = addMonths(parseISO(values.due_date), i);
            const currentPurchaseDate = values.purchase_date ? addMonths(parseISO(values.purchase_date), i) : null;

            const installmentDescription = numInstallments > 1
              ? `${values.description} (${i + 1}/${numInstallments})`
              : values.description;

            const installmentData = {
              ...baseAccountData,
              description: installmentDescription,
              due_date: format(currentDueDate, "yyyy-MM-dd"),
              purchase_date: currentPurchaseDate ? format(currentPurchaseDate, "yyyy-MM-dd") : null,
              installments: numInstallments, // Total installments for the series
              current_installment: i + 1, // Current installment number
              is_fixed: false,
              original_fixed_account_id: firstInstallmentId, // Link to the first installment
            };

            const { data: insertedData, error } = await supabase
              .from("accounts_payable")
              .insert(installmentData)
              .select("id") // Select the ID to link subsequent installments
              .single();

            if (error) throw error;

            if (i === 0) {
              firstInstallmentId = insertedData.id; // Capturar o ID da primeira parcela
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success(editingAccount ? "Conta atualizada com sucesso!" : "Conta criada com sucesso!");
      setIsFormOpen(false);
      setEditingAccount(null);
      form.reset();
    },
    onError: (error) => {
      toast.error("Erro ao salvar conta: " + error.message);
    },
  });

  // Deletar conta
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Antes de deletar a conta a pagar, verificar se há uma transação de cartão de crédito vinculada e deletá-la
      const { data: existingTransaction, error: fetchError } = await supabase
        .from("credit_card_transactions")
        .select("id")
        .eq("accounts_payable_id", id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error("Error fetching linked credit card transaction:", fetchError);
        throw fetchError;
      }

      if (existingTransaction) {
        const { error: deleteTransactionError } = await supabase
          .from("credit_card_transactions")
          .delete()
          .eq("id", existingTransaction.id);
        if (deleteTransactionError) {
          console.error("Error deleting linked credit card transaction:", deleteTransactionError);
          throw deleteTransactionError;
        }
      }

      const { error } = await supabase
        .from("accounts_payable")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] }); // Invalida o cache de transações de cartão
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] }); // Invalida o cache de gastos do cartão
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] }); // Invalida o cache de gastos por responsável
      toast.success("Conta deletada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao deletar conta: " + error.message);
    },
  });

  // Confirmar pagamento (agora com data selecionável e lógica para instâncias geradas)
  const confirmPaidMutation = useMutation({
    mutationFn: async ({ account, paidDate }: { account: AccountPayableWithGeneratedFlag; paidDate: Date }) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível confirmar pagamento.");
        throw new Error("User not authenticated.");
      }

      const formattedPaidDate = format(paidDate, "yyyy-MM-dd");
      let insertedAccountId = account.id;

      // Step 1: Update/Insert accounts_payable
      if (account.is_generated_fixed_instance) {
        const { data: newAccount, error } = await supabase
          .from("accounts_payable")
          .insert({
            description: account.description,
            payment_type_id: account.payment_type_id,
            card_id: account.card_id,
            purchase_date: account.purchase_date,
            due_date: format(parseISO(account.due_date), "yyyy-MM-dd"),
            installments: account.installments,
            amount: account.amount,
            category_id: account.category_id,
            expense_type: account.expense_type,
            is_fixed: false,
            responsible_person_id: account.responsible_person_id,
            created_by: user.id,
            paid: true,
            paid_date: formattedPaidDate,
            original_fixed_account_id: account.original_fixed_account_id || account.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        insertedAccountId = newAccount.id;
      } else {
        const { error } = await supabase
          .from("accounts_payable")
          .update({ paid: true, paid_date: formattedPaidDate })
          .eq("id", account.id);
        
        if (error) throw error;
      }

      // Step 2: If paid with credit card, record transaction
      if (account.payment_type_id === creditCardPaymentTypeId && account.card_id) {
        const transactionData = {
          description: account.description,
          amount: account.amount,
          card_id: account.card_id,
          category_id: account.category_id,
          purchase_date: formattedPaidDate,
          installments: account.installments || 1,
          current_installment: account.current_installment || 1,
          created_by: user.id,
          responsible_person_id: account.responsible_person_id,
          accounts_payable_id: insertedAccountId, // Link to the accounts_payable entry
        };

        const { error: transactionError } = await supabase
          .from("credit_card_transactions")
          .insert(transactionData);

        if (transactionError) {
          console.error("Error inserting credit card transaction:", transactionError);
          toast.error("Erro ao registrar transação no cartão de crédito.");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] }); // Invalida o cache de cartões para atualizar limites
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] }); // Invalida o cache de transações de cartão
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] }); // Invalida o cache de gastos do cartão
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] }); // Invalida o cache de gastos por responsável
      toast.success("Pagamento confirmado com sucesso!");
      setShowConfirmPaidDateDialog(false);
      setCurrentConfirmingAccount(null);
      setSelectedPaidDate(new Date());
    },
    onError: (error) => {
      toast.error("Erro ao confirmar pagamento: " + error.message);
    },
  });

  // Estornar pagamento
  const reversePaidMutation = useMutation({
    mutationFn: async (account: AccountPayableWithGeneratedFlag) => {
      // Se for um pagamento de cartão de crédito, deletar a transação de cartão correspondente
      if (account.payment_type_id === creditCardPaymentTypeId && account.card_id) {
        const { error: deleteTransactionError } = await supabase
          .from("credit_card_transactions")
          .delete()
          .eq("accounts_payable_id", account.id); // Usar o accounts_payable_id para encontrar a transação
        
        if (deleteTransactionError) {
          console.error("Error deleting linked credit card transaction on reverse:", deleteTransactionError);
          toast.error("Erro ao remover transação de cartão de crédito vinculada.");
          throw deleteTransactionError;
        }
      }

      const { error } = await supabase
        .from("accounts_payable")
        .update({ paid: false, paid_date: null })
        .eq("id", account.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] }); // Invalida o cache de cartões para atualizar limites
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] }); // Invalida o cache de transações de cartão
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] }); // Invalida o cache de gastos do cartão
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] }); // Invalida o cache de gastos por responsável
      toast.success("Pagamento estornado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao estornar pagamento: " + error.message);
    },
  });

  const onSubmit = (values: FormData) => {
    // Validação condicional para card_id antes de mutar
    if (values.payment_type_id === creditCardPaymentTypeId && !values.card_id) {
      toast.error("Selecione um cartão de crédito para o tipo de pagamento 'Cartão'.");
      return;
    }
    saveMutation.mutate(values);
  };

  const handleEdit = (account: AccountPayableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Edite a conta fixa original para alterar esta ocorrência.");
      return;
    }
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleDelete = (account: AccountPayableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Não é possível excluir uma ocorrência gerada. Exclua a conta fixa original se desejar.");
      return;
    }
    if (confirm("Tem certeza que deseja deletar esta conta?")) {
      deleteMutation.mutate(account.id);
    }
  };

  const handleReverse = (account: AccountPayableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Não é possível estornar uma ocorrência gerada que ainda não foi confirmada.");
      return;
    }
    if (confirm("Tem certeza que deseja estornar este pagamento? Ele voltará para o status de 'não pago'.")) {
      reversePaidMutation.mutate(account); // Passar o objeto account completo
    }
  };

  // Função para abrir o diálogo de confirmação de data de pagamento
  const handleConfirmPaidClick = (account: AccountPayableWithGeneratedFlag) => {
    setCurrentConfirmingAccount(account);
    setSelectedPaidDate(new Date()); // Define a data padrão como hoje
    setShowConfirmPaidDateDialog(true);
  };

  // Lógica para o seletor de mês
  const generateMonthOptions = () => {
    const options = [];
    let date = subMonths(new Date(), 11); // Começa 11 meses atrás
    for (let i = 0; i < 18; i++) { // 11 meses passados + mês atual + 6 meses futuros = 18 meses
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy", { locale: ptBR }),
      });
      date = addMonths(date, 1); // Incrementa um mês
    }
    return options;
  };

  const monthOptions = generateMonthOptions();
  const [selectedYear, selectedMonth] = selectedMonthYear.split('-').map(Number);
  const selectedMonthDate = parseISO(`${selectedMonthYear}-01`);

  // Processar contas para exibição, incluindo a replicação de contas fixas
  const processedAccounts = accounts?.flatMap(account => {
    const accountDueDate = parseISO(account.due_date);
    const currentMonthAccounts: AccountPayableWithGeneratedFlag[] = [];

    // 1. Incluir contas não fixas que pertencem ao mês selecionado
    if (!account.is_fixed && isSameMonth(accountDueDate, selectedMonthDate) && isSameYear(accountDueDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    } 
    // 2. Incluir contas fixas originais que pertencem ao mês selecionado
    else if (account.is_fixed && isSameMonth(accountDueDate, selectedMonthDate) && isSameYear(accountDueDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    }
    // 3. Gerar ocorrências para contas fixas em meses futuros
    else if (account.is_fixed && accountDueDate <= endOfMonth(selectedMonthDate)) {
      // Verificar se já existe uma ocorrência real para este mês e esta conta fixa
      const existingOccurrence = accounts.find(
        (a) => a.original_fixed_account_id === account.id &&
               isSameMonth(parseISO(a.due_date), selectedMonthDate) &&
               isSameYear(parseISO(a.due_date), selectedMonthDate)
      );

      if (!existingOccurrence) {
        // Se não existe uma ocorrência real, cria uma instância gerada para exibição
        const displayDate = new Date(selectedYear, selectedMonth - 1, accountDueDate.getDate());
        // Ajusta o dia se o mês selecionado não tiver aquele dia (ex: 31 de fevereiro)
        if (displayDate.getMonth() !== selectedMonth - 1) {
          displayDate.setDate(0); // Vai para o último dia do mês anterior
          displayDate.setDate(displayDate.getDate() + 1); // Adiciona 1 dia para o último dia do mês atual
        }

        currentMonthAccounts.push({
          ...account,
          id: `temp-${account.id}-${selectedMonthYear}`, // ID temporário para instâncias geradas
          due_date: format(displayDate, "yyyy-MM-dd"),
          paid: false, // Instâncias geradas são sempre não pagas por padrão
          paid_date: null,
          is_generated_fixed_instance: true,
          original_fixed_account_id: account.id, // Referência ao modelo fixo original
        });
      }
    }
    return currentMonthAccounts;
  }).sort((a, b) => parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime()) || [];

  // Filtrar contas pagas para o resumo total (apenas do mês selecionado)
  const paidAccounts = processedAccounts.filter(account => account.paid) || [];
  const totalPaidAmount = paidAccounts.reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  // Calcular o valor pago por cada responsável (apenas contas pagas do mês selecionado)
  const paidByResponsiblePerson = paidAccounts.reduce((acc: { [key: string]: number }, account) => {
    const personName = account.responsible_persons?.name || "Não Atribuído";
    const amount = account.amount * (account.installments || 1);
    acc[personName] = (acc[personName] || 0) + amount;
    return acc;
  }, {});

  const totalAmountForecast = processedAccounts.reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <div className="flex items-center gap-4">
            <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingAccount(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Conta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ex: Compra supermercado" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="payment_type_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Pagamento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {isLoadingPaymentTypes ? (
                                  <SelectItem value="loading" disabled>Carregando...</SelectItem>
                                ) : (
                                  paymentTypes?.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>
                                      {type.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="is_fixed"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Conta Fixa</FormLabel>
                              <FormDescription>
                                Marque se esta conta se repete todos os meses.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount} // Disable if credit card and new entry
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {selectedPaymentTypeId === creditCardPaymentTypeId && (
                      <FormField
                        control={form.control}
                        name="card_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cartão de Crédito</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o cartão" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {isLoadingCards ? (
                                  <SelectItem value="loading" disabled>Carregando...</SelectItem>
                                ) : (
                                  cards && cards.length > 0 ? (
                                    cards.map((card) => (
                                      <SelectItem key={card.id} value={card.id}>
                                        {card.name} {card.last_digits ? `(**** ${card.last_digits})` : ""}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="no-cards" disabled>Nenhum cartão cadastrado.</SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                            {!creditCardPaymentTypeId && (
                              <FormDescription className="text-destructive">
                                O tipo de pagamento "cartao" não foi encontrado nas configurações. Por favor, adicione-o em Configurações &gt; Tipos de Pagamento.
                              </FormDescription>
                            )}
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {!(selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount) && !isFixed && ( // Hide purchase_date if credit card and new entry, or if fixed
                        <FormField
                          control={form.control}
                          name="purchase_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data da Compra</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      <FormField
                        control={form.control}
                        name="due_date"
                        render={({ field }) => (
                          <FormItem className={cn((isFixed || (selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount)) && "col-span-2")}>
                            <FormLabel>Data de Vencimento</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                      )}
                      />
                    </div>

                    {!(selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount) && !isFixed && ( // Hide if credit card and new entry, or if fixed
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="installments"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantidade de Parcelas</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valor da Parcela</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {(isFixed || (selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount)) && ( // Show if fixed OR credit card and new entry
                      <div className="grid grid-cols-1 gap-4">
                        <FormField
                          control={form.control}
                          name="amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valor da Parcela</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  placeholder="0.00" 
                                  {...field} 
                                  disabled={selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount} // Disable if credit card and new entry
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="category_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categoria</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a categoria" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingCategories ? (
                                <SelectItem value="loading" disabled>Carregando...</SelectItem>
                              ) : (
                                categories?.map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="responsible_person_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsável</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o responsável" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingResponsiblePersons ? (
                                <SelectItem value="loading" disabled>Carregando...</SelectItem>
                              ) : (
                                responsiblePersons?.map((person) => (
                                  <SelectItem key={person.id} value={person.id}>
                                    {person.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm font-medium">
                        Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * (isFixed || (selectedPaymentTypeId === creditCardPaymentTypeId && !editingAccount) ? 1 : parseInt(form.watch("installments") || "1"))).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? "Salvando..." : editingAccount ? "Atualizar" : "Criar"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card>
            <CardHeader className="relative pb-3">
              <CardTitle>Resumo Total</CardTitle>
              <div className="absolute top-4 right-4 text-sm text-muted-foreground flex items-center gap-1">
                <span className="font-medium">Previsão do Mês:</span>
                <span className="font-bold text-expense">R$ {totalAmountForecast.toFixed(2)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-expense">
                Total a Pagar: R$ {totalAmountForecast.toFixed(2)}
              </div>
              <div className="text-xl font-semibold text-income mt-2">
                Total Pago: R$ {totalPaidAmount.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pago por Responsável</CardTitle>
            </CardHeader>
            <CardContent>
              {paidByResponsiblePerson && Object.keys(paidByResponsiblePerson).length > 0 ? (
                <ul className="space-y-2">
                  {Object.entries(paidByResponsiblePerson).map(([name, amount]) => (
                    <li key={name} className="flex justify-between text-sm">
                      <span>{name}:</span>
                      <span className="font-semibold text-income">R$ {(amount as number).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum valor pago por responsável.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {loadingAccounts ? (
          <p className="text-muted-foreground">Carregando contas...</p>
        ) : processedAccounts && processedAccounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {processedAccounts.map((account) => (
              <Card key={account.id} className={cn(account.paid ? "border-l-4 border-income" : "border-l-4 border-destructive")}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{account.description}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Tipo:</span>{" "}
                          {account.payment_types?.name || "N/A"}
                        </div>
                        {account.credit_cards && (
                          <div>
                            <span className="font-medium">Cartão:</span> {account.credit_cards.name}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Vencimento:</span>{" "}
                          {format(new Date(account.due_date), "dd/MM/yyyy")}
                        </div>
                        {!account.is_fixed && (
                          <div>
                            <span className="font-medium">Parcelas:</span> {account.current_installment}/{account.installments}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-expense font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.expense_categories && (
                          <div>
                            <span className="font-medium">Categoria:</span> {account.expense_categories.name}
                          </div>
                        )}
                        {account.responsible_persons && (
                          <div>
                            <span className="font-medium">Responsável:</span> {account.responsible_persons.name}
                          </div>
                        )}
                        {account.paid && (
                          <div className="col-span-2 flex items-center gap-1 text-income">
                            <CheckCircle className="h-4 w-4" />
                            <span className="font-medium">Pago em: {format(new Date(account.paid_date), "dd/MM/yyyy")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {account.paid ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleReverse(account)}
                          disabled={reversePaidMutation.isPending || account.is_generated_fixed_instance}
                          className="text-destructive border-destructive hover:bg-destructive/10"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" /> Estornar
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleConfirmPaidClick(account)}
                          disabled={confirmPaidMutation.isPending}
                          className="text-income border-income hover:bg-income/10"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" /> Pago
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEdit(account)}
                        disabled={account.is_generated_fixed_instance}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(account)}
                        disabled={deleteMutation.isPending || account.is_generated_fixed_instance}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma conta a pagar cadastrada para o mês selecionado.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Diálogo para selecionar a data de pagamento */}
      <Dialog open={showConfirmPaidDateDialog} onOpenChange={setShowConfirmPaidDateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Data de Pagamento</DialogTitle>
            <CardDescription>Selecione a data em que o pagamento ocorreu.</CardDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedPaidDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedPaidDate ? format(selectedPaidDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedPaidDate}
                  onSelect={setSelectedPaidDate}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => {
                if (currentConfirmingAccount && selectedPaidDate) {
                  confirmPaidMutation.mutate({ 
                    account: currentConfirmingAccount, 
                    paidDate: selectedPaidDate 
                  });
                } else {
                  toast.error("Selecione uma data para confirmar o pagamento.");
                }
              }}
              disabled={confirmPaidMutation.isPending || !selectedPaidDate}
            >
              {confirmPaidMutation.isPending ? "Confirmando..." : "Confirmar Pagamento"}
            </Button>
            <Button variant="outline" onClick={() => setShowConfirmPaidDateDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
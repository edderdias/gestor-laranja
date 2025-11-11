import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Edit, Trash2, ShoppingCart, CalendarIcon, ListChecks, Printer, Pencil, CheckCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addMonths, getMonth, getYear, isSameMonth, isSameYear, parseISO, endOfMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tables } from "@/integrations/supabase/types";
import { PrintStatementComponent } from "@/components/PrintStatementComponent";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import html2pdf from 'html2pdf.js';
import { Badge } from "@/components/ui/badge"; // Importar Badge

// Helper function for formatting currency for display
const formatCurrencyDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null) return "";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function for parsing currency input string to number
const parseCurrencyInput = (input: string): number => {
  // Remove all non-digit characters except comma and leading minus sign
  const cleanedInput = input.replace(/[^0-9,-]/g, '');
  // Replace comma with dot for parseFloat
  const numericValue = parseFloat(cleanedInput.replace(',', '.')) || 0;
  return numericValue;
};

const cardSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  brand: z.enum(["visa", "master"], { required_error: "Selecione a bandeira" }),
  due_date: z.number().min(1).max(31, "Dia de vencimento inválido"),
  best_purchase_date: z.number().min(1).max(31, "Melhor dia de compra inválido"),
  credit_limit: z.number().min(0, "Limite deve ser positivo"),
  last_digits: z.string().optional(),
});

type CardFormData = z.infer<typeof cardSchema>;

const transactionSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val !== 0, "O valor não pode ser zero"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  purchase_date: z.date({ required_error: "Data da compra é obrigatória" }),
  installments: z.string().transform(Number).refine(val => val >= 1, "Parcelas devem ser no mínimo 1").refine(val => Number.isInteger(val), "Quantidade de parcelas deve ser um número inteiro"),
  responsible_person_id: z.string().optional(),
  is_fixed: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.is_fixed && data.installments !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Transações fixas devem ter 1 parcela.",
      path: ["installments"],
    });
  }
});

type TransactionFormData = z.infer<typeof transactionSchema>;

type CreditCardTransactionWithGeneratedFlag = Tables<'credit_card_transactions'> & {
  is_generated_fixed_instance?: boolean;
  expense_categories?: Tables<'expense_categories'>;
  responsible_persons?: Tables<'responsible_persons'>;
};

// Tipo para o status de pagamento da fatura
type BillPaidStatus = "Pago" | "Pendente" | "Parcialmente Pago" | "Sem Lançamentos";

export default function CreditCards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCardFormOpen, setIsCardFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [cardFormData, setCardFormData] = useState<Partial<CardFormData>>({
    due_date: 10,
    best_purchase_date: 5,
    credit_limit: 0,
  });

  const [creditLimitInput, setCreditLimitInput] = useState<string>("");

  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false);
  const [selectedCardForTransaction, setSelectedCardForTransaction] = useState<any>(null);
  const [editingTransaction, setEditingTransaction] = useState<CreditCardTransactionWithGeneratedFlag | null>(null);

  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<any>(null);
  const [selectedStatementMonthYear, setSelectedStatementMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [printMode, setPrintMode] = useState<'none' | 'general' | 'byResponsiblePerson'>('none');

  const printRef = useRef<HTMLDivElement>(null);

  // State for the main month selector on the CreditCards page
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const currentMonthStart = startOfMonth(parseISO(`${selectedMonthYear}-01`));
  const currentMonthEnd = endOfMonth(parseISO(`${selectedMonthYear}-01`));

  const transactionForm = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: "",
      amount: 0,
      category_id: "",
      purchase_date: new Date(),
      installments: "1",
      responsible_person_id: undefined,
      is_fixed: false,
    },
  });

  const isFixedTransaction = transactionForm.watch("is_fixed");

  useEffect(() => {
    if (isFixedTransaction) {
      transactionForm.setValue("installments", "1");
    }
  }, [isFixedTransaction, transactionForm]);

  useEffect(() => {
    if (isCardFormOpen && editingCard) {
      setCardFormData({
        name: editingCard.name,
        brand: editingCard.brand,
        due_date: editingCard.due_date,
        best_purchase_date: editingCard.best_purchase_date,
        credit_limit: editingCard.credit_limit,
        last_digits: editingCard.last_digits || "",
      });
      setCreditLimitInput(formatCurrencyDisplay(editingCard.credit_limit));
    } else if (!isCardFormOpen) {
      resetCardForm();
    }
  }, [isCardFormOpen, editingCard]);

  useEffect(() => {
    if (isTransactionFormOpen) {
      if (editingTransaction) {
        transactionForm.reset({
          description: editingTransaction.description,
          amount: editingTransaction.amount,
          category_id: editingTransaction.category_id || "",
          purchase_date: parseISO(editingTransaction.purchase_date),
          installments: editingTransaction.installments?.toString() || "1",
          responsible_person_id: editingTransaction.responsible_person_id || undefined,
          is_fixed: editingTransaction.is_fixed || false,
        });
      } else {
        transactionForm.reset({
          description: "",
          amount: 0,
          category_id: "",
          purchase_date: new Date(),
          installments: "1",
          responsible_person_id: undefined,
          is_fixed: false,
        });
      }
    } else {
      transactionForm.reset();
      setEditingTransaction(null);
      setSelectedCardForTransaction(null);
    }
  }, [isTransactionFormOpen, editingTransaction, transactionForm]);

  useEffect(() => {
    if (printMode === 'byResponsiblePerson') {
      const timer = setTimeout(() => {
        window.print();
        setPrintMode('none');
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [printMode]);

  // Fetch cartões
  const { data: cards, isLoading: isLoadingCards } = useQuery({
    queryKey: ["credit_cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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

  // Fetch accounts payable entries for each card for the selected month
  const { data: monthlyCardAccountsPayable, isLoading: isLoadingMonthlyCardAccountsPayable } = useQuery({
    queryKey: ["monthly_card_accounts_payable", user?.id, selectedMonthYear, creditCardPaymentTypeId],
    queryFn: async () => {
      if (!user?.id || !creditCardPaymentTypeId) return [];
      const monthStart = startOfMonth(parseISO(`${selectedMonthYear}-01`));
      const monthEnd = endOfMonth(parseISO(`${selectedMonthYear}-01`));

      const { data, error } = await supabase
        .from("accounts_payable")
        .select("id, card_id, paid, due_date")
        .eq("created_by", user.id)
        .eq("payment_type_id", creditCardPaymentTypeId)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"));

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!creditCardPaymentTypeId,
  });

  // Process monthly card accounts payable to determine paid status for each card
  const cardPaidStatusMap = new Map<string, BillPaidStatus>();
  if (cards && monthlyCardAccountsPayable) {
    cards.forEach(card => {
      const cardPayments = monthlyCardAccountsPayable.filter(ap => ap.card_id === card.id);
      if (cardPayments.length === 0) {
        cardPaidStatusMap.set(card.id, "Sem Lançamentos");
      } else {
        const allPaid = cardPayments.every(ap => ap.paid);
        const anyPaid = cardPayments.some(ap => ap.paid);

        if (allPaid) {
          cardPaidStatusMap.set(card.id, "Pago");
        } else if (anyPaid) {
          cardPaidStatusMap.set(card.id, "Parcialmente Pago");
        } else {
          cardPaidStatusMap.set(card.id, "Pendente");
        }
      }
    });
  }

  // Fetch total gasto por cartão para o MÊS SELECIONADO
  const { data: cardExpenses } = useQuery({
    queryKey: ["card_expenses", user?.id, selectedMonthYear], // Adicionado selectedMonthYear
    queryFn: async () => {
      if (!user?.id) return {};
      
      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("card_id, amount, purchase_date, accounts_payable_id") // Adicionado accounts_payable_id
        .eq("created_by", user.id)
        .gte("purchase_date", format(currentMonthStart, "yyyy-MM-dd")) // Filtra pelo início do mês selecionado
        .lte("purchase_date", format(currentMonthEnd, "yyyy-MM-dd"))   // Filtra pelo fim do mês selecionado
        .is("accounts_payable_id", null); // Adicionada a condição para excluir transações de contas a pagar

      if (error) throw error;
      
      const totals = data.reduce((acc: { [key: string]: number }, transaction: Tables<'credit_card_transactions'>) => {
        const cardId = transaction.card_id;
        acc[cardId] = (acc[cardId] || 0) + transaction.amount;
        return acc;
      }, {});
      
      return totals;
    },
    enabled: !!user?.id,
  });

  // NEW: Fetch total gasto por responsável para o MÊS SELECIONADO
  const { data: responsiblePersonSpending, isLoading: isLoadingResponsibleSpending } = useQuery({
    queryKey: ["responsible_person_spending", user?.id, selectedMonthYear],
    queryFn: async () => {
      if (!user?.id) return {};

      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("amount, responsible_person_id, responsible_persons(name)")
        .eq("created_by", user.id)
        .gte("purchase_date", format(currentMonthStart, "yyyy-MM-dd"))
        .lte("purchase_date", format(currentMonthEnd, "yyyy-MM-dd"));

      if (error) throw error;

      const totals = data.reduce((acc: { [key: string]: number }, transaction) => {
        const personName = transaction.responsible_persons?.name;
        if (personName && personName !== "Não Atribuído") { // Excluir "Não Atribuído"
          acc[personName] = (acc[personName] || 0) + transaction.amount;
        }
        return acc;
      }, {});

      return totals;
    },
    enabled: !!user?.id,
  });

  // Fetch categorias de despesa
  const { data: expenseCategories, isLoading: isLoadingCategories } = useQuery({
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

  // Fetch responsáveis
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

  // Fetch transactions for the selected card statement (uses selectedStatementMonthYear)
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["credit_card_transactions", selectedCardForStatement?.id, selectedStatementMonthYear],
    queryFn: async () => {
      if (!selectedCardForStatement?.id) return [];
      const statementMonthStart = startOfMonth(parseISO(`${selectedStatementMonthYear}-01`));
      const statementMonthEnd = endOfMonth(parseISO(`${selectedStatementMonthYear}-01`));

      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("*, expense_categories(name), responsible_persons(name)")
        .eq("card_id", selectedCardForStatement.id)
        .gte("purchase_date", format(statementMonthStart, "yyyy-MM-dd"))
        .lte("purchase_date", format(statementMonthEnd, "yyyy-MM-dd"))
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCardForStatement?.id && isStatementDialogOpen,
  });

  // Mutation para salvar cartão
  const saveCardMutation = useMutation({
    mutationFn: async (data: CardFormData) => {
      const cardData = {
        name: data.name,
        brand: data.brand,
        due_date: data.due_date,
        best_purchase_date: data.best_purchase_date,
        credit_limit: data.credit_limit,
        last_digits: data.last_digits || null,
        created_by: user?.id,
      };

      if (editingCard) {
        const { error } = await supabase
          .from("credit_cards")
          .update(cardData)
          .eq("id", editingCard.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("credit_cards")
          .insert([cardData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success(editingCard ? "Cartão atualizado!" : "Cartão criado!");
      resetCardForm();
    },
    onError: (error) => {
      toast.error("Erro ao salvar cartão");
      console.error(error);
    },
  });

  // Mutation para deletar cartão
  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("credit_cards")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success("Cartão excluído!");
    },
    onError: () => {
      toast.error("Erro ao excluir cartão");
    },
  });

  // Mutation para salvar/atualizar transação de cartão de crédito
  const saveCreditCardTransactionMutation = useMutation({
    mutationFn: async (values: TransactionFormData) => {
      if (!user?.id || !selectedCardForTransaction?.id) {
        toast.error("Usuário ou cartão não selecionado. Não foi possível salvar a compra.");
        throw new Error("User or card not selected.");
      }

      if (editingTransaction && editingTransaction.is_generated_fixed_instance) {
        toast.info("Não é possível editar uma ocorrência gerada. Edite a transação fixa original.");
        throw new Error("Cannot edit generated fixed instance.");
      }

      let adjustedPurchaseDate = values.purchase_date; // This is a Date object from the form

      // Get the best_purchase_date for the selected card
      const cardBestPurchaseDay = selectedCardForTransaction?.best_purchase_date;

      if (cardBestPurchaseDay !== undefined && cardBestPurchaseDay !== null) {
        // Compare the day of the actual purchase with the card's best purchase day
        // If the purchase day is AFTER the best purchase day,
        // the transaction belongs to the next month's statement.
        if (adjustedPurchaseDate.getDate() > cardBestPurchaseDay) {
          adjustedPurchaseDate = addMonths(adjustedPurchaseDate, 1);
        }
      }

      const formattedPurchaseDate = format(adjustedPurchaseDate, "yyyy-MM-dd");

      const baseTransactionData = {
        description: values.description,
        amount: values.amount,
        card_id: selectedCardForTransaction.id,
        category_id: values.category_id,
        purchase_date: formattedPurchaseDate, // Use the potentially adjusted date
        responsible_person_id: values.responsible_person_id || null,
        created_by: user.id,
        accounts_payable_id: null, // Sempre null para transações diretas de cartão
      };

      if (editingTransaction) {
        // Update existing transaction
        const { error } = await supabase
          .from("credit_card_transactions")
          .update({
            ...baseTransactionData,
            installments: values.is_fixed ? 1 : values.installments,
            current_installment: values.is_fixed ? 1 : editingTransaction.current_installment,
            is_fixed: values.is_fixed,
            original_fixed_transaction_id: editingTransaction.original_fixed_transaction_id,
          })
          .eq("id", editingTransaction.id);
        if (error) throw error;
      } else {
        // Insert new transaction
        if (values.is_fixed) {
          const transactionData = {
            ...baseTransactionData,
            installments: 1,
            current_installment: 1,
            is_fixed: true,
            original_fixed_transaction_id: null,
          };
          const { error } = await supabase.from("credit_card_transactions").insert(transactionData);
          if (error) throw error;
        } else {
          const numInstallments = values.installments;
          let firstInstallmentId: string | null = null;

          for (let i = 0; i < numInstallments; i++) {
            const currentPurchaseDate = addMonths(adjustedPurchaseDate, i); // Use adjustedPurchaseDate here
            const transactionDescription = numInstallments > 1
              ? `${values.description} (${i + 1}/${numInstallments})`
              : values.description;

            const installmentData = {
              ...baseTransactionData,
              description: transactionDescription,
              purchase_date: format(currentPurchaseDate, "yyyy-MM-dd"),
              installments: numInstallments,
              current_installment: i + 1,
              is_fixed: false,
              original_fixed_transaction_id: firstInstallmentId,
            };

            const { data: insertedData, error } = await supabase
              .from("credit_card_transactions")
              .insert(installmentData)
              .select("id")
              .single();

            if (error) throw error;
            if (i === 0) {
              firstInstallmentId = insertedData.id;
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] }); // Invalida o novo query
      queryClient.invalidateQueries({ queryKey: ["monthly_card_accounts_payable"] }); // Invalida o status de pagamento da fatura
      toast.success(editingTransaction ? "Lançamento atualizado com sucesso!" : "Compra registrada com sucesso!");
      setIsTransactionFormOpen(false);
      setEditingTransaction(null);
      transactionForm.reset();
    },
    onError: (error) => {
      toast.error("Erro ao salvar lançamento: " + error.message);
      console.error(error);
    },
  });

  // Mutation para deletar transação de cartão de crédito
  const deleteCreditCardTransactionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("credit_card_transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] }); // Invalida o novo query
      queryClient.invalidateQueries({ queryKey: ["monthly_card_accounts_payable"] }); // Invalida o status de pagamento da fatura
      toast.success("Lançamento excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir lançamento: " + error.message);
      console.error(error);
    },
  });

  // Mutation para marcar todas as contas a pagar de um cartão como pagas para o mês selecionado
  const markAllCardAccountsAsPaidMutation = useMutation({
    mutationFn: async (cardId: string) => {
      if (!user?.id || !creditCardPaymentTypeId) {
        toast.error("Usuário não autenticado ou tipo de pagamento de cartão não encontrado.");
        throw new Error("User not authenticated or credit card payment type not found.");
      }

      const monthStart = startOfMonth(parseISO(`${selectedMonthYear}-01`));
      const monthEnd = endOfMonth(parseISO(`${selectedMonthYear}-01`));
      const paidDate = format(new Date(), "yyyy-MM-dd");

      // 1. Buscar todas as contas a pagar NÃO pagas para este cartão e mês
      const { data: unpaidAccounts, error: fetchError } = await supabase
        .from("accounts_payable")
        .select("id, description, amount, category_id, installments, current_installment, responsible_person_id, is_fixed, original_fixed_account_id")
        .eq("created_by", user.id)
        .eq("card_id", cardId)
        .eq("payment_type_id", creditCardPaymentTypeId)
        .eq("paid", false)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"));

      if (fetchError) throw fetchError;

      if (unpaidAccounts.length === 0) {
        toast.info("Não há contas a pagar pendentes para este cartão no mês selecionado.");
        return;
      }

      // 2. Marcar todas como pagas e criar transações de cartão
      for (const account of unpaidAccounts) {
        // Atualizar a conta a pagar
        const { error: updateError } = await supabase
          .from("accounts_payable")
          .update({ paid: true, paid_date: paidDate })
          .eq("id", account.id);
        if (updateError) throw updateError;

        // Inserir transação de cartão de crédito (se ainda não existir)
        const { data: existingTransaction } = await supabase
          .from("credit_card_transactions")
          .select("id")
          .eq("accounts_payable_id", account.id)
          .single();

        if (!existingTransaction) {
          const transactionData = {
            description: account.description,
            amount: account.amount,
            card_id: cardId,
            category_id: account.category_id,
            purchase_date: paidDate, // Usar a data de pagamento como data da compra para a transação
            installments: account.installments || 1,
            current_installment: account.current_installment || 1,
            created_by: user.id,
            responsible_person_id: account.responsible_person_id,
            accounts_payable_id: account.id, // Vincular à conta a pagar
            is_fixed: account.is_fixed,
            original_fixed_transaction_id: account.original_fixed_account_id,
          };
          const { error: transactionError } = await supabase
            .from("credit_card_transactions")
            .insert(transactionData);
          if (transactionError) {
            console.error("Error inserting credit card transaction:", transactionError);
            throw transactionError;
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["responsible_person_spending"] });
      queryClient.invalidateQueries({ queryKey: ["monthly_card_accounts_payable"] });
      toast.success("Fatura do cartão marcada como paga!");
    },
    onError: (error) => {
      toast.error("Erro ao marcar fatura como paga: " + error.message);
      console.error(error);
    },
  });

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validatedData = cardSchema.parse(cardFormData);
      saveCardMutation.mutate(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          toast.error(err.message);
        });
      }
    }
  };

  const handleTransactionSubmit = (values: TransactionFormData) => {
    saveCreditCardTransactionMutation.mutate(values);
  };

  const resetCardForm = () => {
    setCardFormData({
      name: "",
      brand: "visa",
      due_date: 10,
      best_purchase_date: 5,
      credit_limit: 0,
      last_digits: "",
    });
    setEditingCard(null);
    setIsCardFormOpen(false);
    setCreditLimitInput("");
  };

  const handleEditCard = (card: any) => {
    setEditingCard(card);
    setIsCardFormOpen(true);
  };

  const handleLaunchPurchase = (card: any) => {
    setSelectedCardForTransaction(card);
    setEditingTransaction(null);
    setIsTransactionFormOpen(true);
  };

  const handleViewStatement = (card: any) => {
    setSelectedCardForStatement(card);
    setIsStatementDialogOpen(true);
    setSelectedStatementMonthYear(selectedMonthYear); // Usa o mês selecionado no filtro principal
  };

  const handleEditTransaction = (transaction: CreditCardTransactionWithGeneratedFlag) => {
    if (transaction.is_generated_fixed_instance) {
      toast.info("Não é possível editar uma ocorrência gerada. Edite a transação fixa original.");
      return;
    }
    setSelectedCardForTransaction(cards?.find(card => card.id === transaction.card_id));
    setEditingTransaction(transaction);
    setIsTransactionFormOpen(true);
  };

  const handleDeleteTransaction = (transaction: CreditCardTransactionWithGeneratedFlag) => {
    if (transaction.is_generated_fixed_instance) {
      toast.info("Não é possível excluir uma ocorrência gerada. Exclua a transação fixa original.");
      return;
    }
    if (confirm("Tem certeza que deseja excluir este lançamento? Esta ação é irreversível.")) {
      deleteCreditCardTransactionMutation.mutate(transaction.id);
    }
  };

  const handlePrintGeneralStatement = () => {
    if (printRef.current) {
      toast.info("Gerando PDF do extrato geral...");
      html2pdf().from(printRef.current).save(`extrato-geral-${selectedCardForStatement?.name}-${selectedStatementMonthYear}.pdf`);
      setIsStatementDialogOpen(false);
    } else {
      toast.error("Não foi possível gerar o PDF. Conteúdo não encontrado.");
    }
    setPrintMode('none');
  };

  const handlePrintByResponsiblePerson = () => {
    setPrintMode('byResponsiblePerson');
  };

  const getAvailableLimit = (cardId: string, creditLimit: number) => {
    const spent = cardExpenses?.[cardId] || 0;
    return creditLimit - spent;
  };

  const getBrandLabel = (brand: string) => {
    return brand === "visa" ? "Visa" : "Mastercard";
  };

  // Lógica para o seletor de mês (reutilizada para o filtro principal e extrato)
  const generateMonthOptions = () => {
    const options = [];
    let date = addMonths(new Date(), -6);
    for (let i = 0; i < 12; i++) {
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy", { locale: ptBR }),
      });
      date = addMonths(date, 1);
    }
    return options;
  };

  const monthOptions = generateMonthOptions();
  const [selectedYear, selectedMonth] = selectedStatementMonthYear.split('-').map(Number);
  const selectedMonthDate = parseISO(`${selectedStatementMonthYear}-01`);

  // Processar transações para exibição no extrato, incluindo a replicação de transações fixas
  const processedTransactions = transactions?.flatMap(transaction => {
    const transactionPurchaseDate = parseISO(transaction.purchase_date);
    const currentMonthTransactions: CreditCardTransactionWithGeneratedFlag[] = [];

    if (!transaction.is_fixed && isSameMonth(transactionPurchaseDate, selectedMonthDate) && isSameYear(transactionPurchaseDate, selectedMonthDate)) {
      currentMonthTransactions.push(transaction);
    } 
    else if (transaction.is_fixed && isSameMonth(transactionPurchaseDate, selectedMonthDate) && isSameYear(transactionPurchaseDate, selectedMonthDate)) {
      currentMonthTransactions.push(transaction);
    }
    else if (transaction.is_fixed && transactionPurchaseDate <= endOfMonth(selectedMonthDate)) {
      const existingOccurrence = transactions.find(
        (t) => t.original_fixed_transaction_id === transaction.id &&
               isSameMonth(parseISO(t.purchase_date), selectedMonthDate) &&
               isSameYear(parseISO(t.purchase_date), selectedMonthDate)
      );

      if (!existingOccurrence) {
        const displayDate = new Date(selectedYear, selectedMonth - 1, transactionPurchaseDate.getDate());
        if (displayDate.getMonth() !== selectedMonth - 1) {
          displayDate.setDate(0);
          displayDate.setDate(displayDate.getDate() + 1);
        }

        currentMonthTransactions.push({
          ...transaction,
          id: `temp-${transaction.id}-${selectedStatementMonthYear}`,
          purchase_date: format(displayDate, "yyyy-MM-dd"),
          is_generated_fixed_instance: true,
          original_fixed_transaction_id: transaction.id,
        });
      }
    }
    return currentMonthTransactions;
  }).sort((a, b) => parseISO(a.purchase_date).getTime() - parseISO(b.purchase_date).getTime()) || [];


  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h1 className="text-2xl font-bold">Cartões de Crédito</h1>
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
            <Dialog open={isCardFormOpen} onOpenChange={setIsCardFormOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingCard(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Cartão
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCardSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Descrição do Cartão *</Label>
                      <Input
                        id="name"
                        value={cardFormData.name || ""}
                        onChange={(e) => setCardFormData({ ...cardFormData, name: e.target.value })}
                        placeholder="Ex: Cartão principal"
                      />
                    </div>

                    <div>
                      <Label htmlFor="brand">Bandeira *</Label>
                      <Select
                        value={cardFormData.brand}
                        onValueChange={(value: "visa" | "master") => 
                          setCardFormData({ ...cardFormData, brand: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a bandeira" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="visa">Visa</SelectItem>
                          <SelectItem value="master">Mastercard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="last_digits">Últimos 4 dígitos</Label>
                      <Input
                        id="last_digits"
                        value={cardFormData.last_digits || ""}
                        onChange={(e) => setCardFormData({ ...cardFormData, last_digits: e.target.value })}
                        placeholder="1234"
                        maxLength={4}
                      />
                    </div>

                    <div>
                      <Label htmlFor="due_date">Data de Vencimento (dia) *</Label>
                      <Input
                        id="due_date"
                        type="number"
                        min="1"
                        max="31"
                        value={cardFormData.due_date || ""}
                        onChange={(e) => setCardFormData({ ...cardFormData, due_date: parseInt(e.target.value) || 0 })}
                        placeholder="10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="best_purchase_date">Melhor Data de Compra (dia) *</Label>
                      <Input
                        id="best_purchase_date"
                        type="number"
                        min="1"
                        max="31"
                        value={cardFormData.best_purchase_date || ""}
                        onChange={(e) => setCardFormData({ ...cardFormData, best_purchase_date: parseInt(e.target.value) || 0 })}
                        placeholder="5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="credit_limit">Limite Total de Crédito *</Label>
                      <Input
                        id="credit_limit"
                        type="text"
                        value={creditLimitInput}
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          setCreditLimitInput(rawValue);
                          const numericValue = parseCurrencyInput(rawValue);
                          setCardFormData((prev) => ({ ...prev, credit_limit: numericValue }));
                        }}
                        onBlur={() => {
                          setCreditLimitInput(formatCurrencyDisplay(cardFormData.credit_limit));
                        }}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="submit" disabled={saveCardMutation.isPending}>
                      {saveCardMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetCardForm}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {isLoadingCards || isLoadingMonthlyCardAccountsPayable ? (
          <p className="text-muted-foreground">Carregando cartões...</p>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {cards.map((card) => {
              const availableLimit = getAvailableLimit(card.id, card.credit_limit || 0);
              const usedPercentage = card.credit_limit 
                ? ((card.credit_limit - availableLimit) / card.credit_limit) * 100 
                : 0;
              const billStatus = cardPaidStatusMap.get(card.id) || "Sem Lançamentos";

              return (
                <Card key={card.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          {card.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getBrandLabel(card.brand)} {card.last_digits && `•••• ${card.last_digits}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {/* Removido o botão de confirmar pagamento (ícone) */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCard(card)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir este cartão?")) {
                              deleteCardMutation.mutate(card.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span className="font-medium">Dia {card.due_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Melhor compra:</span>
                        <span className="font-medium">Dia {card.best_purchase_date}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Limite Total:</span>
                        <span className="font-semibold">
                          R$ {(card.credit_limit || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Utilizado (Mês):</span>
                        <span className="font-semibold text-expense">
                          R$ {((card.credit_limit || 0) - availableLimit).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Disponível:</span>
                        <span className="font-bold text-income">
                          R$ {availableLimit.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-expense h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(usedPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {usedPercentage.toFixed(1)}% utilizado
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm font-medium">Fatura ({format(currentMonthStart, "MMM/yy", { locale: ptBR })}):</span>
                      <Badge 
                        className={cn(
                          "text-xs",
                          billStatus === "Pago" && "bg-income text-income-foreground hover:bg-income/80",
                          billStatus === "Pendente" && "bg-destructive text-destructive-foreground hover:bg-destructive/80",
                          billStatus === "Parcialmente Pago" && "bg-yellow-500 text-white hover:bg-yellow-500/80",
                          billStatus === "Sem Lançamentos" && "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {billStatus}
                      </Badge>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      {/* Removido o botão de confirmar pagamento (completo) */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewStatement(card)}
                      >
                        <ListChecks className="h-4 w-4 mr-2" /> Ver Extrato
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleLaunchPurchase(card)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" /> Lançar Compra
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="mb-8">
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum cartão cadastrado. Clique em "Novo Cartão" para começar.
            </CardContent>
          </Card>
        )}

        {/* Painel de Gastos por Responsável */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por Responsável (Mês)</CardTitle>
            <CardDescription>Total de compras no cartão de crédito por responsável no mês de {format(currentMonthStart, "MMMM yyyy", { locale: ptBR })}.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingResponsibleSpending ? (
              <p className="text-muted-foreground">Carregando gastos por responsável...</p>
            ) : responsiblePersonSpending && Object.keys(responsiblePersonSpending).length > 0 ? (
              <ul className="space-y-2">
                {Object.entries(responsiblePersonSpending).map(([name, amount]) => (
                  <li key={name} className="flex justify-between text-sm">
                    <span>{name}:</span>
                    <span className="font-semibold text-expense">R$ {(amount as number).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-center py-4">Nenhum gasto registrado por responsável neste mês.</p>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog for launching a new credit card purchase / editing an existing transaction */}
      <Dialog open={isTransactionFormOpen} onOpenChange={setIsTransactionFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? "Editar Lançamento" : "Lançar Compra no Cartão"}</DialogTitle>
            <CardDescription>
              {editingTransaction ? "Atualizar lançamento para o cartão:" : "Registrar uma nova compra para o cartão:"}{" "}
              <span className="font-semibold">{selectedCardForTransaction?.name}</span>
            </CardDescription>
          </DialogHeader>
          <Form {...transactionForm}>
            <form onSubmit={transactionForm.handleSubmit(handleTransactionSubmit)} className="space-y-4">
              <FormField
                control={transactionForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição da Compra</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Supermercado, Restaurante" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={transactionForm.control}
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
                <FormField
                  control={transactionForm.control}
                  name="is_fixed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm mt-2">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Valor Fixo</FormLabel>
                        <FormDescription>
                          Marque se esta compra se repete todos os meses.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!!editingTransaction?.original_fixed_transaction_id}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={transactionForm.control}
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
                          expenseCategories?.map((category) => (
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
                control={transactionForm.control}
                name="purchase_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data da Compra</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: ptBR })
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isFixedTransaction && (
                <FormField
                  control={transactionForm.control}
                  name="installments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade de Parcelas</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          min="1"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value;
                            const filteredValue = value.replace(/[^0-9]/g, '');
                            field.onChange(filteredValue);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={transactionForm.control}
                name="responsible_person_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável pela Compra</FormLabel>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTransactionFormOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveCreditCardTransactionMutation.isPending}>
                  {saveCreditCardTransactionMutation.isPending ? "Salvando..." : (editingTransaction ? "Atualizar Lançamento" : "Registrar Compra")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Credit Card Statement */}
      <Dialog open={isStatementDialogOpen} onOpenChange={setIsStatementDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extrato do Cartão: {selectedCardForStatement?.name}</DialogTitle>
            <CardDescription>
              Todas as transações registradas para este cartão.
            </CardDescription>
          </DialogHeader>
          <div className="flex justify-end mb-4">
            <Select value={selectedStatementMonthYear} onValueChange={setSelectedStatementMonthYear}>
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
          </div>
          {isLoadingTransactions ? (
            <p className="text-muted-foreground">Carregando extrato...</p>
          ) : processedTransactions && processedTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Parcela</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {processedTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{format(new Date(transaction.purchase_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell>{(transaction.expense_categories as Tables<'expense_categories'>)?.name || "N/A"}</TableCell>
                        <TableCell>{(transaction.responsible_persons as Tables<'responsible_persons'>)?.name || "N/A"}</TableCell>
                        <TableCell className="text-right">R$ {transaction.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {transaction.is_fixed ? "Fixo" : `${transaction.current_installment}/${transaction.installments}`}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleEditTransaction(transaction)}
                                  disabled={transaction.is_generated_fixed_instance}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              {transaction.is_generated_fixed_instance && (
                                <TooltipContent>
                                  <p>Edite a transação fixa original para alterar esta ocorrência.</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteTransaction(transaction)}
                                  disabled={deleteCreditCardTransactionMutation.isPending || transaction.is_generated_fixed_instance}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              {transaction.is_generated_fixed_instance && (
                                <TooltipContent>
                                  <p>Exclua a transação fixa original para remover esta ocorrência.</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TooltipProvider>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">Nenhuma transação encontrada para este cartão no mês selecionado.</p>
          )}
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsStatementDialogOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handlePrintGeneralStatement} className="flex items-center">
              <Printer className="h-4 w-4 mr-2" /> Imprimir Extrato Geral (PDF)
            </Button>
            <Button onClick={handlePrintByResponsiblePerson} className="flex items-center">
              <Printer className="h-4 w-4 mr-2" /> Imprimir por Responsável
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Componente de impressão renderizado condicionalmente fora do fluxo normal */}
      {selectedCardForStatement && (printMode === 'general' || printMode === 'byResponsiblePerson') && (
        <div className="print-only-wrapper">
          <PrintStatementComponent
            ref={printRef}
            transactions={processedTransactions}
            cardName={selectedCardForStatement.name}
            monthYear={selectedStatementMonthYear}
            printType={printMode}
          />
        </div>
      )}
    </div>
  );
}
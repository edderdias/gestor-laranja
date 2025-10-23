import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Edit, Trash2, ShoppingCart, CalendarIcon, ListChecks } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } generously();
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
import { format, addMonths, getMonth, getYear, isSameMonth, isSameYear, parseISO, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch"; // Importar Switch
import { Tables } from "@/integrations/supabase/types";

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
  // Remove all non-digit characters except comma
  const cleanedInput = input.replace(/[^0-9,]/g, '');
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
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  purchase_date: z.date({ required_error: "Data da compra é obrigatória" }),
  installments: z.string().transform(Number).refine(val => val >= 1, "Parcelas devem ser no mínimo 1"),
  responsible_person_id: z.string().optional(),
  is_fixed: z.boolean().default(false), // Adicionado campo para transação fixa
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

// Tipo estendido para transações no extrato, incluindo as geradas virtualmente
type CreditCardTransactionWithGeneratedFlag = Tables<'credit_card_transactions'> & {
  is_generated_fixed_instance?: boolean;
  expense_categories?: Tables<'expense_categories'>;
  responsible_persons?: Tables<'responsible_persons'>;
};

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

  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<any>(null);
  const [selectedStatementMonthYear, setSelectedStatementMonthYear] = useState(format(new Date(), "yyyy-MM"));


  const transactionForm = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: "",
      amount: 0,
      category_id: "",
      purchase_date: new Date(),
      installments: 1,
      responsible_person_id: undefined,
      is_fixed: false, // Valor padrão
    },
  });

  const isFixedTransaction = transactionForm.watch("is_fixed");

  useEffect(() => {
    if (isFixedTransaction) {
      transactionForm.setValue("installments", 1);
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
    if (isTransactionFormOpen && selectedCardForTransaction) {
      transactionForm.reset({
        description: "",
        amount: 0,
        category_id: "",
        purchase_date: new Date(),
        installments: 1,
        responsible_person_id: undefined,
        is_fixed: false,
      });
    } else if (!isTransactionFormOpen) {
      transactionForm.reset();
      setSelectedCardForTransaction(null);
    }
  }, [isTransactionFormOpen, selectedCardForTransaction, transactionForm]);

  // Buscar cartões
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

  // Buscar total gasto por cartão
  const { data: cardExpenses } = useQuery({
    queryKey: ["card_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("card_id, amount, installments")
        .not("card_id", "is", null);
      if (error) throw error;
      
      const totals = data.reduce((acc: any, expense: any) => {
        const cardId = expense.card_id;
        const total = expense.amount * (expense.installments || 1);
        acc[cardId] = (acc[cardId] || 0) + total;
        return acc;
      }, {});
      
      return totals;
    },
  });

  // Buscar categorias de despesa
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

  // Fetch transactions for the selected card statement
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["credit_card_transactions", selectedCardForStatement?.id],
    queryFn: async () => {
      if (!selectedCardForStatement?.id) return [];
      const { data, error } = await supabase
        .from("credit_card_transactions")
        .select("*, expense_categories(name), responsible_persons(name)")
        .eq("card_id", selectedCardForStatement.id)
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

  // Mutation para inserir transação de cartão de crédito
  const insertCreditCardTransactionMutation = useMutation({
    mutationFn: async (values: TransactionFormData) => {
      if (!user?.id || !selectedCardForTransaction?.id) {
        toast.error("Usuário ou cartão não selecionado. Não foi possível registrar a compra.");
        throw new Error("User or card not selected.");
      }

      if (values.is_fixed) {
        // Inserir uma única transação fixa (template)
        const transactionData = {
          description: values.description,
          amount: values.amount,
          card_id: selectedCardForTransaction.id,
          category_id: values.category_id,
          purchase_date: format(values.purchase_date, "yyyy-MM-dd"),
          installments: 1, // Transações fixas têm 1 parcela no DB
          current_installment: 1,
          created_by: user.id,
          responsible_person_id: values.responsible_person_id || null,
          is_fixed: true,
          original_fixed_transaction_id: null, // É o template original
        };

        const { error } = await supabase
          .from("credit_card_transactions")
          .insert(transactionData);

        if (error) throw error;

      } else {
        // Lidar com transações não fixas com múltiplas parcelas
        const numInstallments = values.installments;
        let firstInstallmentId: string | null = null;

        for (let i = 0; i < numInstallments; i++) {
          const currentPurchaseDate = addMonths(values.purchase_date, i);

          const transactionDescription = numInstallments > 1
            ? `${values.description} (${i + 1}/${numInstallments})`
            : values.description;

          const transactionData = {
            description: transactionDescription,
            amount: values.amount,
            card_id: selectedCardForTransaction.id,
            category_id: values.category_id,
            purchase_date: format(currentPurchaseDate, "yyyy-MM-dd"),
            installments: numInstallments,
            current_installment: i + 1,
            created_by: user.id,
            responsible_person_id: values.responsible_person_id || null,
            is_fixed: false,
            original_fixed_transaction_id: firstInstallmentId, // Link para a primeira parcela
          };

          const { data: insertedData, error } = await supabase
            .from("credit_card_transactions")
            .insert(transactionData)
            .select("id") // Select the ID to link subsequent installments
            .single();

          if (error) throw error;

          if (i === 0) {
            firstInstallmentId = insertedData.id; // Capturar o ID da primeira parcela
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["card_expenses"] });
      toast.success("Compra registrada com sucesso!");
      setIsTransactionFormOpen(false);
      setSelectedCardForTransaction(null);
      transactionForm.reset();
    },
    onError: (error) => {
      toast.error("Erro ao registrar compra: " + error.message);
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
    insertCreditCardTransactionMutation.mutate(values);
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

  const handleEdit = (card: any) => {
    setEditingCard(card);
    setIsCardFormOpen(true);
  };

  const handleLaunchPurchase = (card: any) => {
    setSelectedCardForTransaction(card);
    setIsTransactionFormOpen(true);
  };

  const handleViewStatement = (card: any) => {
    setSelectedCardForStatement(card);
    setIsStatementDialogOpen(true);
    setSelectedStatementMonthYear(format(new Date(), "yyyy-MM")); // Reset month when opening
  };

  const getAvailableLimit = (cardId: string, creditLimit: number) => {
    const spent = cardExpenses?.[cardId] || 0;
    return creditLimit - spent;
  };

  const getBrandLabel = (brand: string) => {
    return brand === "visa" ? "Visa" : "Mastercard";
  };

  // Lógica para o seletor de mês do extrato
  const generateMonthOptions = () => {
    const options = [];
    let date = addMonths(new Date(), -6); // Começa 6 meses atrás
    for (let i = 0; i < 12; i++) { // 6 meses passados + mês atual + 5 meses futuros = 12 meses
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

  // Processar transações para exibição, incluindo a replicação de transações fixas
  const processedTransactions = transactions?.flatMap(transaction => {
    const transactionPurchaseDate = parseISO(transaction.purchase_date);
    const currentMonthTransactions: CreditCardTransactionWithGeneratedFlag[] = [];

    // 1. Incluir transações não fixas que pertencem ao mês selecionado
    if (!transaction.is_fixed && isSameMonth(transactionPurchaseDate, selectedMonthDate) && isSameYear(transactionPurchaseDate, selectedMonthDate)) {
      currentMonthTransactions.push(transaction);
    } 
    // 2. Incluir transações fixas originais que pertencem ao mês selecionado
    else if (transaction.is_fixed && isSameMonth(transactionPurchaseDate, selectedMonthDate) && isSameYear(transactionPurchaseDate, selectedMonthDate)) {
      currentMonthTransactions.push(transaction);
    }
    // 3. Gerar ocorrências para transações fixas em meses futuros
    else if (transaction.is_fixed && transactionPurchaseDate <= endOfMonth(selectedMonthDate)) {
      // Verificar se já existe uma ocorrência real para este mês e esta transação fixa
      const existingOccurrence = transactions.find(
        (t) => t.original_fixed_transaction_id === transaction.id &&
               isSameMonth(parseISO(t.purchase_date), selectedMonthDate) &&
               isSameYear(parseISO(t.purchase_date), selectedMonthDate)
      );

      if (!existingOccurrence) {
        // Se não existe uma ocorrência real, cria uma instância gerada para exibição
        const displayDate = new Date(selectedYear, selectedMonth - 1, transactionPurchaseDate.getDate());
        // Ajusta o dia se o mês selecionado não tiver aquele dia (ex: 31 de fevereiro)
        if (displayDate.getMonth() !== selectedMonth - 1) {
          displayDate.setDate(0); // Vai para o último dia do mês anterior
          displayDate.setDate(displayDate.getDate() + 1); // Adiciona 1 dia para o último dia do mês atual
        }

        currentMonthTransactions.push({
          ...transaction,
          id: `temp-${transaction.id}-${selectedStatementMonthYear}`, // ID temporário para instâncias geradas
          purchase_date: format(displayDate, "yyyy-MM-dd"),
          is_generated_fixed_instance: true,
          original_fixed_transaction_id: transaction.id, // Referência ao modelo fixo original
        });
      }
    }
    return currentMonthTransactions;
  }).sort((a, b) => parseISO(a.purchase_date).getTime() - parseISO(b.purchase_date).getTime()) || [];


  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Cartões de Crédito</h1>
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

      <main className="container mx-auto px-4 py-8">
        {isLoadingCards ? (
          <p className="text-muted-foreground">Carregando cartões...</p>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const availableLimit = getAvailableLimit(card.id, card.credit_limit || 0);
              const usedPercentage = card.credit_limit 
                ? ((card.credit_limit - availableLimit) / card.credit_limit) * 100 
                : 0;

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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(card)}
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
                        <span className="text-muted-foreground">Utilizado:</span>
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
                    <div className="flex justify-end gap-2 mt-4">
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
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum cartão cadastrado. Clique em "Novo Cartão" para começar.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Dialog for launching a new credit card purchase */}
      <Dialog open={isTransactionFormOpen} onOpenChange={setIsTransactionFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar Compra no Cartão</DialogTitle>
            <CardDescription>
              Registrar uma nova compra para o cartão:{" "}
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
              <div className="grid grid-cols-2 gap-4"> {/* Layout ajustado */}
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
              {!isFixedTransaction && ( // Condicionalmente renderiza o campo de parcelas
                <FormField
                  control={transactionForm.control}
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
                <Button type="submit" disabled={insertCreditCardTransactionMutation.isPending}>
                  {insertCreditCardTransactionMutation.isPending ? "Registrando..." : "Registrar Compra"}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">Nenhuma transação encontrada para este cartão no mês selecionado.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatementDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
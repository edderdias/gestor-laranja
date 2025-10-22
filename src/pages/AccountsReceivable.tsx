import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, CheckCircle, RotateCcw, CalendarIcon, PiggyBank as PiggyBankIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, getMonth, getYear, subMonths, parseISO, addMonths, endOfMonth, isSameMonth, isSameYear } from "date-fns";
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
import { Tables } from "@/integrations/supabase/types"; // Importar tipos do Supabase

// Estender o tipo de conta para incluir a flag de instância gerada
type AccountReceivableWithGeneratedFlag = Tables<'accounts_receivable'> & {
  is_generated_fixed_instance?: boolean;
};

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  income_type_id: z.string().min(1, "Tipo de recebimento é obrigatório"),
  receive_date: z.string().min(1, "Data do recebimento é obrigatória"),
  installments: z.string().optional(),
  amount: z.string().min(1, "Valor é obrigatório"),
  source_id: z.string().min(1, "Fonte de receita é obrigatória"),
  payer_id: z.string().optional(),
  new_payer_name: z.string().optional(),
  is_fixed: z.boolean().default(false),
  responsible_person_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.payer_id === "new-payer" && !data.new_payer_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Nome do novo pagador é obrigatório",
      path: ["new_payer_name"],
    });
  } else if (!data.payer_id && data.payer_id !== "new-payer") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pagador é obrigatório",
      path: ["payer_id"],
    });
  }
  if (!data.is_fixed && (!data.installments || parseInt(data.installments) < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quantidade de parcelas é obrigatória para contas não fixas",
      path: ["installments"],
    });
  }
});

type FormData = z.infer<typeof formSchema>;

// Esquema de validação para o formulário de transferência para o cofrinho
const transferToPiggyBankSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  entry_date: z.date({ required_error: "Data é obrigatória" }),
});

type TransferToPiggyBankFormData = z.infer<typeof transferToPiggyBankSchema>;

export default function AccountsReceivable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);
  const queryClient = useQueryClient();
  
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));

  // Estados para o diálogo de confirmação de data
  const [showConfirmDateDialog, setShowConfirmDateDialog] = useState(false);
  const [currentConfirmingAccount, setCurrentConfirmingAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);
  const [selectedReceivedDate, setSelectedReceivedDate] = useState<Date | undefined>(new Date());

  // Estados e formulário para a transferência para o cofrinho
  const [isTransferToPiggyBankFormOpen, setIsTransferToPiggyBankFormOpen] = useState(false);
  const [transferringAccount, setTransferringAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);

  const transferForm = useForm<TransferToPiggyBankFormData>({
    resolver: zodResolver(transferToPiggyBankSchema),
    defaultValues: {
      description: "",
      amount: 0,
      entry_date: new Date(),
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      income_type_id: "",
      receive_date: format(new Date(), "yyyy-MM-dd"),
      installments: "1",
      amount: "",
      source_id: "",
      payer_id: "",
      new_payer_name: "",
      is_fixed: false,
      responsible_person_id: undefined,
    },
  });

  const selectedPayerId = form.watch("payer_id");
  const isFixed = form.watch("is_fixed");

  useEffect(() => {
    if (isFormOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        income_type_id: editingAccount.income_type_id || "",
        receive_date: editingAccount.receive_date,
        installments: editingAccount.installments?.toString() || (editingAccount.is_fixed ? "" : "1"),
        amount: editingAccount.amount.toString(),
        source_id: editingAccount.source_id || "",
        payer_id: editingAccount.payer_id || "",
        new_payer_name: "",
        is_fixed: editingAccount.is_fixed || false,
        responsible_person_id: editingAccount.responsible_person_id || undefined,
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        income_type_id: "",
        receive_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        source_id: "",
        payer_id: "",
        new_payer_name: "",
        is_fixed: false,
        responsible_person_id: undefined,
      });
    }
  }, [isFormOpen, editingAccount, form]);

  // Efeito para preencher o formulário de transferência para o cofrinho
  useEffect(() => {
    if (isTransferToPiggyBankFormOpen && transferringAccount) {
      transferForm.reset({
        description: `Transferência de ${transferringAccount.description}`,
        amount: transferringAccount.amount,
        entry_date: new Date(), // Data atual como padrão
      });
    } else if (!isTransferToPiggyBankFormOpen) {
      transferForm.reset({
        description: "",
        amount: 0,
        entry_date: new Date(),
      });
    }
  }, [isTransferToPiggyBankFormOpen, transferringAccount, transferForm]);


  // Buscar contas a receber
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_sources(id, name), payers(name), income_types(name), responsible_persons(id, name)")
        .order("receive_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar fontes de receita
  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_sources")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar pagadores
  const { data: payers, isLoading: isLoadingPayers } = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payers")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar tipos de recebimento
  const { data: incomeTypes, isLoading: isLoadingIncomeTypes } = useQuery({
    queryKey: ["income-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_types")
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

      let finalPayerId = values.payer_id;

      if (values.payer_id === "new-payer" && values.new_payer_name) {
        const { data: newPayer, error: newPayerError } = await supabase
          .from("payers")
          .insert({ name: values.new_payer_name })
          .select("id")
          .single();

        if (newPayerError) throw newPayerError;
        finalPayerId = newPayer.id;
        queryClient.invalidateQueries({ queryKey: ["payers"] });
      }

      const accountData = {
        description: values.description,
        income_type_id: values.income_type_id,
        receive_date: values.receive_date,
        installments: values.is_fixed ? 1 : parseInt(values.installments || "1"),
        amount: parseFloat(values.amount),
        source_id: values.source_id,
        payer_id: finalPayerId,
        created_by: user.id,
        is_fixed: values.is_fixed,
        responsible_person_id: values.responsible_person_id || null,
        original_fixed_account_id: editingAccount?.original_fixed_account_id || null, // Manter o link se for uma edição de ocorrência
      };

      if (editingAccount && !editingAccount.is_generated_fixed_instance) { // Só edita se não for uma instância gerada
        const { error } = await supabase
          .from("accounts_receivable")
          .update(accountData)
          .eq("id", editingAccount.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts_receivable")
          .insert(accountData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
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
      const { error } = await supabase
        .from("accounts_receivable")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Conta deletada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao deletar conta: " + error.message);
    },
  });

  // Confirmar recebimento (agora com data selecionável e lógica para instâncias geradas)
  const confirmReceiveMutation = useMutation({
    mutationFn: async ({ account, receivedDate }: { account: AccountReceivableWithGeneratedFlag; receivedDate: Date }) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível confirmar recebimento.");
        throw new Error("User not authenticated.");
      }

      const formattedReceivedDate = format(receivedDate, "yyyy-MM-dd");

      if (account.is_generated_fixed_instance) {
        // Se for uma instância gerada, insere uma nova conta (não fixa)
        const { error } = await supabase
          .from("accounts_receivable")
          .insert({
            description: account.description,
            income_type_id: account.income_type_id,
            receive_date: format(parseISO(account.receive_date), "yyyy-MM-dd"), // Usa a data ajustada para o mês
            installments: account.installments,
            amount: account.amount,
            source_id: account.source_id,
            payer_id: account.payer_id,
            created_by: user.id,
            is_fixed: false, // A ocorrência é uma entrada única
            responsible_person_id: account.responsible_person_id,
            received: true,
            received_date: formattedReceivedDate,
            original_fixed_account_id: account.original_fixed_account_id || account.id, // Link para o modelo fixo original
          });
        if (error) throw error;
      } else {
        // Se for uma conta existente (fixa original ou não fixa), atualiza
        const { error } = await supabase
          .from("accounts_receivable")
          .update({ received: true, received_date: formattedReceivedDate })
          .eq("id", account.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento confirmado com sucesso!");
      setShowConfirmDateDialog(false); // Fecha o diálogo
      setCurrentConfirmingAccount(null);
      setSelectedReceivedDate(new Date()); // Reseta a data
    },
    onError: (error) => {
      toast.error("Erro ao confirmar recebimento: " + error.message);
    },
  });

  // Estornar recebimento
  const reverseReceiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accounts_receivable")
        .update({ received: false, received_date: null })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento estornado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao estornar recebimento: " + error.message);
    },
  });

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
      };

      const { error } = await supabase
        .from("piggy_bank_entries")
        .insert(entryData);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] }); // Invalida o cache do cofrinho
      toast.success("Valor transferido para o cofrinho com sucesso!");
      setIsTransferToPiggyBankFormOpen(false);
      setTransferringAccount(null);
      transferForm.reset();
    },
    onError: (error) => {
      toast.error("Erro ao transferir para o cofrinho: " + error.message);
    },
  });

  const onSubmit = (values: FormData) => {
    saveMutation.mutate(values);
  };

  const onTransferSubmit = (values: TransferToPiggyBankFormData) => {
    transferToPiggyBankMutation.mutate(values);
  };

  const handleEdit = (account: AccountReceivableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Edite a conta fixa original para alterar esta ocorrência.");
      // Poderíamos redirecionar para a edição da conta original se tivéssemos o ID
      return;
    }
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleDelete = (account: AccountReceivableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Não é possível excluir uma ocorrência gerada. Exclua a conta fixa original se desejar.");
      return;
    }
    if (confirm("Tem certeza que deseja deletar esta conta?")) {
      deleteMutation.mutate(account.id);
    }
  };

  const handleReverse = (account: AccountReceivableWithGeneratedFlag) => {
    if (account.is_generated_fixed_instance) {
      toast.info("Não é possível estornar uma ocorrência gerada que ainda não foi confirmada.");
      return;
    }
    if (confirm("Tem certeza que deseja estornar este recebimento? Ele voltará para o status de 'não recebido'.")) {
      reverseReceiveMutation.mutate(account.id);
    }
  };

  // Função para abrir o diálogo de confirmação de data
  const handleConfirmReceiveClick = (account: AccountReceivableWithGeneratedFlag) => {
    setCurrentConfirmingAccount(account);
    setSelectedReceivedDate(new Date()); // Define a data padrão como hoje
    setShowConfirmDateDialog(true);
  };

  // Função para abrir o diálogo de transferência para o cofrinho
  const handleTransferToPiggyBankClick = (account: AccountReceivableWithGeneratedFlag) => {
    setTransferringAccount(account);
    setIsTransferToPiggyBankFormOpen(true);
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
    const accountReceiveDate = parseISO(account.receive_date);
    const currentMonthAccounts: AccountReceivableWithGeneratedFlag[] = [];

    // 1. Incluir contas não fixas que pertencem ao mês selecionado
    if (!account.is_fixed && isSameMonth(accountReceiveDate, selectedMonthDate) && isSameYear(accountReceiveDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    } 
    // 2. Incluir contas fixas originais que pertencem ao mês selecionado
    else if (account.is_fixed && isSameMonth(accountReceiveDate, selectedMonthDate) && isSameYear(accountReceiveDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    }
    // 3. Gerar ocorrências para contas fixas em meses futuros
    else if (account.is_fixed && accountReceiveDate <= endOfMonth(selectedMonthDate)) {
      // Verificar se já existe uma ocorrência real para este mês e esta conta fixa
      const existingOccurrence = accounts.find(
        (a) => a.original_fixed_account_id === account.id &&
               isSameMonth(parseISO(a.receive_date), selectedMonthDate) &&
               isSameYear(parseISO(a.receive_date), selectedMonthDate)
      );

      if (!existingOccurrence) {
        // Se não existe uma ocorrência real, cria uma instância gerada para exibição
        const displayDate = new Date(selectedYear, selectedMonth - 1, accountReceiveDate.getDate());
        // Ajusta o dia se o mês selecionado não tiver aquele dia (ex: 31 de fevereiro)
        if (displayDate.getMonth() !== selectedMonth - 1) {
          displayDate.setDate(0); // Vai para o último dia do mês anterior
          displayDate.setDate(displayDate.getDate() + 1); // Adiciona 1 dia para o último dia do mês atual
        }

        currentMonthAccounts.push({
          ...account,
          id: `temp-${account.id}-${selectedMonthYear}`, // ID temporário para instâncias geradas
          receive_date: format(displayDate, "yyyy-MM-dd"),
          received: false, // Instâncias geradas são sempre não recebidas por padrão
          received_date: null,
          is_generated_fixed_instance: true,
          original_fixed_account_id: account.id, // Referência ao modelo fixo original
        });
      }
    }
    return currentMonthAccounts;
  }).sort((a, b) => parseISO(a.receive_date).getTime() - parseISO(b.receive_date).getTime()) || [];

  // Filtrar contas recebidas para o resumo total (apenas do mês selecionado)
  const receivedAccounts = processedAccounts.filter(account => account.received) || [];
  const totalAmount = receivedAccounts.reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  // Calcular o valor recebido por cada recebedor (apenas contas recebidas do mês selecionado)
  const receivedByResponsiblePerson = receivedAccounts.reduce((acc: { [key: string]: number }, account) => {
    const personName = account.responsible_persons?.name || "Não Atribuído";
    const amount = account.amount * (account.installments || 1);
    acc[personName] = (acc[personName] || 0) + amount;
    return acc;
  }, {});

  // Calcular previsão de recebimento do mês (contas NÃO recebidas para o mês selecionado)
  const monthlyForecast = processedAccounts.filter(account => !account.received).reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
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
                  <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle>
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
                            <Input {...field} placeholder="Ex: Pagamento cliente X" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="income_type_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Recebimento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {isLoadingIncomeTypes ? (
                                  <SelectItem value="loading" disabled>Carregando...</SelectItem>
                                ) : (
                                  incomeTypes?.map((type) => (
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
                              <FormLabel className="text-base">Receita Fixa</FormLabel>
                              <FormDescription>
                                Marque se esta receita se repete todos os meses.
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="receive_date"
                        render={({ field }) => (
                          <FormItem className={cn(isFixed && "col-span-2")}>
                            <FormLabel>Data do Recebimento</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!isFixed && (
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

                    {isFixed && (
                      <div className="grid grid-cols-1 gap-4">
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="source_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fonte de Receita</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a fonte" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sources?.map((source) => (
                                  <SelectItem key={source.id} value={source.id}>
                                    {source.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="bg-muted p-4 rounded-lg flex items-center">
                        <p className="text-sm font-medium">
                          Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * (isFixed ? 1 : parseInt(form.watch("installments") || "1"))).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="payer_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pagador</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o pagador" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingPayers ? (
                                <SelectItem value="loading" disabled>Carregando...</SelectItem>
                              ) : (
                                <>
                                  {payers?.map((payer) => (
                                    <SelectItem key={payer.id} value={payer.id}>
                                      {payer.name}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="new-payer">
                                    + Novo Pagador
                                  </SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedPayerId === "new-payer" && (
                      <FormField
                        control={form.control}
                        name="new_payer_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome do Novo Pagador</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Nome do novo pagador" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="responsible_person_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recebedor</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o recebedor" />
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
                <span className="font-bold text-income">R$ {monthlyForecast.toFixed(2)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-income">
                Total Recebido: R$ {totalAmount.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recebido por Recebedor</CardTitle>
            </CardHeader>
            <CardContent>
              {receivedByResponsiblePerson && Object.keys(receivedByResponsiblePerson).length > 0 ? (
                <ul className="space-y-2">
                  {Object.entries(receivedByResponsiblePerson).map(([name, amount]) => (
                    <li key={name} className="flex justify-between text-sm">
                      <span>{name}:</span>
                      <span className="font-semibold text-income">R$ {(amount as number).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum valor recebido por recebedor.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {loadingAccounts ? (
          <p className="text-muted-foreground">Carregando contas...</p>
        ) : processedAccounts && processedAccounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {processedAccounts.map((account) => (
              <Card key={account.id} className={cn(account.received ? "border-l-4 border-income" : "border-l-4 border-muted")}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{account.description}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Tipo:</span>{" "}
                          {account.income_types?.name || "N/A"}
                        </div>
                        <div>
                          <span className="font-medium">Recebimento:</span>{" "}
                          {format(new Date(account.receive_date), "dd/MM/yyyy")}
                        </div>
                        {!account.is_fixed && (
                          <div>
                            <span className="font-medium">Parcelas:</span> {account.installments || 1}x
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-income font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.income_sources && (
                          <div>
                            <span className="font-medium">Fonte:</span> {account.income_sources.name}
                          </div>
                        )}
                        {account.payers && (
                          <div>
                            <span className="font-medium">Pagador:</span> {account.payers.name}
                          </div>
                        )}
                        {account.responsible_persons && (
                          <div>
                            <span className="font-medium">Recebedor:</span> {account.responsible_persons.name}
                          </div>
                        )}
                        {account.received && (
                          <div className="col-span-2 flex items-center gap-1 text-income">
                            <CheckCircle className="h-4 w-4" />
                            <span className="font-medium">Recebido em: {format(new Date(account.received_date), "dd/MM/yyyy")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {account.received ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleReverse(account)}
                          disabled={reverseReceiveMutation.isPending || account.is_generated_fixed_instance} // Desabilita estorno para geradas
                          className="text-destructive border-destructive hover:bg-destructive/10"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" /> Estornar
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleConfirmReceiveClick(account)}
                          disabled={confirmReceiveMutation.isPending}
                          className="text-income border-income hover:bg-income/10"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" /> Confirmar
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEdit(account)}
                        disabled={account.is_generated_fixed_instance} // Desabilita edição para geradas
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {account.received && ( // Condição adicionada aqui
                        <Dialog open={isTransferToPiggyBankFormOpen && transferringAccount?.id === account.id} onOpenChange={setIsTransferToPiggyBankFormOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleTransferToPiggyBankClick(account)}
                              disabled={transferToPiggyBankMutation.isPending || account.is_generated_fixed_instance} // Desabilita para geradas
                            >
                              <PiggyBankIcon className="h-4 w-4 text-neutral" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Transferir para Cofrinho</DialogTitle>
                              <CardDescription>
                                Adicione o valor de "{transferringAccount?.description}" ao seu cofrinho.
                              </CardDescription>
                            </DialogHeader>
                            <Form {...transferForm}>
                              <form onSubmit={transferForm.handleSubmit(onTransferSubmit)} className="space-y-4">
                                <FormField
                                  control={transferForm.control}
                                  name="description"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Descrição</FormLabel>
                                      <FormControl>
                                        <Input {...field} placeholder="Ex: Economia extra, Bônus" />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={transferForm.control}
                                  name="amount"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valor</FormLabel>
                                      <FormControl>
                                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={transferForm.control}
                                  name="entry_date"
                                  render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                      <FormLabel>Data da Transferência</FormLabel>
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
                                <DialogFooter>
                                  <Button type="button" variant="outline" onClick={() => setIsTransferToPiggyBankFormOpen(false)}>
                                    Cancelar
                                  </Button>
                                  <Button type="submit" disabled={transferToPiggyBankMutation.isPending}>
                                    {transferToPiggyBankMutation.isPending ? "Transferindo..." : "Transferir"}
                                  </Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(account)}
                        disabled={deleteMutation.isPending || account.is_generated_fixed_instance} // Desabilita exclusão para geradas
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
              Nenhuma conta a receber cadastrada para o mês selecionado.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Diálogo para selecionar a data de recebimento */}
      <Dialog open={showConfirmDateDialog} onOpenChange={setShowConfirmDateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Data de Recebimento</DialogTitle>
            <CardDescription>Selecione a data em que o recebimento ocorreu.</CardDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedReceivedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedReceivedDate ? format(selectedReceivedDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedReceivedDate}
                  onSelect={setSelectedReceivedDate}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => {
                if (currentConfirmingAccount && selectedReceivedDate) {
                  confirmReceiveMutation.mutate({ 
                    account: currentConfirmingAccount, 
                    receivedDate: selectedReceivedDate 
                  });
                } else {
                  toast.error("Selecione uma data para confirmar o recebimento.");
                }
              }}
              disabled={confirmReceiveMutation.isPending || !selectedReceivedDate}
            >
              {confirmReceiveMutation.isPending ? "Confirmando..." : "Confirmar Recebimento"}
            </Button>
            <Button variant="outline" onClick={() => setShowConfirmDateDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
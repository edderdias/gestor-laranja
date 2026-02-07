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
import { Tables } from "@/integrations/supabase/types";

// Estender o tipo de conta para incluir a flag de instância gerada e campos vinculados
type AccountReceivableWithGeneratedFlag = Tables<'accounts_receivable'> & {
  is_generated_fixed_instance?: boolean;
  income_sources?: { name: string };
  payers?: { name: string };
  income_types?: { name: string };
  responsible_persons?: { name: string };
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

const transferToPiggyBankSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  entry_date: z.date({ required_error: "Data é obrigatória" }),
  bank_id: z.string().min(1, "Banco é obrigatório"),
});

type TransferToPiggyBankFormData = z.infer<typeof transferToPiggyBankSchema>;

export default function AccountsReceivable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);
  const queryClient = useQueryClient();
  
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [showConfirmDateDialog, setShowConfirmDateDialog] = useState(false);
  const [currentConfirmingAccount, setCurrentConfirmingAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);
  const [selectedReceivedDate, setSelectedReceivedDate] = useState<Date | undefined>(new Date());
  const [isTransferToPiggyBankFormOpen, setIsTransferToPiggyBankFormOpen] = useState(false);
  const [transferringAccount, setTransferringAccount] = useState<AccountReceivableWithGeneratedFlag | null>(null);

  const transferForm = useForm<TransferToPiggyBankFormData>({
    resolver: zodResolver(transferToPiggyBankSchema),
    defaultValues: {
      description: "",
      amount: 0,
      entry_date: new Date(),
      bank_id: "",
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

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_sources(name), payers(name), income_types(name), responsible_persons(name)")
        .order("receive_date", { ascending: true });
      
      if (error) throw error;
      return data as AccountReceivableWithGeneratedFlag[];
    },
  });

  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_sources").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: payers, isLoading: isLoadingPayers } = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: incomeTypes, isLoading: isLoadingIncomeTypes } = useQuery({
    queryKey: ["income-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: responsiblePersons, isLoading: isLoadingResponsiblePersons } = useQuery({
    queryKey: ["responsible-persons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("responsible_persons").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: banks, isLoading: isLoadingBanks } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!user?.id) throw new Error("User not authenticated.");
      let finalPayerId = values.payer_id;
      if (values.payer_id === "new-payer" && values.new_payer_name) {
        const { data: newPayer, error: newPayerError } = await supabase.from("payers").insert({ name: values.new_payer_name }).select("id").single();
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
        original_fixed_account_id: editingAccount?.original_fixed_account_id || null,
      };
      if (editingAccount && !editingAccount.is_generated_fixed_instance) {
        const { error } = await supabase.from("accounts_receivable").update(accountData).eq("id", editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts_receivable").insert(accountData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success(editingAccount ? "Conta atualizada!" : "Conta criada!");
      setIsFormOpen(false);
      setEditingAccount(null);
      form.reset();
    },
    onError: (error: any) => toast.error("Erro ao salvar: " + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_receivable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Conta deletada!");
    },
    onError: (error: any) => toast.error("Erro ao deletar: " + error.message),
  });

  const confirmReceiveMutation = useMutation({
    mutationFn: async ({ account, receivedDate }: { account: AccountReceivableWithGeneratedFlag; receivedDate: Date }) => {
      if (!user?.id) throw new Error("User not authenticated.");
      const formattedReceivedDate = format(receivedDate, "yyyy-MM-dd");
      if (account.is_generated_fixed_instance) {
        const { error } = await supabase.from("accounts_receivable").insert({
          description: account.description,
          income_type_id: account.income_type_id,
          receive_date: account.receive_date,
          installments: account.installments,
          amount: account.amount,
          source_id: account.source_id,
          payer_id: account.payer_id,
          created_by: user.id,
          is_fixed: false,
          responsible_person_id: account.responsible_person_id,
          received: true,
          received_date: formattedReceivedDate,
          original_fixed_account_id: account.original_fixed_account_id || account.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts_receivable").update({ received: true, received_date: formattedReceivedDate }).eq("id", account.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento confirmado!");
      setShowConfirmDateDialog(false);
    },
    onError: (error: any) => toast.error("Erro ao confirmar: " + error.message),
  });

  const reverseReceiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_receivable").update({ received: false, received_date: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento estornado!");
    },
    onError: (error: any) => toast.error("Erro ao estornar: " + error.message),
  });

  const transferToPiggyBankMutation = useMutation({
    mutationFn: async (values: TransferToPiggyBankFormData) => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase.from("piggy_bank_entries").insert({
        description: values.description,
        amount: values.amount,
        entry_date: format(values.entry_date, "yyyy-MM-dd"),
        type: "deposit",
        user_id: user.id,
        bank_id: values.bank_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success("Transferido para o cofrinho!");
      setIsTransferToPiggyBankFormOpen(false);
    },
    onError: (error: any) => toast.error("Erro ao transferir: " + error.message),
  });

  const generateMonthOptions = () => {
    const options = [];
    let date = subMonths(new Date(), 11);
    for (let i = 0; i < 18; i++) {
      options.push({ value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy", { locale: ptBR }) });
      date = addMonths(date, 1);
    }
    return options;
  };

  const monthOptions = generateMonthOptions();
  const [selectedYear, selectedMonth] = selectedMonthYear.split('-').map(Number);
  const selectedMonthDate = parseISO(`${selectedMonthYear}-01`);

  const processedAccounts = (accounts?.flatMap(account => {
    const accountReceiveDate = parseISO(account.receive_date);
    const currentMonthAccounts: AccountReceivableWithGeneratedFlag[] = [];
    if (!account.is_fixed && isSameMonth(accountReceiveDate, selectedMonthDate) && isSameYear(accountReceiveDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    } else if (account.is_fixed && isSameMonth(accountReceiveDate, selectedMonthDate) && isSameYear(accountReceiveDate, selectedMonthDate)) {
      currentMonthAccounts.push(account);
    } else if (account.is_fixed && accountReceiveDate <= endOfMonth(selectedMonthDate)) {
      const existingOccurrence = accounts.find(a => a.original_fixed_account_id === account.id && isSameMonth(parseISO(a.receive_date), selectedMonthDate) && isSameYear(parseISO(a.receive_date), selectedMonthDate));
      if (!existingOccurrence) {
        const displayDate = new Date(selectedYear, selectedMonth - 1, accountReceiveDate.getDate());
        if (displayDate.getMonth() !== selectedMonth - 1) displayDate.setDate(0);
        currentMonthAccounts.push({
          ...account,
          id: `temp-${account.id}-${selectedMonthYear}`,
          receive_date: format(displayDate, "yyyy-MM-dd"),
          received: false,
          received_date: null,
          is_generated_fixed_instance: true,
          original_fixed_account_id: account.id,
        });
      }
    }
    return currentMonthAccounts;
  }) || []).sort((a, b) => parseISO(a.receive_date).getTime() - parseISO(b.receive_date).getTime());

  const receivedAccounts = processedAccounts.filter(account => account.received);
  const totalAmount = receivedAccounts.reduce((sum, account) => sum + (account.amount * (account.installments || 1)), 0);
  const monthlyForecast = processedAccounts.filter(account => !account.received).reduce((sum, account) => sum + (account.amount * (account.installments || 1)), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <div className="flex items-center gap-4">
            <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
              <SelectContent>{monthOptions.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}</SelectContent>
            </Select>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild><Button onClick={() => setEditingAccount(null)}><Plus className="mr-2 h-4 w-4" /> Nova Conta</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle></DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="income_type_id" render={({ field }) => (<FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{incomeTypes?.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="is_fixed" render={({ field }) => (<FormItem className="flex items-center justify-between border p-3 rounded-lg"><FormLabel>Fixa</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="receive_date" render={({ field }) => (<FormItem><FormLabel>Data</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    {!isFixed && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="installments" render={({ field }) => (<FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                    )}
                    {isFixed && (<FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />)}
                    <FormField control={form.control} name="source_id" render={({ field }) => (<FormItem><FormLabel>Fonte</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{sources?.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="payer_id" render={({ field }) => (<FormItem><FormLabel>Pagador</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{payers?.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}<SelectItem value="new-payer">+ Novo</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    {selectedPayerId === "new-payer" && (<FormField control={form.control} name="new_payer_name" render={({ field }) => (<FormItem><FormLabel>Nome do Novo Pagador</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />)}
                    <FormField control={form.control} name="responsible_person_id" render={({ field }) => (<FormItem><FormLabel>Recebedor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{responsiblePersons?.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>Salvar</Button></DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card><CardHeader><CardTitle>Total Recebido</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-income">R$ {totalAmount.toFixed(2)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Previsão Pendente</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-muted-foreground">R$ {monthlyForecast.toFixed(2)}</div></CardContent></Card>
        </div>
        {loadingAccounts ? (<p>Carregando...</p>) : (
          <div className="grid gap-4 md:grid-cols-2">
            {processedAccounts.map((account) => (
              <Card key={account.id} className={cn(account.received ? "border-l-4 border-income" : "border-l-4 border-muted")}>
                <CardContent className="pt-6 flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="font-semibold">{account.description}</h3>
                    <p className="text-sm text-muted-foreground">{format(parseISO(account.receive_date), "dd/MM/yyyy")} - R$ {account.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Pagador: {account.payers?.name || "N/A"} | Recebedor: {account.responsible_persons?.name || "N/A"}</p>
                  </div>
                  <div className="flex gap-2">
                    {account.received ? (
                      <Button variant="outline" size="sm" onClick={() => reverseReceiveMutation.mutate(account.id)}><RotateCcw className="h-4 w-4" /></Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => { setCurrentConfirmingAccount(account); setShowConfirmDateDialog(true); }}><CheckCircle className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(account)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Dialog open={showConfirmDateDialog} onOpenChange={setShowConfirmDateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Data</DialogTitle></DialogHeader>
          <div className="py-4"><Calendar mode="single" selected={selectedReceivedDate} onSelect={setSelectedReceivedDate} locale={ptBR} /></div>
          <DialogFooter><Button onClick={() => currentConfirmingAccount && selectedReceivedDate && confirmReceiveMutation.mutate({ account: currentConfirmingAccount, receivedDate: selectedReceivedDate })}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
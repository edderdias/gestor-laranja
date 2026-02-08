import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, CheckCircle, RotateCcw, PiggyBank as PiggyIcon } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, endOfMonth, isSameMonth, isSameYear, subMonths, isValid, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Tables } from "@/integrations/supabase/types";

type AccountReceivableWithRelations = Tables<'accounts_receivable'> & {
  is_generated_fixed_instance?: boolean;
  income_sources?: { name: string } | null;
  payers?: { name: string } | null;
  income_types?: { name: string } | null;
  responsible_persons?: { name: string } | null;
};

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  income_type_id: z.string().min(1, "Tipo de recebimento é obrigatório"),
  receive_date: z.string().min(1, "Data do recebimento é obrigatória"),
  installments: z.string().optional().nullable(),
  amount: z.string().min(1, "Valor é obrigatório"),
  source_id: z.string().min(1, "Fonte de receita é obrigatória"),
  payer_id: z.string().optional().nullable(),
  new_payer_name: z.string().optional().nullable(),
  is_fixed: z.boolean().default(false),
  responsible_person_id: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

const defaultFormValues = {
  description: "",
  income_type_id: "",
  receive_date: format(new Date(), "yyyy-MM-dd"),
  installments: "1",
  amount: "",
  source_id: "",
  payer_id: "",
  new_payer_name: "",
  is_fixed: false,
  responsible_person_id: null,
};

export default function AccountsReceivable() {
  const { user, familyData } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountReceivableWithRelations | null>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [showConfirmDateDialog, setShowConfirmDateDialog] = useState(false);
  const [currentConfirmingAccount, setCurrentConfirmingAccount] = useState<AccountReceivableWithRelations | null>(null);
  const [selectedReceivedDate, setSelectedReceivedDate] = useState<Date | undefined>(new Date());

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const isFixed = form.watch("is_fixed");
  const selectedPayerId = form.watch("payer_id");

  // Efeito para carregar dados no formulário ao editar
  useEffect(() => {
    if (editingAccount) {
      form.reset({
        description: editingAccount.description,
        income_type_id: editingAccount.income_type_id,
        receive_date: editingAccount.receive_date,
        installments: editingAccount.installments?.toString() || "1",
        amount: editingAccount.amount.toString(),
        source_id: editingAccount.source_id,
        payer_id: editingAccount.payer_id,
        new_payer_name: "",
        is_fixed: editingAccount.is_fixed || false,
        responsible_person_id: editingAccount.responsible_person_id,
      });
    } else {
      form.reset(defaultFormValues);
    }
  }, [editingAccount, form]);

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable", familyData.id],
    queryFn: async () => {
      let query = supabase
        .from("accounts_receivable")
        .select("*, income_sources(name), payers(name), income_types(name), responsible_persons(name)");
      
      if (familyData.id) {
        query = query.eq("family_id", familyData.id);
      } else {
        query = query.eq("created_by", user?.id);
      }

      const { data, error } = await query.order("receive_date", { ascending: true });
      if (error) throw error;
      return data as AccountReceivableWithRelations[];
    },
    enabled: !!user?.id,
  });

  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_sources").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: payers } = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: incomeTypes } = useQuery({
    queryKey: ["income-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: responsiblePersons } = useQuery({
    queryKey: ["responsible-persons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("responsible_persons").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: banks } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!user?.id) throw new Error("Usuário não autenticado.");
      
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
        payer_id: finalPayerId || null,
        created_by: user.id,
        family_id: familyData.id,
        is_fixed: values.is_fixed,
        responsible_person_id: values.responsible_person_id || null,
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
      toast.success("Conta salva com sucesso!");
      setIsFormOpen(false);
      setEditingAccount(null);
    },
    onError: (error: any) => toast.error("Erro ao salvar: " + error.message),
  });

  const confirmReceivedMutation = useMutation({
    mutationFn: async ({ account, receivedDate }: { account: AccountReceivableWithRelations; receivedDate: Date }) => {
      if (!user?.id) throw new Error("Não autenticado");
      const formattedDate = format(receivedDate, "yyyy-MM-dd");

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
          family_id: familyData.id,
          is_fixed: false,
          responsible_person_id: account.responsible_person_id,
          received: true,
          received_date: formattedDate,
          original_fixed_account_id: account.original_fixed_account_id || account.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts_receivable").update({ 
          received: true, 
          received_date: formattedDate 
        }).eq("id", account.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento confirmado!");
      setShowConfirmDateDialog(false);
    },
  });

  const reverseReceivedMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_receivable").update({ 
        received: false, 
        received_date: null 
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Recebimento estornado!");
    },
  });

  const transferToPiggyBankMutation = useMutation({
    mutationFn: async (account: AccountReceivableWithRelations) => {
      if (!user?.id) throw new Error("Não autenticado");
      
      const firstBank = banks?.[0];
      if (!firstBank) throw new Error("Cadastre um banco nas configurações primeiro.");

      const { error } = await supabase.from("piggy_bank_entries").insert({
        description: `Transferência: ${account.description}`,
        amount: account.amount,
        type: "deposit",
        entry_date: format(new Date(), "yyyy-MM-dd"),
        user_id: user.id,
        family_id: familyData.id,
        bank_id: firstBank.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success("Valor transferido para o cofrinho!");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_receivable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Conta removida!");
    },
  });

  const processedAccounts = useMemo(() => {
    if (!accounts) return [];
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const targetMonthDate = parseISO(`${selectedMonthYear}-01`);

    return accounts.flatMap(account => {
      const dueDate = parseISO(account.receive_date);
      if (!isValid(dueDate)) return [];

      const results: AccountReceivableWithRelations[] = [];

      if (!account.is_fixed && isSameMonth(dueDate, targetMonthDate) && isSameYear(dueDate, targetMonthDate)) {
        results.push(account);
      } else if (account.is_fixed) {
        if (isSameMonth(dueDate, targetMonthDate) && isSameYear(dueDate, targetMonthDate)) {
          results.push(account);
        } else if (dueDate <= endOfMonth(targetMonthDate)) {
          const exists = accounts.find(a => 
            a.original_fixed_account_id === account.id && 
            isSameMonth(parseISO(a.receive_date), targetMonthDate) &&
            isSameYear(parseISO(a.receive_date), targetMonthDate)
          );

          if (!exists) {
            const displayDate = new Date(year, month - 1, dueDate.getDate());
            if (displayDate.getMonth() !== month - 1) displayDate.setDate(0);

            results.push({
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
      }
      return results;
    }).sort((a, b) => parseISO(a.receive_date).getTime() - parseISO(b.receive_date).getTime());
  }, [accounts, selectedMonthYear]);

  const totalReceived = processedAccounts.filter(a => a.received).reduce((sum, a) => sum + a.amount, 0);
  const totalForecast = processedAccounts.reduce((sum, a) => sum + a.amount, 0);

  const receivedByPerson = useMemo(() => {
    const totals: Record<string, number> = {};
    processedAccounts.filter(a => a.received).forEach(a => {
      const name = a.responsible_persons?.name || "Não Atribuído";
      totals[name] = (totals[name] || 0) + a.amount;
    });
    return Object.entries(totals);
  }, [processedAccounts]);

  const monthOptions = useMemo(() => {
    const options = [];
    let date = subMonths(new Date(), 6);
    for (let i = 0; i < 13; i++) {
      options.push({ value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy", { locale: ptBR }) });
      date = addMonths(date, 1);
    }
    return options;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <div className="flex items-center gap-4">
            <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) setEditingAccount(null);
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingAccount(null); form.reset(defaultFormValues); }}>
                  <Plus className="mr-2 h-4 w-4" /> Nova Conta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle></DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="income_type_id" render={({ field }) => (<FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{incomeTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="is_fixed" render={({ field }) => (<FormItem className="flex items-center justify-between border p-3 rounded-lg"><FormLabel>Conta Fixa</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="receive_date" render={({ field }) => (<FormItem><FormLabel>Data</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 gap-4">
                      {!isFixed && <FormField control={form.control} name="installments" render={({ field }) => (<FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} value={field.value || "1"} /></FormControl><FormMessage /></FormItem>)} />}
                      <FormField control={form.control} name="amount" render={({ field }) => (<FormItem className={cn(isFixed && "col-span-2")}><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="source_id" render={({ field }) => (<FormItem><FormLabel>Fonte</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{sources?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="payer_id" render={({ field }) => (<FormItem><FormLabel>Pagador</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{payers?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}<SelectItem value="new-payer">+ Novo Pagador</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    {selectedPayerId === "new-payer" && <FormField control={form.control} name="new_payer_name" render={({ field }) => (<FormItem><FormLabel>Nome do Novo Pagador</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />}
                    <FormField control={form.control} name="responsible_person_id" render={({ field }) => (<FormItem><FormLabel>Recebedor</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{responsiblePersons?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>Salvar</Button></DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-semibold">Resumo Total</CardTitle>
                <span className="text-xs text-muted-foreground">Previsão do Mês: <span className="text-income font-bold">R$ {totalForecast.toFixed(2)}</span></span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-income">Total Recebido: R$ {totalReceived.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Recebido por Recebedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {receivedByPerson.map(([name, amount]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span>{name}:</span>
                    <span className="text-income font-medium">R$ {amount.toFixed(2)}</span>
                  </div>
                ))}
                {receivedByPerson.length === 0 && <p className="text-sm text-muted-foreground">Nenhum recebimento este mês.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loadingAccounts ? (
            <div className="col-span-2 text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
          ) : processedAccounts.length > 0 ? processedAccounts.map(account => (
            <Card key={account.id} className={cn("border-l-4 hover:shadow-md transition-shadow", account.received ? "border-income" : "border-destructive")}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-4">{account.description}</h3>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                      <div className="space-y-1">
                        <p><span className="text-muted-foreground">Tipo:</span> {account.income_types?.name || "N/A"}</p>
                        <p><span className="text-muted-foreground">Valor da Parcela:</span> <span className="text-income font-bold">R$ {account.amount.toFixed(2)}</span></p>
                        <p><span className="text-muted-foreground">Fonte:</span> {account.income_sources?.name || "N/A"}</p>
                        <p><span className="text-muted-foreground">Recebedor:</span> {account.responsible_persons?.name || "N/A"}</p>
                      </div>
                      <div className="space-y-1">
                        <p><span className="text-muted-foreground">Recebimento:</span> {format(parseISO(account.receive_date), "dd/MM/yyyy")}</p>
                        <p><span className="text-muted-foreground">Valor Total:</span> <span className="text-income font-bold">R$ {account.amount.toFixed(2)}</span></p>
                        <p><span className="text-muted-foreground">Pagador:</span> {account.payers?.name || "N/A"}</p>
                      </div>
                    </div>
                    {account.received && account.received_date && (
                      <div className="mt-4 flex items-center gap-1 text-income font-medium text-sm">
                        <CheckCircle className="h-4 w-4" /> Recebido em: {format(parseISO(account.received_date), "dd/MM/yyyy")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 ml-4">
                    {account.received ? (
                      <Button variant="outline" size="sm" onClick={() => reverseReceivedMutation.mutate(account.id)} className="text-destructive border-destructive hover:bg-destructive/10 h-8"><RotateCcw className="h-4 w-4 mr-2" /> Estornar</Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => { setCurrentConfirmingAccount(account); setShowConfirmDateDialog(true); }} className="text-income border-income hover:bg-income/10 h-8"><CheckCircle className="h-4 w-4 mr-2" /> Receber</Button>
                    )}
                    <div className="flex flex-col items-center gap-4 mt-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingAccount(account); setIsFormOpen(true); }} disabled={account.is_generated_fixed_instance}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600" onClick={() => transferToPiggyBankMutation.mutate(account)}><PiggyIcon className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(account.id)} disabled={account.is_generated_fixed_instance}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )) : <div className="col-span-2 text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">Nenhuma conta encontrada para este mês.</div>}
        </div>
      </div>

      <Dialog open={showConfirmDateDialog} onOpenChange={setShowConfirmDateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Recebimento</DialogTitle></DialogHeader>
          <div className="py-4 flex justify-center"><Calendar mode="single" selected={selectedReceivedDate} onSelect={setSelectedReceivedDate} locale={ptBR} /></div>
          <DialogFooter><Button onClick={() => currentConfirmingAccount && selectedReceivedDate && confirmReceivedMutation.mutate({ account: currentConfirmingAccount, receivedDate: selectedReceivedDate })}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, endOfMonth, isSameMonth, isSameYear, subMonths, isValid, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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
});

type FormData = z.infer<typeof formSchema>;

export default function AccountsReceivable() {
  const { user, familyMemberIds } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountReceivableWithRelations | null>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));

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

  const isFixed = form.watch("is_fixed");
  const selectedPayerId = form.watch("payer_id");

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_sources(name), payers(name), income_types(name), responsible_persons(name)")
        .in("created_by", familyMemberIds)
        .order("receive_date", { ascending: true });
      if (error) throw error;
      return data as AccountReceivableWithRelations[];
    },
    enabled: familyMemberIds.length > 0,
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
  const totalPending = processedAccounts.filter(a => !a.received).reduce((sum, a) => sum + a.amount, 0);

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
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild><Button onClick={() => setEditingAccount(null)}><Plus className="mr-2 h-4 w-4" /> Nova Conta</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle></DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="income_type_id" render={({ field }) => (<FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{incomeTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="is_fixed" render={({ field }) => (<FormItem className="flex items-center justify-between border p-3 rounded-lg"><FormLabel>Conta Fixa</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="receive_date" render={({ field }) => (<FormItem><FormLabel>Data</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 gap-4">
                      {!isFixed && <FormField control={form.control} name="installments" render={({ field }) => (<FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />}
                      <FormField control={form.control} name="amount" render={({ field }) => (<FormItem className={cn(isFixed && "col-span-2")}><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="source_id" render={({ field }) => (<FormItem><FormLabel>Fonte</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{sources?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="payer_id" render={({ field }) => (<FormItem><FormLabel>Pagador</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{payers?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}<SelectItem value="new-payer">+ Novo Pagador</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    {selectedPayerId === "new-payer" && <FormField control={form.control} name="new_payer_name" render={({ field }) => (<FormItem><FormLabel>Nome do Novo Pagador</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />}
                    <FormField control={form.control} name="responsible_person_id" render={({ field }) => (<FormItem><FormLabel>Recebedor</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{responsiblePersons?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>Salvar</Button></DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card><CardHeader><CardTitle>Total Recebido</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-income">R$ {totalReceived.toFixed(2)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Previsão Pendente</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-muted-foreground">R$ {totalPending.toFixed(2)}</div></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loadingAccounts ? <p className="col-span-2 text-center py-12">Carregando contas...</p> : processedAccounts.length > 0 ? processedAccounts.map(account => (
            <Card key={account.id} className={cn("border-l-4", account.received ? "border-income" : "border-muted")}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{account.description}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div><span className="font-medium">Data:</span> {format(parseISO(account.receive_date), "dd/MM/yyyy")}</div>
                      <div><span className="font-medium">Valor:</span> R$ {account.amount.toFixed(2)}</div>
                      <div><span className="font-medium">Fonte:</span> {account.income_sources?.name || "N/A"}</div>
                      <div><span className="font-medium">Pagador:</span> {account.payers?.name || "N/A"}</div>
                      <div><span className="font-medium">Recebedor:</span> {account.responsible_persons?.name || "N/A"}</div>
                      {account.received && account.received_date && (
                        <div className="col-span-2 text-income font-medium">Recebido em: {format(parseISO(account.received_date), "dd/MM/yyyy")}</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )) : <div className="col-span-2 text-center py-12 text-muted-foreground">Nenhuma conta encontrada para este mês.</div>}
        </div>
      </div>
    </div>
  );
}
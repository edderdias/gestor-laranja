import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, CheckCircle, RotateCcw } from "lucide-react";
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

type AccountPayableWithRelations = Tables<'accounts_payable'> & {
  is_generated_fixed_instance?: boolean;
  expense_categories?: { name: string } | null;
  credit_cards?: { name: string } | null;
  payment_types?: { name: string } | null;
  responsible_persons?: { name: string } | null;
};

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  payment_type_id: z.string().min(1, "Tipo de pagamento é obrigatório"),
  card_id: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  installments: z.string().optional().nullable(),
  amount: z.string().min(1, "Valor é obrigatório"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  is_fixed: z.boolean().default(false),
  responsible_person_id: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

const defaultFormValues = {
  description: "",
  payment_type_id: "",
  card_id: null,
  purchase_date: format(new Date(), "yyyy-MM-dd"),
  due_date: format(new Date(), "yyyy-MM-dd"),
  installments: "1",
  amount: "",
  category_id: "",
  is_fixed: false,
  responsible_person_id: null,
};

export default function AccountsPayable() {
  const { user, familyData } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountPayableWithRelations | null>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [showConfirmPaidDateDialog, setShowConfirmPaidDateDialog] = useState(false);
  const [currentConfirmingAccount, setCurrentConfirmingAccount] = useState<AccountPayableWithRelations | null>(null);
  const [selectedPaidDate, setSelectedPaidDate] = useState<Date | undefined>(new Date());

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const isFixed = form.watch("is_fixed");
  const selectedPaymentTypeId = form.watch("payment_type_id");

  // Efeito para carregar dados no formulário ao editar
  useEffect(() => {
    if (editingAccount) {
      form.reset({
        description: editingAccount.description,
        payment_type_id: editingAccount.payment_type_id,
        card_id: editingAccount.card_id,
        purchase_date: editingAccount.purchase_date,
        due_date: editingAccount.due_date,
        installments: editingAccount.installments?.toString() || "1",
        amount: editingAccount.amount.toString(),
        category_id: editingAccount.category_id,
        is_fixed: editingAccount.is_fixed || false,
        responsible_person_id: editingAccount.responsible_person_id,
      });
    } else {
      form.reset(defaultFormValues);
    }
  }, [editingAccount, form]);

  const { data: paymentTypes } = useQuery({
    queryKey: ["payment-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const creditCardPaymentTypeId = paymentTypes?.find(pt => pt.name.toLowerCase().includes("cartao"))?.id;

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-payable", familyData.id],
    queryFn: async () => {
      let query = supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), credit_cards(name), payment_types(name), responsible_persons(name)");
      
      if (familyData.id) {
        query = query.eq("family_id", familyData.id);
      } else {
        query = query.eq("created_by", user?.id);
      }

      const { data, error } = await query.order("due_date", { ascending: true });
      if (error) throw error;
      return data as AccountPayableWithRelations[];
    },
    enabled: !!user?.id,
  });

  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: creditCards } = useQuery({
    queryKey: ["credit_cards", familyData.id],
    queryFn: async () => {
      let query = supabase.from("credit_cards").select("*");
      if (familyData.id) {
        query = query.eq("family_id", familyData.id);
      } else {
        query = query.eq("created_by", user?.id);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
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
      if (!user?.id) throw new Error("Não autenticado");
      
      const accountData = {
        description: values.description,
        payment_type_id: values.payment_type_id,
        card_id: values.payment_type_id === creditCardPaymentTypeId ? values.card_id : null,
        purchase_date: values.purchase_date || null,
        due_date: values.due_date,
        installments: values.is_fixed ? 1 : parseInt(values.installments || "1"),
        amount: parseFloat(values.amount),
        category_id: values.category_id,
        created_by: user.id,
        family_id: familyData.id,
        is_fixed: values.is_fixed,
        responsible_person_id: values.responsible_person_id || null,
      };

      if (editingAccount && !editingAccount.is_generated_fixed_instance) {
        const { error } = await supabase.from("accounts_payable").update(accountData).eq("id", editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts_payable").insert(accountData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      setIsFormOpen(false);
      setEditingAccount(null);
      toast.success("Conta salva com sucesso!");
    },
    onError: (error: any) => toast.error("Erro ao salvar: " + error.message),
  });

  const confirmPaidMutation = useMutation({
    mutationFn: async ({ account, paidDate }: { account: AccountPayableWithRelations; paidDate: Date }) => {
      if (!user?.id) throw new Error("Não autenticado");
      const formattedDate = format(paidDate, "yyyy-MM-dd");

      if (account.is_generated_fixed_instance) {
        const { error } = await supabase.from("accounts_payable").insert({
          description: account.description,
          payment_type_id: account.payment_type_id,
          card_id: account.card_id,
          due_date: account.due_date,
          installments: account.installments,
          amount: account.amount,
          category_id: account.category_id,
          created_by: user.id,
          family_id: familyData.id,
          is_fixed: false,
          responsible_person_id: account.responsible_person_id,
          paid: true,
          paid_date: formattedDate,
          original_fixed_account_id: account.original_fixed_account_id || account.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts_payable").update({ 
          paid: true, 
          paid_date: formattedDate 
        }).eq("id", account.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success("Pagamento confirmado!");
      setShowConfirmPaidDateDialog(false);
    },
  });

  const reversePaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_payable").update({ 
        paid: false, 
        paid_date: null 
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success("Pagamento estornado!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_payable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success("Conta deletada!");
    },
  });

  const processedAccounts = useMemo(() => {
    if (!accounts) return [];
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const targetMonthDate = parseISO(`${selectedMonthYear}-01`);

    return accounts.flatMap(account => {
      const dueDate = parseISO(account.due_date);
      if (!isValid(dueDate)) return [];

      const results: AccountPayableWithRelations[] = [];

      if (!account.is_fixed && isSameMonth(dueDate, targetMonthDate) && isSameYear(dueDate, targetMonthDate)) {
        results.push(account);
      } else if (account.is_fixed) {
        if (isSameMonth(dueDate, targetMonthDate) && isSameYear(dueDate, targetMonthDate)) {
          results.push(account);
        } else if (dueDate <= endOfMonth(targetMonthDate)) {
          const exists = accounts.find(a => 
            a.original_fixed_account_id === account.id && 
            isSameMonth(parseISO(a.due_date), targetMonthDate) &&
            isSameYear(parseISO(a.due_date), targetMonthDate)
          );

          if (!exists) {
            const displayDate = new Date(year, month - 1, dueDate.getDate());
            if (displayDate.getMonth() !== month - 1) displayDate.setDate(0);

            results.push({
              ...account,
              id: `temp-${account.id}-${selectedMonthYear}`,
              due_date: format(displayDate, "yyyy-MM-dd"),
              paid: false,
              paid_date: null,
              is_generated_fixed_instance: true,
              original_fixed_account_id: account.id,
            });
          }
        }
      }
      return results;
    }).sort((a, b) => parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime());
  }, [accounts, selectedMonthYear]);

  const totalPaid = processedAccounts.filter(a => a.paid).reduce((sum, a) => sum + a.amount, 0);
  const totalPending = processedAccounts.filter(a => !a.paid).reduce((sum, a) => sum + a.amount, 0);

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
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
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
                <DialogHeader><DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle></DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">
                    <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="payment_type_id" render={({ field }) => (<FormItem><FormLabel>Tipo de Pagamento</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{paymentTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="is_fixed" render={({ field }) => (<FormItem className="flex items-center justify-between border p-3 rounded-lg"><FormLabel>Conta Fixa</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    </div>
                    {selectedPaymentTypeId === creditCardPaymentTypeId && (
                      <FormField control={form.control} name="card_id" render={({ field }) => (<FormItem><FormLabel>Cartão</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger></FormControl><SelectContent>{creditCards?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="purchase_date" render={({ field }) => (<FormItem><FormLabel>Data da Compra</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="due_date" render={({ field }) => (<FormItem><FormLabel>Vencimento</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {!isFixed && <FormField control={form.control} name="installments" render={({ field }) => (<FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} value={field.value || "1"} /></FormControl><FormMessage /></FormItem>)} />}
                      <FormField control={form.control} name="amount" render={({ field }) => (<FormItem className={cn(isFixed && "col-span-2")}><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="category_id" render={({ field }) => (<FormItem><FormLabel>Categoria</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="responsible_person_id" render={({ field }) => (<FormItem><FormLabel>Responsável</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{responsiblePersons?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>Salvar</Button></DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card><CardHeader><CardTitle>Total Pago</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-income">R$ {totalPaid.toFixed(2)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Total Pendente</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">R$ {totalPending.toFixed(2)}</div></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loadingAccounts ? <p className="col-span-2 text-center py-12">Carregando contas...</p> : processedAccounts.length > 0 ? processedAccounts.map(account => (
            <Card key={account.id} className={cn("border-l-4", account.paid ? "border-income" : "border-destructive")}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{account.description}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div><span className="font-medium">Tipo:</span> {account.payment_types?.name || "N/A"}</div>
                      <div><span className="font-medium">Vencimento:</span> {format(parseISO(account.due_date), "dd/MM/yyyy")}</div>
                      <div><span className="font--medium">Parcelas:</span> {account.current_installment} / {account.installments}</div>
                      <div><span className="font-medium">Valor:</span> R$ {account.amount.toFixed(2)}</div>
                      <div><span className="font-medium">Categoria:</span> {account.expense_categories?.name || "N/A"}</div>
                      <div><span className="font-medium">Responsável:</span> {account.responsible_persons?.name || "N/A"}</div>
                      {account.paid && account.paid_date && (
                        <div className="col-span-2 text-income font-medium">Pago em: {format(parseISO(account.paid_date), "dd/MM/yyyy")}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    {account.paid ? (
                      <Button variant="outline" size="sm" onClick={() => reversePaidMutation.mutate(account.id)} className="text-destructive border-destructive hover:bg-destructive/10"><RotateCcw className="h-4 w-4 mr-2" /> Estornar</Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => { setCurrentConfirmingAccount(account); setShowConfirmPaidDateDialog(true); }} className="text-income border-income hover:bg-income/10"><CheckCircle className="h-4 w-4 mr-2" /> Pagar</Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { setEditingAccount(account); setIsFormOpen(true); }} disabled={account.is_generated_fixed_instance}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(account.id)} disabled={account.is_generated_fixed_instance}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )) : <div className="col-span-2 text-center py-12 text-muted-foreground">Nenhuma conta encontrada para este mês.</div>}
        </div>
      </div>

      <Dialog open={showConfirmPaidDateDialog} onOpenChange={setShowConfirmPaidDateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle></DialogHeader>
          <div className="py-4 flex justify-center"><Calendar mode="single" selected={selectedPaidDate} onSelect={setSelectedPaidDate} locale={ptBR} /></div>
          <DialogFooter><Button onClick={() => currentConfirmingAccount && selectedPaidDate && confirmPaidMutation.mutate({ account: currentConfirmingAccount, paidDate: selectedPaidDate })}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Pencil, Trash2, FileText, ShoppingCart } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useMemo, useRef } from "react";
import { format, subMonths, addMonths, isSameMonth, parseISO, endOfMonth, isSameYear, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PrintStatementComponent } from "@/components/PrintStatementComponent";
import { useReactToPrint } from "react-to-print";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const purchaseSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().min(1, "Valor é obrigatório"),
  purchase_date: z.string().min(1, "Data da compra é obrigatória"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  responsible_person_id: z.string().min(1, "Responsável é obrigatório"),
  installments: z.string().default("1"),
  is_fixed: z.boolean().default(false),
});

type PurchaseFormData = z.infer<typeof purchaseSchema>;

export default function CreditCards() {
  const { familyData, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const purchaseForm = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      description: "",
      amount: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      category_id: "",
      responsible_person_id: "",
      installments: "1",
      is_fixed: false,
    },
  });

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Extrato_${selectedCard?.name}_${selectedMonthYear}`,
  });

  const { data: cards, isLoading: loadingCards } = useQuery({
    queryKey: ["credit_cards", familyData.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
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

  const { data: responsiblePersons } = useQuery({
    queryKey: ["responsible-persons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("responsible_persons").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rawTransactions } = useQuery({
    queryKey: ["credit_card_transactions_raw", familyData.id],
    queryFn: async () => {
      let query = supabase
        .from("credit_card_transactions")
        .select("*, responsible_persons(name), expense_categories(name)");
      
      if (familyData.id) {
        query = query.eq("family_id", familyData.id);
      } else {
        query = query.eq("created_by", user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const processedTransactions = useMemo(() => {
    if (!rawTransactions) return [];
    const [year, month] = selectedMonthYear.split('-').map(Number);
    const targetMonthDate = parseISO(`${selectedMonthYear}-01`);

    return rawTransactions.flatMap(transaction => {
      const purchaseDate = parseISO(transaction.purchase_date);
      if (!isValid(purchaseDate)) return [];

      const results: any[] = [];

      // 1. Transações normais (não fixas, 1 parcela)
      if (!transaction.is_fixed && (transaction.installments || 1) === 1) {
        if (isSameMonth(purchaseDate, targetMonthDate) && isSameYear(purchaseDate, targetMonthDate)) {
          results.push(transaction);
        }
      } 
      // 2. Transações fixas
      else if (transaction.is_fixed) {
        if (isSameMonth(purchaseDate, targetMonthDate) && isSameYear(purchaseDate, targetMonthDate)) {
          results.push(transaction);
        } else if (purchaseDate <= endOfMonth(targetMonthDate)) {
          const exists = rawTransactions.find(a => 
            a.original_fixed_transaction_id === transaction.id && 
            isSameMonth(parseISO(a.purchase_date), targetMonthDate) &&
            isSameYear(parseISO(a.purchase_date), targetMonthDate)
          );

          if (!exists) {
            const displayDate = new Date(year, month - 1, purchaseDate.getDate());
            if (displayDate.getMonth() !== month - 1) displayDate.setDate(0);
            const formattedDisplayDate = format(displayDate, "yyyy-MM-dd");

            results.push({
              ...transaction,
              id: `temp-fixed-${transaction.id}-${selectedMonthYear}`,
              purchase_date: formattedDisplayDate,
              is_generated_fixed_instance: true,
              original_fixed_transaction_id: transaction.id,
            });
          }
        }
      }
      // 3. Transações parceladas
      else if ((transaction.installments || 1) > 1) {
        const totalInstallments = transaction.installments || 1;
        
        for (let i = 0; i < totalInstallments; i++) {
          const installmentDate = addMonths(purchaseDate, i);
          if (isSameMonth(installmentDate, targetMonthDate) && isSameYear(installmentDate, targetMonthDate)) {
            results.push({
              ...transaction,
              id: `temp-inst-${transaction.id}-${i}-${selectedMonthYear}`,
              purchase_date: format(installmentDate, "yyyy-MM-dd"),
              current_installment: i + 1,
              is_generated_installment_instance: true,
            });
            break;
          }
        }
      }
      
      return results;
    });
  }, [rawTransactions, selectedMonthYear]);

  const savePurchaseMutation = useMutation({
    mutationFn: async (values: PurchaseFormData) => {
      if (!user?.id || !selectedCard) throw new Error("Não autenticado ou cartão não selecionado");
      
      const { error } = await supabase.from("credit_card_transactions").insert({
        description: values.description,
        amount: parseFloat(values.amount),
        purchase_date: values.purchase_date,
        category_id: values.category_id,
        responsible_person_id: values.responsible_person_id,
        card_id: selectedCard.id,
        installments: values.is_fixed ? 1 : parseInt(values.installments),
        is_fixed: values.is_fixed,
        created_by: user.id,
        family_id: familyData.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_card_transactions_raw"] });
      toast.success("Compra lançada com sucesso!");
      setIsPurchaseDialogOpen(false);
      purchaseForm.reset();
    },
    onError: (error: any) => toast.error("Erro ao lançar compra: " + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success("Cartão removido!");
    },
  });

  const monthOptions = useMemo(() => {
    const options = [];
    let date = subMonths(new Date(), 6);
    for (let i = 0; i < 13; i++) {
      options.push({ value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy", { locale: ptBR }) });
      date = addMonths(date, 1);
    }
    return options;
  }, []);

  const cardStats = useMemo(() => {
    if (!cards || !processedTransactions) return {};
    const stats: Record<string, { used: number; transactions: any[] }> = {};

    cards.forEach(card => {
      const cardTransactions = processedTransactions.filter(t => t.card_id === card.id);
      const used = cardTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      stats[card.id] = { 
        used, 
        transactions: cardTransactions
      };
    });
    return stats;
  }, [cards, processedTransactions]);

  const responsibleStats = useMemo(() => {
    if (!processedTransactions) return [];
    const totals: Record<string, number> = {};

    processedTransactions.forEach(t => {
      const name = t.responsible_persons?.name || "Não Atribuído";
      totals[name] = (totals[name] || 0) + t.amount;
    });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [processedTransactions]);

  const openPrintDialog = (card: any) => {
    setSelectedCard(card);
    setIsPrintDialogOpen(true);
  };

  const openPurchaseDialog = (card: any) => {
    setSelectedCard(card);
    setIsPurchaseDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Cartões de Crédito</h1>
          <div className="flex items-center gap-3">
            <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
              <SelectTrigger className="w-[220px] bg-white border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => toast.info("Funcionalidade em breve")} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Novo Cartão
            </Button>
          </div>
        </div>

        {loadingCards ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {cards.map(card => {
              const stats = cardStats[card.id] || { used: 0, transactions: [] };
              const limit = card.credit_limit || 0;
              const available = limit - stats.used;
              const usagePercent = limit > 0 ? (stats.used / limit) * 100 : 0;
              const monthLabel = format(parseISO(`${selectedMonthYear}-01`), "MMM/yy", { locale: ptBR });

              return (
                <Card key={card.id} className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-lg font-bold text-slate-700">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-slate-500" /> {card.name}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(card.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardTitle>
                    <p className="text-xs text-slate-400 font-medium uppercase">
                      {card.brand || "Cartão"} •••• {card.last_digits || "0000"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Vencimento:</span>
                        <span className="font-bold text-slate-700">Dia {card.due_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Melhor compra:</span>
                        <span className="font-bold text-slate-700">Dia {card.best_purchase_date}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Limite Total:</span>
                        <span className="font-bold text-slate-700">R$ {limit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Utilizado (Mês):</span>
                        <span className="font-bold text-red-500">R$ {stats.used.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Disponível:</span>
                        <span className="font-bold text-green-500">R$ {available.toFixed(2)}</span>
                      </div>
                      <div className="space-y-1">
                        <Progress value={usagePercent} className="h-2 bg-slate-100" />
                        <p className="text-[10px] text-right text-slate-400">{usagePercent.toFixed(1)}% utilizado</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-bold text-slate-700">Fatura ({monthLabel}):</span>
                      {stats.transactions.length > 0 ? (
                        <Badge variant="outline" className="rounded-full px-4 border-slate-200 text-slate-600">
                          {stats.transactions.length} Lançamentos
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-full px-4 bg-slate-100 text-slate-500">
                          Sem Lançamentos
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button variant="outline" size="sm" className="text-slate-600 border-slate-200" onClick={() => openPrintDialog(card)}>
                        <FileText className="mr-2 h-4 w-4" /> Ver Extrato
                      </Button>
                      <Button variant="outline" size="sm" className="text-slate-600 border-slate-200" onClick={() => openPurchaseDialog(card)}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> Lançar Compra
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg bg-white mb-12">
            <p className="text-muted-foreground">Nenhum cartão cadastrado para a família.</p>
          </div>
        )}

        <Card className="bg-white border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-slate-800">Gastos por Responsável (Mês)</CardTitle>
            <p className="text-sm text-slate-500">
              Total de compras no cartão de crédito por responsável no mês de {format(parseISO(`${selectedMonthYear}-01`), "MMMM yyyy", { locale: ptBR })}.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {responsibleStats.length > 0 ? responsibleStats.map(([name, amount]) => (
                <div key={name} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700 font-medium">{name}:</span>
                  <span className="text-red-500 font-bold">R$ {amount.toFixed(2)}</span>
                </div>
              )) : (
                <p className="text-sm text-slate-400 italic">Nenhum gasto registrado para este período.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Lançamento de Compra */}
      <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar Compra - {selectedCard?.name}</DialogTitle>
          </DialogHeader>
          <Form {...purchaseForm}>
            <form onSubmit={purchaseForm.handleSubmit(v => savePurchaseMutation.mutate(v))} className="space-y-4">
              <FormField control={purchaseForm.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={purchaseForm.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={purchaseForm.control} name="purchase_date" render={({ field }) => (<FormItem><FormLabel>Data da Compra</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <FormField control={purchaseForm.control} name="category_id" render={({ field }) => (<FormItem><FormLabel>Categoria</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={purchaseForm.control} name="responsible_person_id" render={({ field }) => (<FormItem><FormLabel>Responsável</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{responsiblePersons?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <div className="flex items-center justify-between border p-3 rounded-lg">
                <FormLabel>Compra Fixa</FormLabel>
                <FormField control={purchaseForm.control} name="is_fixed" render={({ field }) => (<FormControl><Input type="checkbox" className="h-4 w-4" checked={field.value} onChange={e => field.onChange(e.target.checked)} /></FormControl>)} />
              </div>
              {!purchaseForm.watch("is_fixed") && (
                <FormField control={purchaseForm.control} name="installments" render={({ field }) => (<FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              )}
              <DialogFooter>
                <Button type="submit" disabled={savePurchaseMutation.isPending}>Salvar Compra</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Extrato para Impressão */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 border-none bg-slate-100">
          <div className="sticky top-0 z-10 flex justify-between items-center p-4 bg-white border-b shadow-sm">
            <h2 className="font-bold text-slate-700">Visualização do Extrato</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsPrintDialogOpen(false)}>Fechar</Button>
              <Button size="sm" onClick={handlePrint} className="bg-red-600 hover:bg-red-700">
                <FileText className="mr-2 h-4 w-4" /> Imprimir / PDF
              </Button>
            </div>
          </div>
          <div className="p-8 flex justify-center">
            <div className="shadow-2xl border border-slate-200 rounded-sm overflow-hidden">
              <PrintStatementComponent 
                ref={printRef}
                cardName={selectedCard?.name || ""}
                monthYear={selectedMonthYear}
                transactions={cardStats[selectedCard?.id]?.transactions || []}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Pencil, Trash2, FileText, ShoppingCart } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useMemo, useRef } from "react";
import { format, subMonths, addMonths, isSameMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PrintStatementComponent } from "@/components/PrintStatementComponent";
import { useReactToPrint } from "react-to-print";

export default function CreditCards() {
  const { familyData, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [selectedCardForPrint, setSelectedCardForPrint] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Extrato_${selectedCardForPrint?.name}_${selectedMonthYear}`,
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

  const { data: transactions } = useQuery({
    queryKey: ["credit_card_transactions_all", familyData.id, selectedMonthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, responsible_persons(name), expense_categories(name)")
        .not("card_id", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
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
    if (!cards || !transactions) return {};
    const stats: Record<string, { used: number; pending: boolean; transactions: any[] }> = {};
    const targetDate = parseISO(`${selectedMonthYear}-01`);

    cards.forEach(card => {
      const cardTransactions = transactions.filter(t => t.card_id === card.id && isSameMonth(parseISO(t.due_date), targetDate));
      const used = cardTransactions.reduce((sum, t) => sum + t.amount, 0);
      const hasPending = cardTransactions.some(t => !t.paid);
      
      stats[card.id] = { 
        used, 
        pending: hasPending && cardTransactions.length > 0,
        transactions: cardTransactions
      };
    });
    return stats;
  }, [cards, transactions, selectedMonthYear]);

  const responsibleStats = useMemo(() => {
    if (!transactions) return [];
    const targetDate = parseISO(`${selectedMonthYear}-01`);
    const totals: Record<string, number> = {};

    transactions
      .filter(t => isSameMonth(parseISO(t.due_date), targetDate))
      .forEach(t => {
        const name = t.responsible_persons?.name || "Não Atribuído";
        totals[name] = (totals[name] || 0) + t.amount;
      });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions, selectedMonthYear]);

  const openPrintDialog = (card: any) => {
    setSelectedCardForPrint(card);
    setIsPrintDialogOpen(true);
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
              const stats = cardStats[card.id] || { used: 0, pending: false, transactions: [] };
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
                        <Badge variant={stats.pending ? "destructive" : "success"} className="rounded-full px-4">
                          {stats.pending ? "Pendente" : "Pago"}
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
                      <Button variant="outline" size="sm" className="text-slate-600 border-slate-200" onClick={() => toast.info("Lançar compra em breve")}>
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

        {/* Seção de Gastos por Responsável */}
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

      {/* Dialog de Extrato para Impressão */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extrato do Cartão</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-white border rounded-md">
            <PrintStatementComponent 
              ref={printRef}
              cardName={selectedCardForPrint?.name || ""}
              monthYear={selectedMonthYear}
              transactions={cardStats[selectedCardForPrint?.id]?.transactions || []}
              printType="general"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>Fechar</Button>
            <Button onClick={handlePrint}>Imprimir PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
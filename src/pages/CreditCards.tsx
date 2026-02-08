import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Pencil, Trash2, Receipt, ShoppingCart } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { format, subMonths, addMonths, isSameMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

export default function CreditCards() {
  const { familyMemberIds, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  
  const effectiveIds = familyMemberIds.length > 0 ? familyMemberIds : (user?.id ? [user.id] : []);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["credit_cards", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .in("created_by", effectiveIds)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: effectiveIds.length > 0,
  });

  const { data: transactions } = useQuery({
    queryKey: ["credit_card_transactions_all", effectiveIds],
    queryFn: async () => {
      if (effectiveIds.length === 0) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, responsible_persons(name)")
        .in("created_by", effectiveIds)
        .not("card_id", "is", null);
      if (error) throw error;
      return data;
    },
    enabled: effectiveIds.length > 0,
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
    onError: (error: any) => toast.error("Erro ao remover: " + error.message),
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
    const stats: Record<string, { used: number, status: string }> = {};
    const targetDate = parseISO(`${selectedMonthYear}-01`);

    cards.forEach(card => {
      const used = transactions
        .filter(t => t.card_id === card.id && isSameMonth(parseISO(t.due_date), targetDate))
        .reduce((sum, t) => sum + t.amount, 0);
      
      stats[card.id] = {
        used,
        status: used > 0 ? "Pendente" : "Sem Lançamentos"
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <h1 className="text-3xl font-bold">Cartões de Crédito</h1>
          <div className="flex items-center gap-4">
            <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => toast.info("Funcionalidade em breve")} className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" /> Novo Cartão</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {cards.map(card => {
              const stats = cardStats[card.id] || { used: 0, status: "Sem Lançamentos" };
              const limit = card.credit_limit || 0;
              const available = limit - stats.used;
              const usagePercent = limit > 0 ? (stats.used / limit) * 100 : 0;

              return (
                <Card key={card.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-slate-700" /> {card.name}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{card.brand || "Mastercard"} •••• {card.last_digits || "0000"}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 text-sm gap-y-1">
                      <span className="text-muted-foreground">Vencimento:</span>
                      <span className="text-right font-medium">Dia {card.due_date}</span>
                      <span className="text-muted-foreground">Melhor compra:</span>
                      <span className="text-right font-medium">Dia {card.best_purchase_date}</span>
                    </div>

                    <div className="pt-4 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Limite Total:</span>
                        <span className="font-bold">R$ {limit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Utilizado (Mês):</span>
                        <span className="font-bold text-red-600">R$ {stats.used.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Disponível:</span>
                        <span className="font-bold text-green-600">R$ {available.toFixed(2)}</span>
                      </div>
                      <Progress value={usagePercent} className="h-2 bg-slate-100" />
                      <p className="text-[10px] text-right text-muted-foreground">{usagePercent.toFixed(1)}% utilizado</p>
                    </div>

                    <div className="pt-4 flex items-center justify-between">
                      <span className="text-sm font-medium">Fatura ({format(parseISO(`${selectedMonthYear}-01`), "MMM/yy", { locale: ptBR })}):</span>
                      <span className={cn("text-xs px-2 py-1 rounded-full font-bold", stats.status === "Pendente" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500")}>
                        {stats.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button variant="outline" size="sm" className="text-xs"><Receipt className="h-3 w-3 mr-1" /> Ver Extrato</Button>
                      <Button variant="outline" size="sm" className="text-xs"><ShoppingCart className="h-3 w-3 mr-1" /> Lançar Compra</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg mb-12">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum cartão cadastrado para a família.</p>
          </div>
        )}

        {/* Gastos por Responsável conforme Imagem 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold">Gastos por Responsável (Mês)</CardTitle>
            <p className="text-sm text-muted-foreground">Total de compras no cartão de crédito por responsável no mês de {format(parseISO(`${selectedMonthYear}-01`), "MMMM yyyy", { locale: ptBR })}.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {responsibleStats.map(([name, amount]) => (
                <div key={name} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0">
                  <span className="text-sm font-medium">{name}:</span>
                  <span className="text-sm font-bold text-red-600">R$ {amount.toFixed(2)}</span>
                </div>
              ))}
              {responsibleStats.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhum gasto registrado para este período.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
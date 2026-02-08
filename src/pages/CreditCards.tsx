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
  const { familyData, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonthYear, setSelectedMonthYear] = useState(format(new Date(), "yyyy-MM"));
  
  const { data: cards, isLoading: loadingCards } = useQuery({
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
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: transactions } = useQuery({
    queryKey: ["credit_card_transactions_all", familyData.id],
    queryFn: async () => {
      let query = supabase.from("accounts_payable").select("*, responsible_persons(name)").not("card_id", "is", null);
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

        {loadingCards ? (
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 text-sm gap-y-1">
                      <span className="text-muted-foreground">Vencimento:</span>
                      <span className="text-right font-medium">Dia {card.due_date}</span>
                    </div>
                    <div className="pt-4 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Limite Total:</span>
                        <span className="font-bold">R$ {limit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Utilizado:</span>
                        <span className="font-bold text-red-600">R$ {stats.used.toFixed(2)}</span>
                      </div>
                      <Progress value={usagePercent} className="h-2 bg-slate-100" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg mb-12">
            <p className="text-muted-foreground">Nenhum cartão cadastrado.</p>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Gastos por Responsável (Mês)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {responsibleStats.map(([name, amount]) => (
                <div key={name} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <span className="text-sm font-medium">{name}:</span>
                  <span className="text-sm font-bold text-red-600">R$ {amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
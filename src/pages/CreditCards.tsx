import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Pencil, Trash2 } from "lucide-react";
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
      // Busca cartões vinculados à família ou ao usuário (RLS cuidará da segurança)
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
    queryKey: ["credit_card_transactions_all", familyData.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, responsible_persons(name)")
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
    const stats: Record<string, { used: number }> = {};
    const targetDate = parseISO(`${selectedMonthYear}-01`);

    cards.forEach(card => {
      const used = transactions
        .filter(t => t.card_id === card.id && isSameMonth(parseISO(t.due_date), targetDate))
        .reduce((sum, t) => sum + t.amount, 0);
      
      stats[card.id] = { used };
    });
    return stats;
  }, [cards, transactions, selectedMonthYear]);

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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => {
              const stats = cardStats[card.id] || { used: 0 };
              const limit = card.credit_limit || 0;
              const usagePercent = limit > 0 ? (stats.used / limit) * 100 : 0;

              return (
                <Card key={card.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-slate-700" /> {card.name}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">Nenhum cartão cadastrado para a família.</p>
          </div>
        )}
      </div>
    </div>
  );
}
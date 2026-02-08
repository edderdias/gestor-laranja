import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function CreditCards() {
  const { familyMemberIds, user } = useAuth();
  const queryClient = useQueryClient();
  
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Cartões da Família</h1>
          <Button onClick={() => toast.info("Funcionalidade de adicionar cartão em breve")}><Plus className="mr-2 h-4 w-4" /> Novo Cartão</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => (
              <Card key={card.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" /> {card.name}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <p className="text-muted-foreground">Vencimento: <span className="font-medium text-foreground">Dia {card.due_date}</span></p>
                    <p className="text-muted-foreground">Melhor compra: <span className="font-medium text-foreground">Dia {card.best_purchase_date}</span></p>
                    <p className="text-lg font-bold mt-3 text-primary">Limite: R$ {card.credit_limit?.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum cartão cadastrado para a família.</p>
          </div>
        )}
      </div>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { CreditCard, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreditCards() {
  const { familyMemberIds } = useAuth();

  const { data: cards, isLoading } = useQuery({
    queryKey: ["credit_cards", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .in("created_by", familyMemberIds)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Cartões da Família</h1>
          <Button><Plus className="mr-2 h-4 w-4" /> Novo Cartão</Button>
        </div>

        {isLoading ? <p>Carregando...</p> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards?.map(card => (
              <Card key={card.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="h-5 w-5" /> {card.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Vencimento: Dia {card.due_date}</p>
                  <p className="font-bold mt-2">Limite: R$ {card.credit_limit?.toFixed(2)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
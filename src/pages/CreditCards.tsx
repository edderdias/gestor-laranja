import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Edit, Trash2, ShoppingCart, ListChecks, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CreditCards() {
  const { user, familyMemberIds, isFamilySchemaReady } = useAuth();
  const queryClient = useQueryClient();

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
        {!isFamilySchemaReady && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Aviso</AlertTitle>
            <AlertDescription>Mostrando apenas seus cartões individuais.</AlertDescription>
          </Alert>
        )}

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
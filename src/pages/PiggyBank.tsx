import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PiggyBank as PiggyBankIcon, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";

export default function PiggyBank() {
  const { user, familyMemberIds } = useAuth();
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["piggy_bank_entries", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("piggy_bank_entries")
        .select("*")
        .in("user_id", familyMemberIds)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  const totalBalance = entries?.reduce((sum, entry) => {
    return entry.type === "deposit" ? sum + entry.amount : sum - entry.amount;
  }, 0) || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <PiggyBankIcon className="h-7 w-7" /> Cofrinho Familiar
        </h1>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Saldo Total da Família</CardTitle></CardHeader>
        <CardContent>
          <div className={`text-4xl font-bold ${totalBalance >= 0 ? "text-income" : "text-destructive"}`}>
            R$ {totalBalance.toFixed(2)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico Coletivo</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p>Carregando...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.entry_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className={`text-right font-medium ${entry.type === "deposit" ? "text-income" : "text-expense"}`}>
                      R$ {entry.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, PiggyBank as PiggyBankIcon, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { Tables } from "@/integrations/supabase/types";

const entrySchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  entry_date: z.string().min(1, "Data é obrigatória"),
  type: z.enum(["deposit", "withdrawal"], { required_error: "Tipo de lançamento é obrigatório" }),
});

type EntryFormData = z.infer<typeof entrySchema>;
type PiggyBankEntry = Tables<'piggy_bank_entries'>;

export default function PiggyBank() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PiggyBankEntry | null>(null);

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      description: "",
      amount: 0,
      entry_date: format(new Date(), "yyyy-MM-dd"),
      type: "deposit",
    },
  });

  useEffect(() => {
    if (isFormOpen && editingEntry) {
      form.reset({
        description: editingEntry.description,
        amount: editingEntry.amount,
        entry_date: editingEntry.entry_date,
        type: editingEntry.type,
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        amount: 0,
        entry_date: format(new Date(), "yyyy-MM-dd"),
        type: "deposit",
      });
    }
  }, [isFormOpen, editingEntry, form]);

  // Fetch piggy bank entries
  const { data: entries, isLoading: isLoadingEntries } = useQuery({
    queryKey: ["piggy_bank_entries", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("piggy_bank_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Calculate total balance
  const totalBalance = entries?.reduce((sum, entry) => {
    return entry.type === "deposit" ? sum + entry.amount : sum - entry.amount;
  }, 0) || 0;

  // Mutation to save/update entry
  const saveMutation = useMutation({
    mutationFn: async (values: EntryFormData) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível salvar lançamento.");
        throw new Error("User not authenticated.");
      }

      const entryData = {
        description: values.description,
        amount: values.amount,
        entry_date: values.entry_date,
        type: values.type,
        user_id: user.id,
      };

      if (editingEntry) {
        const { error } = await supabase
          .from("piggy_bank_entries")
          .update(entryData)
          .eq("id", editingEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("piggy_bank_entries")
          .insert(entryData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success(editingEntry ? "Lançamento atualizado!" : "Lançamento adicionado!");
      setIsFormOpen(false);
      setEditingEntry(null);
      form.reset();
    },
    onError: (error) => {
      toast.error("Erro ao salvar lançamento: " + error.message);
    },
  });

  // Mutation to delete entry
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("piggy_bank_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success("Lançamento excluído!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir lançamento: " + error.message);
    },
  });

  const onSubmit = (values: EntryFormData) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (entry: PiggyBankEntry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este lançamento?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PiggyBankIcon className="h-7 w-7" /> Cofrinho
          </h1>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingEntry(null)}>
                <Plus className="mr-2 h-4 w-4" /> Novo Lançamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingEntry ? "Editar Lançamento" : "Novo Lançamento no Cofrinho"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Economia do mês, Retirada para viagem" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="entry_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deposit">Depósito</SelectItem>
                            <SelectItem value="withdrawal">Retirada</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Saldo Atual do Cofrinho</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${totalBalance >= 0 ? "text-income" : "text-destructive"}`}>
              R$ {totalBalance.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Lançamentos</CardTitle>
            <CardDescription>Todos os depósitos e retiradas do seu cofrinho.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingEntries ? (
              <p className="text-muted-foreground">Carregando lançamentos...</p>
            ) : entries && entries.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Tipo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.entry_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className={`text-right font-medium ${entry.type === "deposit" ? "text-income" : "text-expense"}`}>
                          R$ {entry.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${entry.type === "deposit" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
                            {entry.type === "deposit" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {entry.type === "deposit" ? "Depósito" : "Retirada"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(entry)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} disabled={deleteMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Nenhum lançamento no cofrinho ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
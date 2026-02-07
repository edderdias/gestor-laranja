import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PiggyBank as PiggyBankIcon, Plus, ArrowUp, ArrowDown, Trash2, CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const entrySchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido").transform(Number).refine(val => val > 0, "O valor deve ser positivo"),
  type: z.enum(["deposit", "withdrawal"]),
  entry_date: z.date({ required_error: "Data é obrigatória" }),
  bank_id: z.string().min(1, "Banco é obrigatório"),
});

type EntryFormData = z.infer<typeof entrySchema>;

export default function PiggyBank() {
  const { user, familyMemberIds } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      description: "",
      amount: 0,
      type: "deposit",
      entry_date: new Date(),
      bank_id: "",
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["piggy_bank_entries", familyMemberIds],
    queryFn: async () => {
      if (familyMemberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("piggy_bank_entries")
        .select("*, banks(name)")
        .in("user_id", familyMemberIds)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: familyMemberIds.length > 0,
  });

  const { data: banks } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banks").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: EntryFormData) => {
      if (!user?.id) throw new Error("Não autenticado");
      const { error } = await supabase.from("piggy_bank_entries").insert({
        ...values,
        entry_date: format(values.entry_date, "yyyy-MM-dd"),
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success("Lançamento realizado!");
      setIsFormOpen(false);
      form.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("piggy_bank_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["piggy_bank_entries"] });
      toast.success("Lançamento removido!");
    },
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
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo Lançamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Lançamento no Cofrinho</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Valor</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="type" render={({ field }) => (<FormItem><FormLabel>Tipo</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="deposit">Depósito</SelectItem><SelectItem value="withdrawal">Retirada</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                </div>
                <FormField control={form.control} name="bank_id" render={({ field }) => (<FormItem><FormLabel>Banco</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{banks?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="entry_date" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Selecione</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                <DialogFooter><Button type="submit" disabled={saveMutation.isPending}>Salvar</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
                  <TableHead>Banco</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.entry_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell>{(entry.banks as any)?.name || "N/A"}</TableCell>
                    <TableCell className={`text-right font-medium ${entry.type === "deposit" ? "text-income" : "text-expense"}`}>
                      {entry.type === "deposit" ? <ArrowUp className="inline h-4 w-4 mr-1" /> : <ArrowDown className="inline h-4 w-4 mr-1" />}
                      R$ {entry.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(entry.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
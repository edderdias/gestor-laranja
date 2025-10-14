import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  income_type: z.enum(["salario", "extra", "aluguel", "vendas", "comissao"]),
  receive_date: z.string().min(1, "Data do recebimento é obrigatória"),
  installments: z.string().min(1, "Quantidade de parcelas é obrigatória"),
  amount: z.string().min(1, "Valor é obrigatório"),
  payer_id: z.string().min(1, "Pagador é obrigatório"),
  source_id: z.string().min(1, "Fonte de receita é obrigatória"),
});

type FormData = z.infer<typeof formSchema>;

interface AccountReceivableFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingAccount?: any;
}

export function AccountReceivableForm({ isOpen, onClose, editingAccount }: AccountReceivableFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      income_type: "extra",
      receive_date: format(new Date(), "yyyy-MM-dd"),
      installments: "1",
      amount: "",
      payer_id: "",
      source_id: "",
    },
  });

  useEffect(() => {
    if (isOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        income_type: editingAccount.income_type,
        receive_date: editingAccount.receive_date,
        installments: editingAccount.installments?.toString() || "1",
        amount: editingAccount.amount.toString(),
        payer_id: editingAccount.payer_id || "",
        source_id: editingAccount.source_id,
      });
    } else if (!isOpen) {
      form.reset({
        description: "",
        income_type: "extra",
        receive_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        payer_id: "",
        source_id: "",
      });
    }
  }, [isOpen, editingAccount, form]);

  // Buscar pagadores
  const { data: payers } = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payers")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar fontes de receita
  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_sources")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Criar/Atualizar conta
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const accountData = {
        description: values.description,
        income_type: values.income_type,
        receive_date: values.receive_date,
        installments: parseInt(values.installments),
        amount: parseFloat(values.amount),
        payer_id: values.payer_id,
        source_id: values.source_id,
        created_by: user?.id,
      };

      if (editingAccount) {
        const { error } = await supabase
          .from("accounts_receivable")
          .update(accountData)
          .eq("id", editingAccount.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts_receivable")
          .insert(accountData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success(editingAccount ? "Conta atualizada com sucesso!" : "Conta criada com sucesso!");
      onClose();
    },
    onError: (error) => {
      toast.error("Erro ao salvar conta: " + error.message);
    },
  });

  const onSubmit = (values: FormData) => {
    saveMutation.mutate(values);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle>
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
                  <Input {...field} placeholder="Ex: Pagamento cliente X" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="income_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Recebimento</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="salario">Salário</SelectItem>
                    <SelectItem value="extra">Extra</SelectItem>
                    <SelectItem value="aluguel">Aluguel</SelectItem>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="comissao">Comissão</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="receive_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do Recebimento</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="installments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade de Parcelas</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
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
                  <FormLabel>Valor da Parcela</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="payer_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pagador</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Quem vai pagar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {payers?.map((payer) => (
                      <SelectItem key={payer.id} value={payer.id}>
                        {payer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="source_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fonte de Receita</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a fonte" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sources?.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium">
              Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * parseInt(form.watch("installments") || "1")).toFixed(2)}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editingAccount ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
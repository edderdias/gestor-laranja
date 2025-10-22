import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Esquema genérico para itens com um campo 'name'
const itemSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

type ItemFormData = z.infer<typeof itemSchema>;

interface CrudSectionProps {
  title: string;
  tableName: string;
  queryKey: string[];
  description?: string;
}

function CrudSection({ title, tableName, queryKey, description }: CrudSectionProps) {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from(tableName).select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ItemFormData) => {
      if (editingItem) {
        const { error } = await supabase.from(tableName).update({ name: values.name }).eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tableName).insert({ name: values.name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey });
      toast.success(editingItem ? `${title} atualizado!` : `${title} criado!`);
      setIsFormOpen(false);
      setEditingItem(null);
      form.reset();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar ${title.toLowerCase()}: ` + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey });
      toast.success(`${title} excluído!`);
    },
    onError: (error) => {
      toast.error(`Erro ao excluir ${title.toLowerCase()}: ` + error.message);
    },
  });

  const onSubmit = (values: ItemFormData) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    form.reset({ name: item.name });
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(`Tem certeza que deseja excluir este ${title.toLowerCase()}?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { setEditingItem(null); form.reset(); }}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? `Editar ${title}` : `Adicionar ${title}`}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={`Nome do ${title.toLowerCase()}`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item: any) => (
              <li key={item.id} className="flex items-center justify-between p-2 border rounded-md">
                <span>{item.name}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nenhum {title.toLowerCase()} cadastrado.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Configurações</h1>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CrudSection
            title="Categorias de Despesa"
            tableName="expense_categories"
            queryKey={["expense-categories"]}
            description="Gerencie as categorias para suas contas a pagar."
          />
          <CrudSection
            title="Fontes de Receita"
            tableName="income_sources"
            queryKey={["income-sources"]}
            description="Gerencie as fontes de onde você recebe dinheiro."
          />
          <CrudSection
            title="Pagadores"
            tableName="payers"
            queryKey={["payers"]}
            description="Gerencie as entidades que pagam suas contas a receber."
          />
          <CrudSection
            title="Tipos de Pagamento"
            tableName="payment_types"
            queryKey={["payment-types"]}
            description="Gerencie os tipos de pagamento disponíveis."
          />
          <CrudSection
            title="Recebedores/Responsáveis"
            tableName="responsible_persons"
            queryKey={["responsible-persons"]}
            description="Gerencie as pessoas responsáveis por contas."
          />
          <CrudSection
            title="Tipos de Recebimento"
            tableName="income_types"
            queryKey={["income-types"]}
            description="Gerencie os tipos de recebimento de suas receitas."
          />
        </div>
      </div>
    </div>
  );
}
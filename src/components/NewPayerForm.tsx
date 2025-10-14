import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";

const newPayerSchema = z.object({
  name: z.string().min(1, "Nome do pagador é obrigatório"),
});

type NewPayerFormData = z.infer<typeof newPayerSchema>;

interface NewPayerFormProps {
  onPayerCreated: (payerId: string) => void;
  onClose: () => void;
}

export function NewPayerForm({ onPayerCreated, onClose }: NewPayerFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<NewPayerFormData>({
    resolver: zodResolver(newPayerSchema),
    defaultValues: {
      name: "",
    },
  });

  const createPayerMutation = useMutation({
    mutationFn: async (values: NewPayerFormData) => {
      const { data, error } = await supabase
        .from("payers")
        .insert({ name: values.name })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payers"] });
      toast.success("Pagador criado com sucesso!");
      onPayerCreated(data.id);
      onClose();
    },
    onError: (error) => {
      toast.error("Erro ao criar pagador: " + error.message);
    },
  });

  const onSubmit = (values: NewPayerFormData) => {
    createPayerMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Pagador</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ex: Cliente A" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={createPayerMutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createPayerMutation.isPending}>
            {createPayerMutation.isPending ? "Criando..." : "Criar Pagador"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
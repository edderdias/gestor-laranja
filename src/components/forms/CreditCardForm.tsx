import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Helper function for formatting currency for display
const formatCurrencyDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null) return "";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function for parsing currency input string to number
const parseCurrencyInput = (input: string): number => {
  const cleanedInput = input.replace(/[^0-9,]/g, '');
  const numericValue = parseFloat(cleanedInput.replace(',', '.')) || 0;
  return numericValue;
};

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  brand: z.enum(["visa", "master"], { required_error: "Selecione a bandeira" }),
  due_date: z.number().min(1).max(31, "Dia de vencimento inválido"),
  best_purchase_date: z.number().min(1).max(31, "Melhor dia de compra inválido"),
  credit_limit: z.number().min(0, "Limite deve ser positivo"),
  owner_name: z.string().min(1, "Nome do dono é obrigatório"),
  last_digits: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CreditCardFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingCard?: any;
}

export function CreditCardForm({ isOpen, onClose, editingCard }: CreditCardFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      brand: "visa",
      due_date: 10,
      best_purchase_date: 5,
      credit_limit: 0,
      owner_name: "",
      last_digits: "",
    },
  });

  // Local state to manage the displayed string value of credit_limit
  const [creditLimitInput, setCreditLimitInput] = useState<string>("");

  useEffect(() => {
    if (isOpen && editingCard) {
      form.reset({
        name: editingCard.name,
        brand: editingCard.brand,
        due_date: editingCard.due_date,
        best_purchase_date: editingCard.best_purchase_date,
        credit_limit: editingCard.credit_limit, // Set RHF value
        owner_name: editingCard.owner_name || "",
        last_digits: editingCard.last_digits || "",
      });
      // Set local input state for display, formatted
      setCreditLimitInput(formatCurrencyDisplay(editingCard.credit_limit));
    } else if (!isOpen) {
      form.reset({
        name: "",
        brand: "visa",
        due_date: 10,
        best_purchase_date: 5,
        credit_limit: 0,
        owner_name: "",
        last_digits: "",
      });
      setCreditLimitInput(""); // Reset local input state
    }
  }, [isOpen, editingCard, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const cardData = {
        name: values.name,
        brand: values.brand,
        due_date: values.due_date,
        best_purchase_date: values.best_purchase_date,
        credit_limit: values.credit_limit,
        owner_name: values.owner_name,
        last_digits: values.last_digits || null,
        created_by: user?.id,
      };

      if (editingCard) {
        const { error } = await supabase
          .from("credit_cards")
          .update(cardData)
          .eq("id", editingCard.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("credit_cards")
          .insert([cardData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success(editingCard ? "Cartão atualizado!" : "Cartão criado!");
      onClose();
    },
    onError: (error) => {
      toast.error("Erro ao salvar cartão: " + error.message);
      console.error(error);
    },
  });

  const onSubmit = (values: FormData) => {
    saveMutation.mutate(values);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição do Cartão *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Cartão principal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bandeira *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a bandeira" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="master">Mastercard</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_digits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Últimos 4 dígitos</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="1234" maxLength={4} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="owner_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dono do Cartão *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: João Silva" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Vencimento (dia) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      placeholder="10"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="best_purchase_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Melhor Data de Compra (dia) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      placeholder="5"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="credit_limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite Total de Crédito *</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      value={creditLimitInput}
                      onChange={(e) => setCreditLimitInput(e.target.value)}
                      onBlur={() => {
                        const numericValue = parseCurrencyInput(creditLimitInput);
                        field.onChange(numericValue); // Update RHF field
                        setCreditLimitInput(formatCurrencyDisplay(numericValue)); // Re-format on blur
                      }}
                      placeholder="R$ 0,00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editingCard ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
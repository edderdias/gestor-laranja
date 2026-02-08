import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, UserPlus, UserCheck, Users, Link as LinkIcon, Copy, AlertTriangle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Profile = Tables<'profiles'> & {
  email?: string;
};

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(true),
});

const createSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(true),
});

const familyNameSchema = z.object({
  name: z.string().min(1, "Nome da família é obrigatório"),
});

const joinFamilySchema = z.object({
  familyCode: z.string().min(1, "Código da família é obrigatório"),
});

export default function UserManagement() {
  const { user: currentUser, session, familyData, refreshFamily } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteFormOpen, setIsInviteFormOpen] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isJoinFormOpen, setIsJoinFormOpen] = useState(false);

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", fullName: "", isFamilyMember: true },
  });

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", fullName: "", isFamilyMember: true },
  });

  const familyNameForm = useForm<z.infer<typeof familyNameSchema>>({
    resolver: zodResolver(familyNameSchema),
    defaultValues: { name: familyData.name || "" },
  });

  const joinFamilyForm = useForm<z.infer<typeof joinFamilySchema>>({
    resolver: zodResolver(joinFamilySchema),
    defaultValues: { familyCode: "" },
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", familyData.id, currentUser?.id],
    queryFn: async () => {
      // Se tem família, busca membros da família. Se não, busca quem ele convidou.
      let query = supabase.from("profiles").select("*");
      
      if (familyData.id) {
        query = query.eq("family_id", familyData.id);
      } else {
        query = query.eq("invited_by_user_id", currentUser?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Adiciona o próprio usuário na lista se não estiver nela
      const list = data as Profile[];
      const hasMe = list.some(u => u.id === currentUser?.id);
      if (!hasMe && currentUser) {
        const { data: myProfile } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
        if (myProfile) list.unshift(myProfile as Profile);
      }
      
      return list;
    },
    enabled: !!currentUser?.id,
  });

  const generateFamilyCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createFamilyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof familyNameSchema>) => {
      if (!currentUser?.id) throw new Error("Não autenticado");
      
      const code = generateFamilyCode();
      
      const { data: family, error: familyError } = await supabase
        .from("families")
        .insert({
          name: data.name,
          code: code,
          owner_id: currentUser.id
        })
        .select()
        .single();

      if (familyError) throw familyError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ family_id: family.id, is_family_member: true })
        .eq("id", currentUser.id);

      if (profileError) throw profileError;
      return family;
    },
    onSuccess: () => {
      toast.success("Família criada com sucesso!");
      refreshFamily();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => toast.error(`Erro: ${error.message}`),
  });

  const joinFamilyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof joinFamilySchema>) => {
      if (!currentUser?.id) throw new Error("Não autenticado");
      
      const cleanCode = data.familyCode.trim().toUpperCase();

      // Busca na tabela FAMILIES e não em PROFILES
      const { data: family, error: searchError } = await supabase
        .from("families")
        .select("id")
        .eq("code", cleanCode)
        .maybeSingle();

      if (searchError || !family) {
        throw new Error("Código de família inválido ou não encontrado.");
      }

      const { error } = await supabase
        .from("profiles")
        .update({ family_id: family.id, is_family_member: true })
        .eq("id", currentUser.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vinculado à família com sucesso!");
      setIsJoinFormOpen(false);
      refreshFamily();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createSchema>) => {
      if (!currentUser?.id) throw new Error("Não autenticado");

      // Se o usuário não tem família, cria uma padrão antes de cadastrar o membro
      let currentFamilyId = familyData.id;
      if (!currentFamilyId) {
        const newFamily = await createFamilyMutation.mutateAsync({ name: `Família de ${currentUser.email?.split('@')[0]}` });
        currentFamilyId = newFamily.id;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao cadastrar usuário");
      }
      
      const result = await response.json();
      
      // Vincula o novo usuário à família
      if (currentFamilyId && result.user?.id) {
        await supabase
          .from("profiles")
          .update({ family_id: currentFamilyId, is_family_member: data.isFamilyMember })
          .eq("id", result.user.id);
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário cadastrado e vinculado!");
      setIsCreateFormOpen(false);
      createForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const copyFamilyCode = () => {
    if (familyData.code) {
      navigator.clipboard.writeText(familyData.code);
      toast.success("Código copiado!");
    }
  };

  const isOwner = currentUser?.id === familyData.ownerId;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" /> Gerenciamento de Família
          </h1>
          <div className="flex gap-2">
            {!familyData.id && (
              <Dialog open={isJoinFormOpen} onOpenChange={setIsJoinFormOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <LinkIcon className="mr-2 h-4 w-4" /> Vincular-se a Família
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vincular-se a uma Família</DialogTitle>
                    <DialogDescription>Insira o código de família compartilhado com você.</DialogDescription>
                  </DialogHeader>
                  <Form {...joinFamilyForm}>
                    <form onSubmit={joinFamilyForm.handleSubmit((data) => joinFamilyMutation.mutate(data))} className="space-y-4">
                      <FormField control={joinFamilyForm.control} name="familyCode" render={({ field }) => (
                        <FormItem><FormLabel>Código da Família</FormLabel><FormControl><Input {...field} placeholder="Ex: A1B2C3" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <DialogFooter><Button type="submit" disabled={joinFamilyMutation.isPending}>Vincular</Button></DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <UserCheck className="mr-2 h-4 w-4" /> Cadastrar Membro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cadastrar Novo Membro</DialogTitle>
                  <DialogDescription>O novo usuário será vinculado ao seu grupo familiar.</DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit((data) => createUserMutation.mutate(data))} className="space-y-4">
                    <FormField control={createForm.control} name="fullName" render={({ field }) => (
                      <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>Senha</FormLabel><FormControl><Input {...field} type="password" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="isFamilyMember" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Membro da Família</FormLabel>
                          <FormDescription>Compartilha lançamentos financeiros.</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="submit" disabled={createUserMutation.isPending}>Cadastrar</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader><CardTitle>Dados da Família</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!familyData.id ? (
                <Form {...familyNameForm}>
                  <form onSubmit={familyNameForm.handleSubmit((data) => createFamilyMutation.mutate(data))} className="space-y-4">
                    <FormField control={familyNameForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Nome da Sua Família</FormLabel><FormControl><Input {...field} placeholder="Ex: Família Silva" /></FormControl><FormDescription>Crie sua própria família para começar a compartilhar dados.</FormDescription></FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={createFamilyMutation.isPending}>Criar Família</Button>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm font-medium">Nome: {familyData.name}</p>
                    <p className="text-xs text-muted-foreground">{isOwner ? "Você é o dono desta família." : "Você é membro desta família."}</p>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Código de Compartilhamento:</p>
                    <div className="flex gap-2">
                      <Input value={familyData.code || ""} readOnly className="bg-muted font-mono text-lg text-center tracking-widest" />
                      <Button variant="outline" size="icon" onClick={copyFamilyCode}><Copy className="h-4 w-4" /></Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Envie este código para outros usuários se vincularem à sua família.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Como funciona?</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• <strong>Dono:</strong> Quem cria a família. Pode ver e editar tudo.</p>
              <p>• <strong>Membros:</strong> Quem entra pelo código. Compartilham as mesmas contas, cartões e configurações.</p>
              <p>• <strong>Privacidade:</strong> Se você não estiver em uma família, seus dados são apenas seus.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Membros do Grupo</CardTitle></CardHeader>
          <CardContent>
            {isLoadingUsers ? <p>Carregando...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name} {u.id === currentUser?.id && "(Você)"}</TableCell>
                      <TableCell>{u.id === familyData.ownerId ? "Dono" : "Membro"}</TableCell>
                      <TableCell className="text-right">
                        {isOwner && u.id !== currentUser?.id && (
                          <Button variant="ghost" size="icon" onClick={() => confirm("Remover membro?") && toast.info("Funcionalidade em breve")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
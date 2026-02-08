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
import { Pencil, Trash2, UserPlus, UserCheck, Users, Link as LinkIcon, Copy } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Profile = Tables<'profiles'> & {
  email?: string;
};

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(false),
});

const createSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(false),
});

const editUserSchema = z.object({
  id: z.string(),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean(),
});

const familyNameSchema = z.object({
  name: z.string().min(1, "Nome da família é obrigatório"),
});

const joinFamilySchema = z.object({
  familyCode: z.string().min(1, "Código da família é obrigatório"),
});

type InviteFormData = z.infer<typeof inviteSchema>;
type CreateFormData = z.infer<typeof createSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;
type FamilyNameFormData = z.infer<typeof familyNameSchema>;
type JoinFamilyFormData = z.infer<typeof joinFamilySchema>;

export default function UserManagement() {
  const { user: currentUser, session, familyData, refreshFamily } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteFormOpen, setIsInviteFormOpen] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [isJoinFormOpen, setIsJoinFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", fullName: "", isFamilyMember: false },
  });

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", fullName: "", isFamilyMember: false },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { id: "", fullName: "", isFamilyMember: false },
  });

  const familyNameForm = useForm<FamilyNameFormData>({
    resolver: zodResolver(familyNameSchema),
    defaultValues: { name: familyData.name || "" },
  });

  const joinFamilyForm = useForm<JoinFamilyFormData>({
    resolver: zodResolver(joinFamilySchema),
    defaultValues: { familyCode: "" },
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, is_family_member, invited_by_user_id");

      if (profilesError) throw profilesError;
      return profilesData as Profile[];
    },
    enabled: !!currentUser?.id,
  });

  const generateFamilyCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const updateFamilyNameMutation = useMutation({
    mutationFn: async (data: FamilyNameFormData) => {
      if (!currentUser?.id) throw new Error("Usuário não identificado");
      
      const updateData: any = { 
        family_name: data.name, 
        is_family_member: true 
      };

      // Gera o código apenas se ainda não existir
      if (!familyData.code) {
        updateData.family_code = generateFamilyCode();
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", currentUser.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Família registrada com sucesso!");
      refreshFamily();
    },
    onError: (error: any) => {
      console.error("Erro ao salvar família:", error);
      toast.error(`Erro ao salvar família: ${error.message || "Erro desconhecido"}`);
    },
  });

  const joinFamilyMutation = useMutation({
    mutationFn: async (data: JoinFamilyFormData) => {
      if (!currentUser?.id) throw new Error("Não autenticado");
      
      const cleanCode = data.familyCode.trim().toUpperCase();

      const { data: headProfile, error: searchError } = await supabase
        .from("profiles")
        .select("id")
        .eq("family_code", cleanCode)
        .maybeSingle();

      if (searchError || !headProfile) {
        throw new Error("Código de família inválido ou não encontrado.");
      }

      if (headProfile.id === currentUser.id) {
        throw new Error("Você não pode vincular-se ao seu próprio código.");
      }

      const { error } = await supabase
        .from("profiles")
        .update({ invited_by_user_id: headProfile.id, is_family_member: true })
        .eq("id", currentUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Você agora faz parte da família!");
      setIsJoinFormOpen(false);
      refreshFamily();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao convidar usuário");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Convite enviado com sucesso!");
      setIsInviteFormOpen(false);
      inviteForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
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
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário cadastrado com sucesso!");
      setIsCreateFormOpen(false);
      createForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormData) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: data.fullName, is_family_member: data.isFamilyMember })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário atualizado!");
      setIsEditFormOpen(false);
      refreshFamily();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário removido!");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const copyFamilyCode = () => {
    if (familyData.code) {
      navigator.clipboard.writeText(familyData.code);
      toast.success("Código copiado!");
    }
  };

  const isRoot = currentUser?.id === familyData.rootId;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" /> Gerenciamento de Família
          </h1>
          <div className="flex gap-2">
            <Dialog open={isJoinFormOpen} onOpenChange={setIsJoinFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <LinkIcon className="mr-2 h-4 w-4" /> Vincular-se a Família
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular-se a uma Família</DialogTitle>
                  <DialogDescription>Insira o código de família de outro usuário para compartilhar contas.</DialogDescription>
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

            <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <UserCheck className="mr-2 h-4 w-4" /> Cadastrar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                  <DialogDescription>Crie um usuário diretamente com e-mail e senha.</DialogDescription>
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
                      <Button type="submit" disabled={createUserMutation.isPending}>{createUserMutation.isPending ? "Cadastrando..." : "Cadastrar"}</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog open={isInviteFormOpen} onOpenChange={setIsInviteFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="mr-2 h-4 w-4" /> Convidar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Usuário</DialogTitle>
                  <DialogDescription>Envie um convite por e-mail.</DialogDescription>
                </DialogHeader>
                <Form {...inviteForm}>
                  <form onSubmit={inviteForm.handleSubmit((data) => inviteUserMutation.mutate(data))} className="space-y-4">
                    <FormField control={inviteForm.control} name="fullName" render={({ field }) => (
                      <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={inviteForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={inviteForm.control} name="isFamilyMember" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Membro da Família</FormLabel>
                          <FormDescription>Compartilha lançamentos financeiros.</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="submit" disabled={inviteUserMutation.isPending}>{inviteUserMutation.isPending ? "Enviando..." : "Enviar Convite"}</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader><CardTitle>Minha Família</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isRoot ? (
                <Form {...familyNameForm}>
                  <form onSubmit={familyNameForm.handleSubmit((data) => updateFamilyNameMutation.mutate(data))} className="flex gap-2 items-end">
                    <FormField control={familyNameForm.control} name="name" render={({ field }) => (
                      <FormItem className="flex-1"><FormLabel>Nome da Família</FormLabel><FormControl><Input {...field} placeholder="Ex: Família Silva" /></FormControl></FormItem>
                    )} />
                    <Button type="submit" disabled={updateFamilyNameMutation.isPending}>Salvar</Button>
                  </form>
                </Form>
              ) : (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium">Família: {familyData.name || "Sem nome definido"}</p>
                  <p className="text-xs text-muted-foreground">Apenas o dono da família pode alterar o nome.</p>
                </div>
              )}
              
              {familyData.code && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Código da Família (Compartilhe para vincular outros):</p>
                  <div className="flex gap-2">
                    <Input value={familyData.code} readOnly className="bg-muted font-mono text-lg text-center tracking-widest" />
                    <Button variant="outline" size="icon" onClick={copyFamilyCode}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Usuários marcados como <strong>Membro da Família</strong> compartilham automaticamente suas contas a pagar, receber e cofrinho com o grupo.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Membros e Convidados</CardTitle></CardHeader>
          <CardContent>
            {isLoadingUsers ? <p>Carregando...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Compartilha Dados?</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name} {user.id === currentUser?.id && "(Você)"}</TableCell>
                      <TableCell>{user.is_family_member ? "Sim (Família)" : "Não (Individual)"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingUser(user);
                            editForm.reset({ id: user.id, fullName: user.full_name || "", isFamilyMember: user.is_family_member || false });
                            setIsEditFormOpen(true);
                          }}><Pencil className="h-4 w-4" /></Button>
                          {user.id !== currentUser?.id && (
                            <Button variant="ghost" size="icon" onClick={() => confirm("Excluir usuário?") && deleteUserMutation.mutate(user.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => updateUserMutation.mutate(data))} className="space-y-4">
                <FormField control={editForm.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="isFamilyMember" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Membro da Família</FormLabel>
                      <FormDescription>Ative para compartilhar lançamentos financeiros com o grupo.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={updateUserMutation.isPending}>Salvar Alterações</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
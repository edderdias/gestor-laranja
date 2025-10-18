import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (event === 'SIGNED_IN') {
          navigate('/dashboard');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message || "Erro ao fazer login");
        // Não re-lançar o erro para evitar Unhandled Promise Rejection
      } else {
        toast.success("Login realizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro inesperado ao fazer login");
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          }
        }
      });

      if (error) {
        toast.error(error.message || "Erro ao criar conta");
        // Não re-lançar o erro para evitar Unhandled Promise Rejection
      } else {
        toast.success("Cadastro realizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro inesperado ao criar conta");
    }
  };

  const signOut = async () => {
    try {
      if (user) { 
        const { error } = await supabase.auth.signOut();
        if (error) {
          // Verifica se o erro é AuthSessionMissingError
          if (error.message.includes("Auth session missing!")) {
            console.warn("Supabase signOut warning: Sessão já ausente no servidor. Prosseguindo com logout local.");
            toast.info("Sessão já encerrada no servidor. Desconectando localmente.");
          } else {
            console.error("Supabase signOut error:", error);
            toast.error(error.message || "Erro ao fazer logout no servidor. Desconectando localmente.");
          }
        } else {
          toast.success("Logout realizado com sucesso!");
        }
      } else {
        toast.info("Você já está desconectado.");
      }
    } catch (error: any) {
      console.error("Logout process error:", error);
      toast.error(error.message || "Erro inesperado durante o logout.");
    } finally {
      // Sempre limpa o estado local e navega para a página de autenticação
      setSession(null);
      setUser(null);
      navigate('/auth');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  familyMemberIds: string[];
  familyData: { id: string | null; name: string | null; ownerId: string | null; code: string | null };
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshFamily: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const [familyData, setFamilyData] = useState<{ id: string | null; name: string | null; ownerId: string | null; code: string | null }>({ id: null, name: null, ownerId: null, code: null });
  const navigate = useNavigate();
  const location = useLocation();

  const fetchFamilyData = async (userId: string) => {
    if (!userId) return;
    try {
      // Busca o perfil do usuário
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, family_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      // Se não tiver família, define como conta individual
      if (!profile?.family_id) {
        setFamilyMemberIds([userId]);
        setFamilyData({ id: null, name: null, ownerId: null, code: null });
        return;
      }

      // Busca os dados da família
      const { data: family, error: familyError } = await supabase
        .from("families")
        .select("*")
        .eq("id", profile.family_id)
        .maybeSingle();

      if (familyError) throw familyError;

      if (family) {
        setFamilyData({
          id: family.id,
          name: family.name,
          ownerId: family.owner_id,
          code: family.code
        });

        // Busca todos os membros da família
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("family_id", family.id);

        if (members) {
          setFamilyMemberIds(members.map(m => m.id));
        }
      } else {
        setFamilyMemberIds([userId]);
      }
    } catch (error) {
      console.error("Erro ao buscar dados da família:", error);
      // Em caso de erro, garante que o usuário consiga ver ao menos seus próprios dados
      setFamilyMemberIds([userId]);
    }
  };

  const refreshFamily = async () => {
    if (user) await fetchFamilyData(user.id);
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // 1. Verifica sessão inicial
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchFamilyData(initialSession.user.id);
          
          // Redireciona se estiver na tela de login
          if (location.pathname === '/auth' || location.pathname === '/') {
            navigate('/dashboard', { replace: true });
          }
        }
      } catch (error) {
        console.error("Erro na inicialização:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    // 2. Escuta mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchFamilyData(currentUser.id);
        if (location.pathname === '/auth') {
          navigate('/dashboard', { replace: true });
        }
      } else {
        setFamilyMemberIds([]);
        setFamilyData({ id: null, name: null, ownerId: null, code: null });
        if (location.pathname !== '/auth') {
          navigate('/auth', { replace: true });
        }
      }
      
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, familyMemberIds, familyData, signIn, signUp, signOut, refreshFamily }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
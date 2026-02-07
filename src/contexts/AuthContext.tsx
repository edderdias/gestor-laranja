import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  familyMemberIds: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const navigate = useNavigate();

  const fetchFamilyMembers = async (userId: string) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, invited_by_user_id")
        .eq("id", userId)
        .single();

      if (profileError) {
        setFamilyMemberIds([userId]);
        return;
      }

      const rootId = profile.invited_by_user_id || profile.id;

      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .or(`id.eq.${rootId},invited_by_user_id.eq.${rootId}`);

      if (membersError) {
        setFamilyMemberIds([userId]);
        return;
      }

      const ids = members.map(m => m.id);
      setFamilyMemberIds(ids.length > 0 ? ids : [userId]);
    } catch (error) {
      console.error("Erro ao buscar membros da família:", error);
      setFamilyMemberIds([userId]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchFamilyMembers(session.user.id);
        } else {
          setFamilyMemberIds([]);
        }

        if (event === 'SIGNED_IN') {
          navigate('/dashboard');
        }
      }
    );

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchFamilyMembers(session.user.id);
        }
      } catch (error) {
        console.error("Erro na sessão inicial:", error);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    } catch (error: any) {
      toast.error("Erro ao fazer login");
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) toast.error(error.message);
      else toast.success("Cadastro realizado!");
    } catch (error: any) {
      toast.error("Erro ao criar conta");
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      setFamilyMemberIds([]);
      navigate('/auth');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, familyMemberIds, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
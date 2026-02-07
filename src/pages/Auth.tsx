"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        const fullName = formData.get("fullName") as string;
        await signUp(email, password, fullName);
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-7xl overflow-hidden border-none shadow-2xl">
        <CardContent className="p-0 flex flex-col md:flex-row">
          {/* Lado Esquerdo: Formulário (30%) */}
          <div className="w-full md:w-[30%] p-8 md:py-24 md:px-10 bg-[#2C7F24] flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100">
            <div className="w-full space-y-8">
              <div className="space-y-6 flex flex-col items-center text-center">
                <img src="/logo.png" alt="Logo" className="h-[70px] w-auto" />
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {mode === "signin" ? (
                    <>
                      Bem-vindo ao <br /> Método Certo
                    </>
                  ) : (
                    "Crie sua conta"
                  )}
                </h1>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-white/90">Nome completo</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      placeholder="Digite seu nome"
                      required
                      disabled={isLoading}
                      className="bg-white border-white/20 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/90">Seu e-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Digite seu e-mail"
                    required
                    disabled={isLoading}
                    className="bg-white border-white/20 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/90">Sua senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Digite sua senha"
                    required
                    disabled={isLoading}
                    className="bg-white border-white/20 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                  />
                </div>
                
                <Button type="submit" className="w-full bg-white text-[#2C7F24] hover:bg-slate-100 font-semibold py-6" disabled={isLoading}>
                  {isLoading ? "Processando..." : mode === "signin" ? "Entrar" : "Cadastrar"}
                </Button>
              </form>

              <div className="text-center space-y-2">
                {mode === "signin" ? (
                  <>
                    <button type="button" className="text-sm text-white/80 hover:text-white hover:underline block w-full">
                      Esqueceu sua senha?
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setMode("signup")}
                      className="text-sm text-white/80 hover:text-white hover:underline"
                    >
                      Não tem uma conta? Registre-se
                    </button>
                  </>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setMode("signin")}
                    className="text-sm text-white/80 hover:text-white hover:underline"
                  >
                    Já tem uma conta? Faça login
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Lado Direito: Imagem (70%) */}
          <div className="w-full md:w-[70%] bg-white flex items-center justify-center p-4 md:py-20 md:px-12">
            <div className="relative w-full max-w-4xl flex items-center justify-center">
              <img 
                src="/método certo.png" 
                alt="Método Certo" 
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
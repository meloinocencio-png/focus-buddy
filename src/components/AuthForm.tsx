import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
        navigate("/");
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });
        
        if (error) throw error;
        toast.success("Conta criada! Você já pode fazer login.");
        setIsLogin(true);
      }
    } catch (error: any) {
      console.error("Erro de autenticação:", error);
      toast.error(error.message || "Erro ao processar requisição");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{isLogin ? "Entrar" : "Criar Conta"}</CardTitle>
        <CardDescription>
          {isLogin 
            ? "Entre com suas credenciais para acessar seus compromissos" 
            : "Crie uma conta para começar a organizar seus compromissos"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-base"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="text-base"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full text-base h-12"
            disabled={loading}
          >
            {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar Conta"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-base"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
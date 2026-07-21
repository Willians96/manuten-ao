"use client";
import { useAuth, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <SignedOut>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          background: "#f4f6f9"
        }}>
          <div style={{
            background: "#fff",
            padding: 48,
            borderRadius: 12,
            textAlign: "center",
            border: "1px solid #e2e8f0",
            maxWidth: 400
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🔧</div>
            <h1 style={{ fontSize: 24, color: "#003882", marginBottom: 8 }}>
              Manutenção CPI-7
            </h1>
            <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
              Sistema de gestão de solicitações de manutenção
            </p>
            <RedirectToSignIn />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <RoleRouter />
      </SignedIn>
    </>
  );
}

function RoleRouter() {
  const router = useRouter();
  const user = useQuery(api.mutations.me);
  const [mounted, setMounted] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Se ficar "Redirecionando..." por mais de 5s, mostra opção de refresh
  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => setStuck(true), 5000);
    return () => clearTimeout(timer);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (user === undefined) return; // carregando
    if (user === null) {
      // user NÃO está no banco → preencher perfil
      router.replace("/pendente");
      return;
    }
    if (!user.approved) {
      router.replace("/pendente");
      return;
    }
    switch (user.role) {
      case "gestor":
      case "admin":
        router.replace("/gestor");
        break;
      case "tecnico":
        router.replace("/tecnico");
        break;
      default:
        router.replace("/solicitar");
    }
  }, [mounted, user, router]);

  if (!mounted) return <div style={{ padding: 40, textAlign: "center" }}>Carregando…</div>;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
      background: "#f4f6f9",
      color: "#003882",
      padding: 16,
      textAlign: "center"
    }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>
        {user === undefined ? "Carregando dados do usuário..." : "Redirecionando…"}
      </div>
      {stuck && user !== undefined && (
        <div className="card" style={{ maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⏱️</div>
          <h3 style={{ color: "#003882", marginBottom: 8 }}>Demora pra redirecionar?</h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Pode ser que sua role tenha sido alterada pelo gestor. Toque em "Atualizar" pra recarregar.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              🔄 Atualizar página
            </button>
            <button
              className="btn btn-outline"
              onClick={async () => {
                await fetch("/api/sign-out", { method: "POST" });
                window.location.href = "/";
              }}
            >
              🚪 Sair e entrar de novo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { userId } = useAuth();
  const router = useRouter();
  const user = useQuery(api.mutations.me);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !user) return;
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

  if (!mounted) return <div style={{ padding: 40, textAlign: "center" }}>Carregando...</div>;

  return <div style={{ padding: 40, textAlign: "center" }}>Redirecionando...</div>;
}

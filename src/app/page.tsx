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
    if (!mounted) return;
    console.log("[RoleRouter] state:", { mounted, user, userId });
    if (user === undefined) return; // ainda carregando
    if (user === null) {
      // user NÃO está no banco → vai preencher perfil
      router.replace("/pendente");
      return;
    }
    console.log("[RoleRouter] user loaded:", { role: user.role, approved: user.approved });
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
  }, [mounted, user, userId, router]);

  if (!mounted) return <div style={{ padding: 40, textAlign: "center" }}>Carregando...</div>;

  // ── Debug visual: mostra o que está acontecendo ──
  return (
    <div style={{ padding: 40, fontFamily: "monospace", fontSize: 12 }}>
      <div style={{ marginBottom: 8 }}>Redirecionando...</div>
      <div style={{ background: "#f1f5f9", padding: 12, borderRadius: 6, marginTop: 16 }}>
        <div><strong>userId (Clerk):</strong> {userId ?? <em>null</em>}</div>
        <div><strong>user (Convex):</strong> {user === undefined ? <em>loading...</em> : user === null ? <em style={{color:"red"}}>NULL (não encontrado no banco)</em> : JSON.stringify({ role: user.role, approved: user.approved, nome: user.nomeDeGuerra })}</div>
      </div>
    </div>
  );
}

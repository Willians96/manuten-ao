"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * RoleGuard - protege uma página contra acessos com role errado
 *
 * Se o user não tiver o role permitido, redireciona pro dashboard correto.
 *
 * Uso:
 *   <RoleGuard allow={["gestor", "admin"]}>
 *     <ConteudoProtegido />
 *   </RoleGuard>
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: Array<"solicitante" | "gestor" | "tecnico" | "admin">;
  children: React.ReactNode;
}) {
  const me = useQuery(api.mutations.me);
  const router = useRouter();

  useEffect(() => {
    if (me === undefined) return; // carregando
    if (me === null) {
      // user não tá no banco → vai pro /pendente
      router.replace("/pendente");
      return;
    }
    if (!me.approved) {
      router.replace("/pendente");
      return;
    }
    // Verifica se o role do user tá na lista permitida
    if (!allow.includes(me.role as any)) {
      // Redireciona pro dashboard do role dele
      const target =
        me.role === "gestor" || me.role === "admin"
          ? "/gestor"
          : me.role === "tecnico"
          ? "/tecnico"
          : "/solicitar";
      router.replace(target);
    }
  }, [me, allow, router]);

  // Enquanto carrega ou se o role não bate, mostra "carregando"
  if (me === undefined) {
    return (
      <div style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#003882",
        fontSize: 14,
        fontWeight: 500,
      }}>
        Carregando…
      </div>
    );
  }

  if (me === null || !me.approved) {
    return null; // vai redirecionar
  }

  if (!allow.includes(me.role as any)) {
    return (
      <div style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "#dc2626",
        padding: 16,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32 }}>⛔</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Acesso restrito
        </div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          Esta página é só pra {allow.join(" / ")}.
          <br />
          Redirecionando pro seu painel...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

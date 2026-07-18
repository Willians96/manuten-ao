"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FixAccountPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const me = useQuery(api.mutations.me);
  const [dbState, setDbState] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    loadDbState();
  }, [isLoaded, user]);

  async function loadDbState() {
    setLoading(true);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) {
        setDbState({ error: "Sem token convex" });
        return;
      }
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      // query anyAdmin
      const r1 = await fetch(`${convexUrl}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          path: "mutations:anyAdminExists",
          args: {},
        }),
      }).then((r) => r.json()).catch(() => null);

      // listar todos os users
      const r2 = await fetch(`${convexUrl}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          path: "mutations:listAllUsers",
          args: {},
        }),
      }).then((r) => r.json()).catch(() => null);

      setDbState({ anyAdmin: r1, me });
      setAllUsers(r2?.value ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function forceAdmin() {
    setLoading(true);
    try {
      const token = await getToken({ template: "convex" });
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      await fetch(`${convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          path: "mutations:forceAdminMaster",
          args: {},
        }),
      });
      await loadDbState();
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) return <div style={{ padding: 40 }}>Carregando…</div>;
  if (!user) return <div style={{ padding: 40 }}>Não logado</div>;

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 900, margin: "0 auto" }}>
      <h2>🔧 Diagnóstico da Conta</h2>

      <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
        <strong>Clerk userId:</strong> <code>{user.id}</code><br />
        <strong>Email:</strong> {user.emailAddresses[0]?.emailAddress}<br />
        <strong>Nome:</strong> {user.fullName ?? user.firstName}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
        <strong>Estado no Convex (useQuery me):</strong>
        <pre style={{ marginTop: 8, fontSize: 12, overflow: "auto" }}>
{JSON.stringify(me, null, 2)}
        </pre>
      </div>

      {dbState && (
        <div style={{ marginTop: 16, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
          <strong>Estado do banco (consulta direta):</strong>
          <pre style={{ marginTop: 8, fontSize: 12, overflow: "auto" }}>
{JSON.stringify(dbState, null, 2)}
          </pre>
        </div>
      )}

      {allUsers.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 8 }}>
          <strong>Todos os users no banco ({allUsers.length}):</strong>
          <pre style={{ marginTop: 8, fontSize: 12, overflow: "auto" }}>
{JSON.stringify(allUsers, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={forceAdmin} disabled={loading} className="btn btn-primary">
          👑 Forçar virar Admin Master
        </button>
        <button onClick={loadDbState} disabled={loading} className="btn btn-outline">
          🔄 Recarregar diagnóstico
        </button>
        <Link href="/" className="btn btn-outline">↩ Voltar</Link>
      </div>
    </div>
  );
}

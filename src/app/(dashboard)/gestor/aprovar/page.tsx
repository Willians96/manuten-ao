"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";

export const dynamic = "force-dynamic";

export default function AprovarPage() {
  const pendentes = useQuery(api.mutations.pendingUsers);
  const approve = useMutation(api.mutations.approveUser);

  // role selecionado pra cada user (key = userId)
  const [roles, setRoles] = useState<Record<string, string>>({});

  function setRole(userId: string, role: string) {
    setRoles((prev) => ({ ...prev, [userId]: role }));
  }

  async function handleApprove(userId: any) {
    const role = roles[userId] || "solicitante";
    await approve({ userId, role: role as any });
  }

  return (
    <div className="page-container">
      <h1 className="page-title">👥 Aprovar Usuários</h1>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Graduação</th>
              <th>Nome de Guerra</th>
              <th>RE</th>
              <th>Seção</th>
              <th style={{ minWidth: 280 }}>Definir Role + Ação</th>
            </tr>
          </thead>
          <tbody>
            {(pendentes ?? []).map((u: any) => {
              const currentRole = roles[u._id] || "solicitante";
              return (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td>{u.graduacao ?? "—"}</td>
                  <td>{u.nomeDeGuerra ?? "—"}</td>
                  <td>{u.re ?? "—"}</td>
                  <td>{u.secao ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        value={currentRole}
                        onChange={(e) => setRole(u._id as string, e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #e2e8f0", fontSize: 13 }}
                      >
                        <option value="solicitante">👤 Solicitante</option>
                        <option value="gestor">👑 Gestor</option>
                        <option value="tecnico">🔧 Técnico</option>
                      </select>
                      <button
                        className="btn btn-success"
                        style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}
                        onClick={() => handleApprove(u._id as any)}
                      >
                        ✅ Aprovar como {currentRole === "solicitante" ? "Solicitante" : currentRole === "gestor" ? "Gestor" : "Técnico"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pendentes?.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
                  Nenhum usuário pendente de aprovação.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, fontSize: 13 }}>
        <strong>💡 Dica:</strong> selecione o role desejado antes de clicar em "Aprovar":
        <ul style={{ marginTop: 6, paddingLeft: 20, color: "#1e40af" }}>
          <li><strong>Solicitante</strong> — pode abrir chamados (default)</li>
          <li><strong>Gestor</strong> — pode aprovar, atribuir, cancelar/editar serviços</li>
          <li><strong>Técnico</strong> — vê e executa serviços da sua equipe</li>
        </ul>
      </div>
    </div>
  );
}

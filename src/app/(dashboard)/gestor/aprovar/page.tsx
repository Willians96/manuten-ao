"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

export default function AprovarPage() {
  const pendentes = useQuery(api.mutations.pendingUsers);
  const approve = useMutation(api.mutations.approveUser);

  async function handleApprove(userId: any) {
    await approve({ userId });
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
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(pendentes ?? []).map((u: any) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td style={{ fontSize: 13 }}>{u.email}</td>
                <td>{u.graduacao ?? "—"}</td>
                <td>{u.nomeDeGuerra ?? "—"}</td>
                <td>{u.re ?? "—"}</td>
                <td>{u.secao ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn btn-success"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                      onClick={() => handleApprove(u._id)}
                    >
                      ✅ Aprovar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
    </div>
  );
}

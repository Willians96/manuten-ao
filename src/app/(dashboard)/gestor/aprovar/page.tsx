"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState, useMemo } from "react";

export const dynamic = "force-dynamic";

type User = {
  _id: string;
  name?: string;
  email: string;
  role: string;
  graduacao?: string;
  nomeDeGuerra?: string;
  re?: string;
  secao?: string;
  approved: boolean;
  isAdminMaster?: boolean;
};

export default function AprovarPage() {
  const pendentes = useQuery(api.mutations.pendingUsers);
  const allUsers = useQuery(api.mutations.listAllUsers);
  const me = useQuery(api.mutations.me);
  const approve = useMutation(api.mutations.approveUser);
  const updateRole = useMutation(api.mutations.updateUserRole);
  const deleteUserMutation = useMutation(api.mutations.deleteUser);
  const forceDeleteUserMutation = useMutation(api.mutations.forceDeleteUser);

  const isAdminMaster = me?.isAdminMaster === true;

  // role selecionado pra cada user (key = userId)
  const [roles, setRoles] = useState<Record<string, string>>({});

  // edição inline de role pra usuários já aprovados
  const [editRole, setEditRole] = useState<Record<string, string>>({});

  // busca
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"pendentes" | "aprovados" | "todos">("pendentes");

  function setRole(userId: string, role: string) {
    setRoles((prev) => ({ ...prev, [userId]: role }));
  }

  function setEditRoleVal(userId: string, role: string) {
    setEditRole((prev) => ({ ...prev, [userId]: role }));
  }

  async function handleApprove(userId: any) {
    const role = roles[userId] || "solicitante";
    await approve({ userId, role: role as any });
  }

  async function handleUpdateRole(userId: any) {
    const role = editRole[userId];
    if (!role) return;
    try {
      await updateRole({ userId, role: role as any });
      alert("Role atualizado!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
  }

  async function handleToggleSuspend(user: User) {
    const novoStatus = !user.approved;
    const acao = novoStatus ? "reativar" : "suspender";
    if (!confirm(`${acao.charAt(0).toUpperCase() + acao.slice(1)} o usuário ${user.nomeDeGuerra || user.name}?`)) return;
    try {
      await updateRole({ userId: user._id as any, role: user.role as any, approved: novoStatus });
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
  }

  async function handleDelete(user: User) {
    if (!isAdminMaster) {
      alert("Apenas o Admin Master pode excluir usuários.");
      return;
    }
    const nome = `${user.graduacao ?? ""} ${user.nomeDeGuerra ?? user.name ?? user.email}`.trim();
    if (!confirm(`⚠️ EXCLUIR PERMANENTEMENTE o usuário "${nome}"?\n\nEsta ação NÃO pode ser desfeita!`)) return;
    if (!confirm(`Tem certeza absoluta? Digite OK mentalmente e confirme de novo.\n\nExcluir: ${nome}`)) return;
    try {
      await deleteUserMutation({ userId: user._id as any });
      alert("Usuário excluído.");
    } catch (e: any) {
      // Se der erro de dependência, oferece exclusão em cascata
      const errMsg = e?.message || e?.data?.message || String(e);
      console.log("Erro deleteUser:", errMsg);
      if (confirm(`❌ Erro: ${errMsg}\n\nTentar EXCLUIR EM CASCATA? (apaga o user + serviços + técnicos vinculados juntos)\n\nISTO É IRREVERSÍVEL!`)) {
        try {
          await forceDeleteUserMutation({ userId: user._id as any });
          alert("Usuário e dependências excluídos em cascata.");
        } catch (e2: any) {
          const errMsg2 = e2?.message || e2?.data?.message || String(e2);
          alert("Erro no cascade: " + errMsg2);
        }
      }
    }
  }

  // Filtrar por busca
  function matchBusca(u: User): boolean {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase().trim();
    return (
      (u.re ?? "").toLowerCase().includes(q) ||
      (u.nomeDeGuerra ?? "").toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.secao ?? "").toLowerCase().includes(q) ||
      (u.graduacao ?? "").toLowerCase().includes(q)
    );
  }

  const pendentesFiltrados = useMemo(
    () => (pendentes ?? []).filter(matchBusca),
    [pendentes, busca]
  );

  const aprovadosFiltrados = useMemo(
    () => (allUsers ?? []).filter((u: User) => u.approved && matchBusca(u)),
    [allUsers, busca]
  );

  const totalP = pendentes?.length ?? 0;
  const totalA = (allUsers ?? []).filter((u: User) => u.approved).length;

  return (
    <div className="page-container">
      <h1 className="page-title">👥 Gerenciar Usuários {isAdminMaster && <span style={{ fontSize: 14, marginLeft: 12, background: "#f6d700", color: "#003882", padding: "4px 10px", borderRadius: 12, fontWeight: 700 }}>👑 Admin Master</span>}</h1>

      {/* Barra de busca + filtro */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "end" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>🔍 Buscar por RE, nome, nome de guerra, email ou seção</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: 123.456-7, Silva, michel@..."
              style={{ width: "100%" }}
            />
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label>Visualizar</label>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as any)} style={{ width: "100%" }}>
              <option value="pendentes">Pendentes ({totalP})</option>
              <option value="aprovados">Aprovados ({totalA})</option>
              <option value="todos">Todos ({totalP + totalA})</option>
            </select>
          </div>
          {(busca || filtroStatus !== "pendentes") && (
            <button className="btn btn-outline" onClick={() => { setBusca(""); setFiltroStatus("pendentes"); }}>
              ✖ Limpar
            </button>
          )}
        </div>
      </div>

      {/* Pendentes */}
      {(filtroStatus === "pendentes" || filtroStatus === "todos") && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#92400e" }}>
            ⏳ Pendentes de aprovação ({pendentesFiltrados.length})
          </h2>
          <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>RE</th>
                  <th>Grad</th>
                  <th>Nome Guerra</th>
                  <th>Seção</th>
                  <th style={{ minWidth: 320 }}>Definir Role + Aprovar</th>
                </tr>
              </thead>
              <tbody>
                {pendentesFiltrados.map((u: User) => {
                  const currentRole = roles[u._id] || "solicitante";
                  return (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td style={{ fontSize: 13 }}>{u.email}</td>
                      <td><strong style={{ fontFamily: "monospace" }}>{u.re ?? "—"}</strong></td>
                      <td>{u.graduacao ?? "—"}</td>
                      <td>{u.nomeDeGuerra ?? "—"}</td>
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
                            ✅ Aprovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pendentesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
                      {busca ? "Nenhum pendente encontrado com essa busca." : "Nenhum usuário pendente de aprovação. 🎉"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Aprovados (gerenciar role/suspender) */}
      {(filtroStatus === "aprovados" || filtroStatus === "todos") && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#1e40af" }}>
            ✅ Usuários aprovados ({aprovadosFiltrados.length})
          </h2>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>RE</th>
                  <th>Grad</th>
                  <th>Nome Guerra</th>
                  <th>Seção</th>
                  <th>Role</th>
                  <th style={{ minWidth: 220 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {aprovadosFiltrados.map((u: User) => {
                  const currentEditRole = editRole[u._id] ?? u.role;
                  return (
                    <tr key={u._id} style={{ opacity: u.approved ? 1 : 0.55 }}>
                      <td>
                        <span style={{
                          background: u.approved ? "#dcfce7" : "#fee2e2",
                          color: u.approved ? "#166534" : "#991b1b",
                          padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600
                        }}>
                          {u.approved ? "✅ Ativo" : "⏸ Suspenso"}
                        </span>
                        {u.isAdminMaster && (
                          <div style={{ fontSize: 10, color: "#f6d700", background: "#003882", padding: "1px 6px", borderRadius: 3, marginTop: 3, fontWeight: 700, display: "inline-block" }}>
                            👑 MASTER
                          </div>
                        )}
                      </td>
                      <td>{u.name}</td>
                      <td style={{ fontSize: 12 }}>{u.email}</td>
                      <td><strong style={{ fontFamily: "monospace" }}>{u.re ?? "—"}</strong></td>
                      <td>{u.graduacao ?? "—"}</td>
                      <td>{u.nomeDeGuerra ?? "—"}</td>
                      <td>{u.secao ?? "—"}</td>
                      <td>
                        {u.isAdminMaster ? (
                          <span style={{ background: "#003882", color: "#f6d700", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            👑 Admin Master
                          </span>
                        ) : (
                          <select
                            value={currentEditRole}
                            onChange={(e) => setEditRoleVal(u._id as string, e.target.value)}
                            style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #e2e8f0", fontSize: 12 }}
                            disabled={!u.approved}
                          >
                            <option value="solicitante">👤 Solicitante</option>
                            <option value="gestor">👑 Gestor</option>
                            <option value="tecnico">🔧 Técnico</option>
                            <option value="admin">⚙️ Admin</option>
                          </select>
                        )}
                      </td>
                      <td>
                        {!u.isAdminMaster && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {u.approved && editRole[u._id] && editRole[u._id] !== u.role && (
                              <button
                                className="btn btn-success"
                                style={{ fontSize: 11, padding: "4px 10px" }}
                                onClick={() => handleUpdateRole(u._id as any)}
                              >
                                💾 Salvar
                              </button>
                            )}
                            <button
                              className="btn btn-outline"
                              style={{
                                fontSize: 11, padding: "4px 10px",
                                color: u.approved ? "#991b1b" : "#166534",
                                borderColor: u.approved ? "#fecaca" : "#bbf7d0"
                              }}
                              onClick={() => handleToggleSuspend(u)}
                            >
                              {u.approved ? "⏸ Suspender" : "▶ Reativar"}
                            </button>
                            {isAdminMaster && (
                              <button
                                style={{
                                  fontSize: 11, padding: "4px 10px",
                                  background: "#dc2626", color: "#fff",
                                  border: "1px solid #dc2626", borderRadius: "var(--radius)",
                                  cursor: "pointer", fontWeight: 500,
                                  display: "inline-flex", alignItems: "center", gap: 4
                                }}
                                onClick={() => handleDelete(u)}
                                title="Excluir permanentemente (apenas Admin Master)"
                              >
                                🗑 Excluir
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {aprovadosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
                      {busca ? "Nenhum aprovado encontrado com essa busca." : "Nenhum usuário aprovado ainda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, fontSize: 13 }}>
        <strong>💡 Como usar:</strong>
        <ul style={{ marginTop: 6, paddingLeft: 20, color: "#1e40af" }}>
          <li>Use a <strong>busca</strong> pra localizar alguém por RE (Ex: "123.456-7") ou nome de guerra</li>
          <li>Em <strong>Pendentes</strong>: escolha o role e clique em "Aprovar"</li>
          <li>Em <strong>Aprovados</strong>: mude o role e clique em "Salvar", ou suspenda/reative o usuário</li>
          <li>O <strong>Admin Master</strong> (👑 MASTER) é protegido e não pode ser alterado por outros</li>
        </ul>
      </div>
    </div>
  );
}

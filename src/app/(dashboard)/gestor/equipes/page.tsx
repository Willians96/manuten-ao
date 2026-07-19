"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";

export const dynamic = "force-dynamic";

interface Tecnico {
  _id: string;
  userId: string;
  equipeId: string;
  graduacao: string;
  nomeDeGuerra: string;
  re: string;
  ativo: boolean;
  createdAt: number;
  user?: { clerkId?: string };
}

export default function EquipesPage() {
  const equipes = useQuery(api.mutations.listEquipes, {});
  const tecnicos = useQuery(api.mutations.listTecnicos, {});
  const criarEquipe = useMutation(api.mutations.criarEquipe);
  const cadastrarTecnico = useMutation(api.mutations.cadastrarTecnico);
  const editarTecnico = useMutation(api.mutations.editarTecnico);
  const excluirTecnico = useMutation(api.mutations.excluirTecnico);
  const alterarStatus = useMutation(api.mutations.alterarStatusTecnico);

  const [novaEquipe, setNovaEquipe] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [cadTecnico, setCadTecnico] = useState({
    graduacao: "", nomeDeGuerra: "", re: ""
  });
  const [editT, setEditT] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    graduacao: "", nomeDeGuerra: "", re: "", equipeId: "", ativo: true
  });

  async function handleCriarEquipe(e: React.FormEvent) {
    e.preventDefault();
    if (!novaEquipe.trim()) return;
    try { await criarEquipe({ nome: novaEquipe.trim() }); setNovaEquipe(""); }
    catch (e: any) { alert(e.message); }
  }

  function handleCadastrarTecnico(equipeId: string) {
    return (e: React.FormEvent) => {
      e.preventDefault();
      void (async () => {
        try {
          await cadastrarTecnico({
            equipeId: equipeId as any,
            graduacao: cadTecnico.graduacao,
            nomeDeGuerra: cadTecnico.nomeDeGuerra,
            re: cadTecnico.re,
          });
          setCadTecnico({ graduacao: "", nomeDeGuerra: "", re: "" });
        } catch (e: any) { alert(e.message); }
      })();
    };
  }

  function openEdit(t: any) {
    setEditT(t);
    setEditForm({
      graduacao: t.graduacao,
      nomeDeGuerra: t.nomeDeGuerra,
      re: t.re,
      equipeId: t.equipeId,
      ativo: t.ativo,
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editT) return;
    try {
      await editarTecnico({
        tecnicoId: editT._id as any,
        graduacao: editForm.graduacao,
        nomeDeGuerra: editForm.nomeDeGuerra,
        re: editForm.re,
        equipeId: editForm.equipeId as any,
        ativo: editForm.ativo,
      });
      setEditT(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleExcluir(t: any) {
    if (!confirm(`Excluir ${t.nomeDeGuerra} (RE ${t.re})? Não poderá ser excluído se tiver serviços em andamento.`)) return;
    try {
      await excluirTecnico({ tecnicoId: t._id as any });
    } catch (e: any) { alert(e.message); }
  }

  async function handleReativar(t: any) {
    try {
      await editarTecnico({
        tecnicoId: t._id as any,
        graduacao: t.graduacao,
        nomeDeGuerra: t.nomeDeGuerra,
        re: t.re,
        equipeId: t.equipeId as any,
        ativo: true,
      });
    } catch (e: any) { alert(e.message); }
  }

  async function handleAlterarStatus(t: any, status: "ativo" | "ferias" | "baixa") {
    try {
      await alterarStatus({ tecnicoId: t._id as any, status });
    } catch (e: any) { alert(e.message); }
  }

  function renderStatusBadge(status: string) {
    const baseStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4 };
    if (status === "ferias") return <span style={{ ...baseStyle, background: "#dbeafe", color: "#1e40af" }}>🏖 Férias</span>;
    if (status === "baixa") return <span style={{ ...baseStyle, background: "#fee2e2", color: "#991b1b" }}>🏥 Baixa</span>;
    return <span style={{ ...baseStyle, background: "#dcfce7", color: "#166534" }}>✅ Ativo</span>;
  }

  return (
    <div className="page-container">
      <h1 className="page-title">🔧 Gerenciar Equipes</h1>

      {/* Criar equipe */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>➕ Nova Equipe</h3>
        <form onSubmit={handleCriarEquipe} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label>Nome da Equipe</label>
            <input
              type="text"
              value={novaEquipe}
              onChange={(e) => setNovaEquipe(e.target.value)}
              placeholder="Ex: Equipe A"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">Criar</button>
        </form>
      </div>

      {/* Toggle inativos */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showInativos}
            onChange={(e) => setShowInativos(e.target.checked)}
          />
          Mostrar técnicos inativos/excluídos
        </label>
      </div>

      {/* Equipes e técnicos */}
      {(equipes ?? []).map((eq: any) => {
        const tecnicosEq = (tecnicos ?? []).filter((t: any) =>
          t.equipeId === eq._id && (showInativos || t.ativo)
        );
        const totalEquipe = (tecnicos ?? []).filter((t: any) => t.equipeId === eq._id && t.ativo).length;

        return (
          <div key={eq._id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 16 }}>{eq.nome}</h3>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {totalEquipe} ativo(s) · {tecnicosEq.length} no filtro
              </span>
            </div>

            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Graduação</th>
                  <th>Nome de Guerra</th>
                  <th>RE</th>
                  <th>Cadastro</th>
                  <th>Status Trabalho</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tecnicosEq.map((t: any) => {
                  const isPlaceholder = t.user?.clerkId?.startsWith("pendente:") ?? false;
                  return (
                    <tr key={t._id} style={{ opacity: t.ativo ? 1 : 0.55 }}>
                      <td>{t.graduacao}</td>
                      <td>
                        {t.nomeDeGuerra}
                        {isPlaceholder && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, color: "#92400e",
                            background: "#fef3c7", padding: "1px 6px", borderRadius: 4
                          }} title="Ainda não fez login">
                            ⏳ pendente login
                          </span>
                        )}
                      </td>
                      <td>{t.re}</td>
                      <td>
                        {t.ativo ? (
                          <span style={{ color: "#166534", fontSize: 12, fontWeight: 600 }}>● Ativo</span>
                        ) : (
                          <span style={{ color: "#991b1b", fontSize: 12, fontWeight: 600 }}>● Inativo</span>
                        )}
                      </td>
                      <td>
                        {renderStatusBadge(t.status || "ativo")}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(t.status || "ativo") === "ativo" ? (
                            <>
                              <button className="btn btn-outline" style={{ fontSize: 10, padding: "2px 6px", color: "#1e40af", borderColor: "#bfdbfe" }} onClick={() => handleAlterarStatus(t, "ferias")} title="Marcar em ferias">🏖</button>
                              <button className="btn btn-outline" style={{ fontSize: 10, padding: "2px 6px", color: "#991b1b", borderColor: "#fecaca" }} onClick={() => handleAlterarStatus(t, "baixa")} title="Marcar em baixa medica">🏥</button>
                            </>
                          ) : (
                            <button className="btn btn-success" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => handleAlterarStatus(t, "ativo")} title="Voltar (Ativar)">✅ Voltar</button>
                          )}
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => openEdit(t)} title="Editar">✏️</button>
                          {t.ativo ? (
                            <button className="btn btn-danger" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => handleExcluir(t)}>🗑</button>
                          ) : (
                            <button className="btn btn-success" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => handleReativar(t)}>↻</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {tecnicosEq.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                      Nenhum técnico {showInativos ? "" : "ativo"} nesta equipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Cadastrar técnico */}
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#003882", fontWeight: 500 }}>
                ➕ Cadastrar Técnico em {eq.nome}
              </summary>
              <form onSubmit={handleCadastrarTecnico(eq._id)} style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Equipe fixo: a equipe atual (não permite trocar) */}
                <input
                  type="hidden"
                  value={eq._id}
                  readOnly
                />
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Equipe destino</label>
                  <input
                    type="text"
                    value={eq.nome}
                    disabled
                    style={{ background: "#f1f5f9", color: "#6b7280", fontWeight: 600 }}
                  />
                </div>
                <div className="form-group">
                  <label>Graduação</label>
                  <select
                    value={cadTecnico.graduacao}
                    onChange={(e) => setCadTecnico({ ...cadTecnico, graduacao: e.target.value })}
                    required
                  >
                    <option value="">Selecione...</option>
                    {["Sd","Cb","3º Sgt","2º Sgt","1º Sgt","Asp","2º Ten","1º Ten","Cap","Maj","Ten Cel","Cel"].map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Nome de Guerra</label>
                  <input
                    type="text"
                    value={cadTecnico.nomeDeGuerra}
                    onChange={(e) => setCadTecnico({ ...cadTecnico, nomeDeGuerra: e.target.value })}
                    placeholder="Ex: CARLOS"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>RE</label>
                  <input
                    type="text"
                    value={cadTecnico.re}
                    onChange={(e) => setCadTecnico({ ...cadTecnico, re: e.target.value })}
                    placeholder="Ex: 123.456-7"
                    required
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="btn btn-success">Cadastrar em {eq.nome}</button>
                </div>
              </form>
            </details>
          </div>
        );
      })}

      {equipes?.length === 0 && (
        <p style={{ color: "#6b7280" }}>Nenhuma equipe criada ainda.</p>
      )}

      {/* Modal Editar */}
      {editT && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 480, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>✏️ Editar Técnico</h3>
              <button onClick={() => setEditT(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Equipe</label>
                <select
                  value={editForm.equipeId}
                  onChange={(e) => setEditForm({ ...editForm, equipeId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {(equipes ?? []).map((e: any) => (
                    <option key={e._id} value={e._id}>{e.nome}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Graduação</label>
                <select
                  value={editForm.graduacao}
                  onChange={(e) => setEditForm({ ...editForm, graduacao: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {["Cb","ST","1º Sgt","2º Sgt","3º Sgt","Sd","Ten Cel","Maj","Cap","1º Ten","2º Ten"].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Nome de Guerra</label>
                <input
                  type="text"
                  value={editForm.nomeDeGuerra}
                  onChange={(e) => setEditForm({ ...editForm, nomeDeGuerra: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>RE</label>
                <input
                  type="text"
                  value={editForm.re}
                  onChange={(e) => setEditForm({ ...editForm, re: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={editForm.ativo}
                    onChange={(e) => setEditForm({ ...editForm, ativo: e.target.checked })}
                  />
                  Ativo
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" className="btn btn-primary">💾 Salvar</button>
                <button type="button" className="btn btn-outline" onClick={() => setEditT(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { RoleGuard } from "../../../components/RoleGuard";

export const dynamic = "force-dynamic";

export default function GestorPage() {
  return (
    <RoleGuard allow={["gestor", "admin"]}>
      <GestorPageContent />
    </RoleGuard>
  );
}

function GestorPageContent() {
  const stats = useQuery(api.mutations.dashboardStats);
  const servicos = useQuery(api.mutations.listServicos, {});
  const equipes = useQuery(api.mutations.listEquipes);
  const tecnicos = useQuery(api.mutations.listTecnicos, {});
  const me = useQuery(api.mutations.me);
  const atribuir = useMutation(api.mutations.atribuirServico);
  const excluir = useMutation(api.mutations.excluirServico);
  const cancelar = useMutation(api.mutations.cancelarServico);
  const editar = useMutation(api.mutations.editarServico);

  const isAdminMaster = me?.isAdminMaster === true;

  const [filtro, setFiltro] = useState("todos");
  const [editS, setEditS] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    titulo: "", descricao: "", local: "", urgencia: "media"
  });
  const [modalAtr, setModalAtr] = useState<any>(null);
  const [atrEquipeSel, setAtrEquipeSel] = useState<string>("");
  const [atrTecnicoSel, setAtrTecnicoSel] = useState<string>("");

  if (!stats) return <div className="page-container">Carregando...</div>;

  const servicosVisiveis = filtro === "todos"
    ? servicos
    : (servicos ?? []).filter((s: any) => s.status === filtro);

  async function handleAtribuir(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const tecnicoId = (fd.get("tecnicoId") as string) || "";
    await atribuir({
      servicoId: modalAtr._id,
      equipeId: fd.get("equipeId") as any,
      tecnicoId: tecnicoId ? (tecnicoId as any) : undefined,
      dataAgendada: fd.get("dataAgendada") as string || undefined,
      observacao: fd.get("observacao") as string || undefined,
    });
    setModalAtr(null);
  }

  function openAtribuir(s: any) {
    setModalAtr(s);
    setAtrEquipeSel("");
    setAtrTecnicoSel("");
  }

  function openEdit(s: any) {
    setEditS(s);
    setEditForm({
      titulo: s.titulo,
      descricao: s.descricao ?? "",
      local: s.local,
      urgencia: s.urgencia,
    });
  }

  async function handleEditServico(e: React.FormEvent) {
    e.preventDefault();
    if (!editS) return;
    try {
      await editar({
        servicoId: editS._id,
        titulo: editForm.titulo,
        descricao: editForm.descricao,
        local: editForm.local,
        urgencia: editForm.urgencia as any,
      });
      setEditS(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleCancelar(s: any) {
    if (!confirm(`Cancelar o serviço "${s.titulo}"?`)) return;
    try { await cancelar({ servicoId: s._id }); }
    catch (e: any) { alert(e.message); }
  }

  async function handleExcluir(s: any) {
    if (!confirm(`⚠️ EXCLUIR PERMANENTEMENTE o serviço "${s.titulo}"?\n\nIsso não pode ser desfeito!`)) return;
    try { await excluir({ servicoId: s._id }); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ margin: 0 }}>📊 Dashboard — Gestão de Manutenção {isAdminMaster && <span style={{ fontSize: 14, marginLeft: 12, background: "#f6d700", color: "#003882", padding: "4px 10px", borderRadius: 12, fontWeight: 700 }}>👑 Admin Master</span>}</h1>
        <Link href="/gestor/relatorios" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          📈 Gerar Relatório
        </Link>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{stats.total}</div>
          <div className="label">Total de Solicitações</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "#92400e" }}>{stats.pendente}</div>
          <div className="label">Pendentes</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "#c2410c" }}>{stats.emAndamento}</div>
          <div className="label">Em Andamento</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "#c2410c" }}>{stats.pausado}</div>
          <div className="label">Pausados</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "#003882" }}>{stats.concluido}</div>
          <div className="label">Concluídos</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "#6b7280", fontSize: 24 }}>{stats.tempoMedioMin} min</div>
          <div className="label">Tempo Médio</div>
        </div>
      </div>

      {/* Por Equipe */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        {stats.equipes.map((eq: any) => {
          const s = stats.porEquipe[eq._id] ?? { total: 0, concluido: 0, emAndamento: 0, pausado: 0 };
          return (
            <div key={eq._id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{eq.nome}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Total: <strong>{s.total}</strong> &nbsp;
                Concluídos: <strong style={{ color: "#166534" }}>{s.concluido}</strong> &nbsp;
                Em Andamento: <strong style={{ color: "#c2410c" }}>{s.emAndamento}</strong> &nbsp;
                Pausados: <strong style={{ color: "#c2410c" }}>{s.pausado}</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["todos","pendente","aprovado","em_andamento","pausado","concluido","cancelado"].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`btn ${filtro === f ? "btn-primary" : "btn-outline"}`}
            style={{ fontSize: 13, padding: "5px 12px" }}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título / Solicitante</th>
              <th>Local</th>
              <th>Urgência</th>
              <th>Equipe</th>
              <th>Responsável</th>
              <th>Status</th>
              <th>Agendado / Início</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(servicosVisiveis ?? []).map((s: any) => {
              const equipe = stats.equipes.find((e: any) => e._id === s.equipeId);
              return (
                <tr key={s._id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {s._id.toString().slice(-6)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.titulo}</div>
                    {s.cadastroDireto && s.dadosSolicitante && (
                      <div style={{ fontSize: 11, background: "#eff6ff", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginTop: 2 }}>
                        👤 {s.dadosSolicitante.solicitanteGraduacao} {s.dadosSolicitante.solicitanteNomeDeGuerra} — {s.dadosSolicitante.solicitanteSecao}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {s.descricao?.slice(0, 60)}{s.descricao?.length > 60 ? "..." : ""}
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{s.local}</td>
                  <td>
                    <span className={`urgencia ${s.urgencia}`} style={{ textTransform: "uppercase", fontSize: 12 }}>
                      {s.urgencia}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{equipe?.nome ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>
                    {s.tecnicoId ? (() => {
                      const tec = (tecnicos ?? []).find((t: any) => t._id === s.tecnicoId);
                      return tec ? (
                        <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          👤 {tec.graduacao} {tec.nomeDeGuerra}
                        </span>
                      ) : <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>;
                    })() : (
                      <span style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic" }}>Qualquer um</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${s.status}`}>
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {s.dataAgendada ?? "—"}
                    {s.dataInicioExec && (
                      <div style={{ fontSize: 11, color: "#003882" }}>
                        🕐 {new Date(s.dataInicioExec).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      {s.status === "pendente" && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: "3px 8px" }}
                          onClick={() => openAtribuir(s)}
                        >
                          Atribuir
                        </button>
                      )}
                      {s.status === "pausado" && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: "3px 8px", background: "#c2410c" }}
                          onClick={() => openAtribuir(s)}
                        >
                          🔄 Transferir
                        </button>
                      )}
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => openEdit(s)}
                        title="Editar dados do serviço"
                      >
                        ✏️
                      </button>
                      {s.status !== "cancelado" && s.status !== "concluido" && (
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: "3px 8px", color: "#92400e", borderColor: "#fde68a" }}
                          onClick={() => handleCancelar(s)}
                          title="Cancelar (mantém no histórico)"
                        >
                          🚫
                        </button>
                      )}
                      {isAdminMaster && (
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: "4px 10px", background: "#dc2626", color: "#fff", border: "1px solid #dc2626" }}
                          onClick={() => handleExcluir(s)}
                          title="Excluir permanentemente (apenas Admin Master)"
                        >
                          🗑 Excluir
                        </button>
                      )}
                    </div>
                    {s.cadastroDireto && (
                      <span style={{ fontSize: 10, color: "#003882" }}>⚡direto</span>
                    )}
                    {s.motivoPausa && (
                      <div style={{ fontSize: 10, color: "#9a3412", marginTop: 2 }}>
                        ⏸ {s.motivoPausa}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {servicosVisiveis?.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
                  Nenhuma solicitação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Atribuir */}
      {modalAtr && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 440, width: "100%" }}>
            <h3 style={{ marginBottom: 16 }}>
              {modalAtr.status === "pausado" ? "🔄 Transferir Serviço Pausado" : "Atribuir Serviço"}
            </h3>
            {modalAtr.status === "pausado" && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#9a3412" }}>
                ⏸ Motivo da pausa: <strong>{modalAtr.motivoPausa ?? "Não informado"}</strong>
                <br />O serviço será transferido para a nova equipe assumir.
              </div>
            )}
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
              <strong>{modalAtr.titulo}</strong><br />{modalAtr.local}
            </p>

            {/* Equipes com técnicos disponíveis */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#003882" }}>
                👥 Técnicos por Equipe (visão rápida)
              </div>
              {(tecnicos ?? []).filter((t: any) => t.ativo && (t.status === "ativo" || !t.status)).reduce<any[]>((acc, t) => {
                const eq = stats.equipes.find((e: any) => e._id === t.equipeId);
                return [...acc, { tecnico: t, equipe: eq }];
              }, []).map((item: any) => (
                <div key={item.tecnico._id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <strong>{item.equipe?.nome}</strong> — {item.tecnico.graduacao} {item.tecnico.nomeDeGuerra}
                </div>
              ))}
            </div>

            <form onSubmit={handleAtribuir}>
              <div className="form-group">
                <label>Equipe</label>
                <select
                  name="equipeId"
                  required
                  value={atrEquipeSel}
                  onChange={(e) => {
                    setAtrEquipeSel(e.target.value);
                    setAtrTecnicoSel(""); // reset técnico se mudar equipe
                  }}
                >
                  <option value="">Selecione...</option>
                  {(equipes ?? []).map((eq: any) => (
                    <option key={eq._id} value={eq._id}>{eq.nome}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>
                  Quem vai executar? <span style={{ color: "#6b7280", fontSize: 12 }}>(opcional)</span>
                </label>
                {!atrEquipeSel ? (
                  <div style={{
                    padding: "10px 12px",
                    background: "#f1f5f9", color: "#6b7280",
                    borderRadius: 6, fontSize: 13, fontStyle: "italic"
                  }}>
                    ⬆️ Selecione a equipe primeiro
                  </div>
                ) : (
                  <>
                    <select
                      name="tecnicoId"
                      value={atrTecnicoSel}
                      onChange={(e) => setAtrTecnicoSel(e.target.value)}
                    >
                      <option value="">👥 Ambos (qualquer um da equipe pode pegar)</option>
                      {(tecnicos ?? [])
                        .filter((t: any) =>
                          t.equipeId === atrEquipeSel &&
                          t.ativo &&
                          (t.status === "ativo" || !t.status)
                        )
                        .map((t: any) => (
                          <option key={t._id} value={t._id}>
                            👤 {t.graduacao} {t.nomeDeGuerra}
                          </option>
                        ))}
                    </select>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                      💡 "Ambos" = qualquer técnico ativo da equipe pega o serviço. Escolha um específico se for direcionar.
                    </div>
                  </>
                )}
              </div>
              <div className="form-group">
                <label>Data Agendada</label>
                <input type="date" name="dataAgendada" />
              </div>
              <div className="form-group">
                <label>Observação</label>
                <textarea name="observacao" rows={2} placeholder="Ex: Aguardar equipe disponível..." />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-success">Confirmar</button>
                <button type="button" className="btn btn-outline" onClick={() => setModalAtr(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {editS && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 480, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>✏️ Editar Serviço</h3>
              <button onClick={() => setEditS(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleEditServico}>
              <div className="form-group">
                <label>Título</label>
                <input
                  type="text"
                  value={editForm.titulo}
                  onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Local</label>
                <input
                  type="text"
                  value={editForm.local}
                  onChange={(e) => setEditForm({ ...editForm, local: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Urgência</label>
                <select
                  value={editForm.urgencia}
                  onChange={(e) => setEditForm({ ...editForm, urgencia: e.target.value })}
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  rows={3}
                  value={editForm.descricao}
                  onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary">💾 Salvar</button>
                <button type="button" className="btn btn-outline" onClick={() => setEditS(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

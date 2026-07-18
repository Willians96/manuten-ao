"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export default function GestorPage() {
  const stats = useQuery(api.mutations.dashboardStats);
  const servicos = useQuery(api.mutations.listServicos);
  const equipes = useQuery(api.mutations.listEquipes);
  const tecnicos = useQuery(api.mutations.listTecnicos);
  const atribuir = useMutation(api.mutations.atribuirServico);

  const [filtro, setFiltro] = useState("todos");
  const [modalAtr, setModalAtr] = useState<any>(null);

  if (!stats) return <div className="page-container">Carregando...</div>;

  const servicosVisiveis = filtro === "todos"
    ? servicos
    : (servicos ?? []).filter((s: any) => s.status === filtro);

  async function handleAtribuir(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await atribuir({
      servicoId: modalAtr._id,
      equipeId: fd.get("equipeId") as any,
      dataAgendada: fd.get("dataAgendada") as string || undefined,
      observacao: fd.get("observacao") as string || undefined,
    });
    setModalAtr(null);
  }

  return (
    <div className="page-container">
      <h1 className="page-title">📊 Dashboard — Gestão de Manutenção</h1>

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
          <div className="value" style={{ color: "#166534" }}>{stats.emAndamento}</div>
          <div className="label">Em Andamento</div>
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
          const s = stats.porEquipe[eq._id] ?? { total: 0, concluido: 0, emAndamento: 0 };
          return (
            <div key={eq._id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{eq.nome}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Total: <strong>{s.total}</strong> &nbsp;
                Concluídos: <strong style={{ color: "#166534" }}>{s.concluido}</strong> &nbsp;
                Em Andamento: <strong style={{ color: "#92400e" }}>{s.emAndamento}</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["todos","pendente","aprovado","em_andamento","concluido","cancelado"].map((f) => (
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
                    {s.status === "pendente" && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => setModalAtr(s)}
                      >
                        Atribuir
                      </button>
                    )}
                    {s.cadastroDireto && (
                      <span style={{ fontSize: 11, color: "#003882" }}>⚡direto</span>
                    )}
                    {s.status !== "pendente" && !s.cadastroDireto && (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {servicosVisiveis?.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
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
            <h3 style={{ marginBottom: 16 }}>Atribuir Serviço</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
              <strong>{modalAtr.titulo}</strong><br />{modalAtr.local}
            </p>

            {/* Equipes com técnicos disponíveis */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#003882" }}>
                👥 Técnicos por Equipe (visão rápida)
              </div>
              {(tecnicos ?? []).reduce((acc: any[], t: any) => {
                const eq = stats.equipes.find((e: any) => e._id === t.equipeId);
                acc.push({ tecnico: t, equipe: eq });
                return acc;
              }, [] as any[]).forEach((item: any) => (
                <div key={item.tecnico._id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <strong>{item.equipe?.nome}</strong> — {item.tecnico.nomeDeGuerra} ({item.tecnico.graduacao})
                </div>
              ))}
            </div>

            <form onSubmit={handleAtribuir}>
              <div className="form-group">
                <label>Equipe</label>
                <select name="equipeId" required>
                  <option value="">Selecione...</option>
                  {(equipes ?? []).map((eq: any) => (
                    <option key={eq._id} value={eq._id}>{eq.nome}</option>
                  ))}
                </select>
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
    </div>
  );
}

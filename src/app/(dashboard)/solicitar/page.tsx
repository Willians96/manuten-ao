"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { RoleGuard } from "../../../components/RoleGuard";

export const dynamic = "force-dynamic";

export default function SolicitarPage() {
  return (
    <RoleGuard allow={["solicitante", "gestor", "admin"]}>
      <SolicitarPageContent />
    </RoleGuard>
  );
}

function SolicitarPageContent() {
  const meusServicos = useQuery(api.mutations.listServicos, {});
  const criar = useMutation(api.mutations.criarServico);

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [urgencia, setUrgencia] = useState("media");
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await criar({ titulo, descricao, local, urgencia: urgencia as any });
    setTitulo(""); setDescricao(""); setLocal(""); setUrgencia("media");
    setEnviado(true);
    setTimeout(() => setEnviado(false), 3000);
  }

  return (
    <div className="page-container">
      <h1 className="page-title">📝 Solicitar Serviço de Manutenção</h1>

      {/* Formulário */}
      <div className="card" style={{ marginBottom: 24 }}>
        {enviado && (
          <div style={{
            background: "#d1fae5", color: "#065f46",
            padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14
          }}>
            ✅ Solicitação enviada com sucesso! Aguarde a análise do gestor.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Título do Serviço *</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Cano com vazamento no banheiro"
              required
            />
          </div>
          <div className="form-group">
            <label>Local *</label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex: Banheiro 2º andar, Ala B, próximo ao expurgo"
              required
            />
          </div>
          <div className="form-group">
            <label>Urgência *</label>
            <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} required>
              <option value="baixa">Baixa — pode esperar alguns dias</option>
              <option value="media">Média — necesita atenção breve</option>
              <option value="alta">Alta — prejudica o funcionamento</option>
              <option value="critica">Crítica — risco, segurança ou paralisação</option>
            </select>
          </div>
          <div className="form-group">
            <label>Descrição detalhada *</label>
            <textarea
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o problema com o máximo de detalhes possível..."
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            📨 Enviar Solicitação
          </button>
        </form>
      </div>

      {/* Minhas Solicitações */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📋 Minhas Solicitações</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Local</th>
              <th>Urgência</th>
              <th>Status</th>
              <th>Data Agendada</th>
              <th>Equipe</th>
            </tr>
          </thead>
          <tbody>
            {(meusServicos ?? []).map((s: any) => (
              <tr key={s._id}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {s._id.toString().slice(-6)}
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{s.titulo}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {s.descricao.slice(0, 50)}{s.descricao.length > 50 ? "..." : ""}
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>{s.local}</td>
                <td>
                  <span className={`urgencia ${s.urgencia}`} style={{ textTransform: "uppercase", fontSize: 12 }}>
                    {s.urgencia}
                  </span>
                </td>
                <td>
                  <span className={`badge ${s.status}`}>
                    {s.status.replace("_", " ")}
                  </span>
                </td>
                <td style={{ fontSize: 13 }}>{s.dataAgendada ?? "—"}</td>
                <td style={{ fontSize: 13 }}>{s.equipeId ? "Sim" : "—"}</td>
              </tr>
            ))}
            {meusServicos?.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
                  Nenhuma solicitação ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

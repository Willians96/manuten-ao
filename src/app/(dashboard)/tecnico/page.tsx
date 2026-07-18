"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export default function TecnicoPage() {
  const servicos = useQuery(api.mutations.listServicos);
  const equipes = useQuery(api.mutations.listEquipes);
  const iniciar = useMutation(api.mutations.iniciarServico);
  const encerrar = useMutation(api.mutations.encerrarServico);
  const criarDireto = useMutation(api.mutations.criarServicoDireto);

  const [encerrarObs, setEncerrarObs] = useState<string | null>(null);
  const [showCadastroRapido, setShowCadastroRapido] = useState(false);

  // Campos do cadastro rápido
  const [cr, setCr] = useState({
    titulo: "",
    descricao: "",
    local: "",
    urgencia: "media",
    solicitanteNome: "",
    solicitanteGraduacao: "",
    solicitanteNomeDeGuerra: "",
    solicitanteRe: "",
    solicitanteSecao: "",
    dataInicioExec: "",
    dataFimExec: "",
  });

  const emAndamento = (servicos ?? []).filter((s: any) => s.status === "em_andamento");
  const aguardando = (servicos ?? []).filter((s: any) => s.status === "aprovado");

  async function handleIniciar(servicoId: any) {
    try { await iniciar({ servicoId }); }
    catch (e: any) { alert(e.message); }
  }

  async function handleEncerrar(servicoId: any, obs: string) {
    try {
      await encerrar({ servicoId, observacao: obs || undefined });
      setEncerrarObs(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleCadastroDireto(e: React.FormEvent) {
    e.preventDefault();
    try {
      await criarDireto({
        titulo: cr.titulo,
        descricao: cr.descricao,
        local: cr.local,
        urgencia: cr.urgencia as any,
        solicitanteNome: cr.solicitanteNome,
        solicitanteGraduacao: cr.solicitanteGraduacao,
        solicitanteNomeDeGuerra: cr.solicitanteNomeDeGuerra,
        solicitanteRe: cr.solicitanteRe,
        solicitanteSecao: cr.solicitanteSecao,
        dataInicioExec: cr.dataInicioExec || undefined,
        dataFimExec: cr.dataFimExec || undefined,
      });
      setShowCadastroRapido(false);
      setCr({
        titulo: "", descricao: "", local: "", urgencia: "media",
        solicitanteNome: "", solicitanteGraduacao: "", solicitanteNomeDeGuerra: "",
        solicitanteRe: "", solicitanteSecao: "",
        dataInicioExec: "", dataFimExec: "",
      });
    } catch (e: any) { alert(e.message); }
  }

  const set = (field: string) => (e: any) =>
    setCr((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔧 Painel do Técnico</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCadastroRapido(!showCadastroRapido)}
        >
          {showCadastroRapido ? "✖ Fechar" : "⚡ Cadastro Rápido"}
        </button>
      </div>

      {/* ── Cadastro Rápido ─────────────────────────────────────────────── */}
      {showCadastroRapido && (
        <div className="card" style={{ marginBottom: 24, border: "2px solid #003882" }}>
          <div style={{
            background: "#003882", color: "#fff",
            padding: "10px 16px", borderRadius: "8px 8px 0 0",
            fontWeight: 700, fontSize: 14, marginBottom: 16
          }}>
            ⚡ Cadastro Rápido — preencha os dados do solicitante + serviço
          </div>

          <form onSubmit={handleCadastroDireto}>
            {/* Dados do Solicitante */}
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#003882" }}>
                👤 Dados do Solicitante
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Graduação</label>
                  <select value={cr.solicitanteGraduacao} onChange={set("solicitanteGraduacao")} required>
                    <option value="">Selecione...</option>
                    {["Cel","Ten Cel","Maj","Cap","1º Ten","2º Ten","ST","Cb","3º Sgt","2º Sgt","1º Sgt","Sd","Aluno","Civil"].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nome de Guerra</label>
                  <input type="text" value={cr.solicitanteNomeDeGuerra} onChange={set("solicitanteNomeDeGuerra")} placeholder="Ex: SILVA" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>RE</label>
                  <input type="text" value={cr.solicitanteRe} onChange={set("solicitanteRe")} placeholder="Ex: 123.456-7" required />
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  <label>Seção / Local</label>
                  <input type="text" value={cr.solicitanteSecao} onChange={set("solicitanteSecao")} placeholder="Ex: Almoxarifado, Administrativo..." required />
                </div>
              </div>
            </div>

            {/* Dados do Serviço */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label>Título do Serviço *</label>
                <input type="text" value={cr.titulo} onChange={set("titulo")} placeholder="Ex: Troca de torneira" required />
              </div>
              <div className="form-group">
                <label>Local *</label>
                <input type="text" value={cr.local} onChange={set("local")} placeholder="Ex: Banheiro 2º andar, Ala B" required />
              </div>
              <div className="form-group">
                <label>Urgência</label>
                <select value={cr.urgencia} onChange={set("urgencia")}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input type="text" value={cr.descricao} onChange={set("descricao")} placeholder="Detalhes do serviço..." />
              </div>
            </div>

            {/* Datas de Execução */}
            <div style={{
              background: "#fffbeb", border: "1px solid #fde68a",
              padding: 16, borderRadius: 8, marginTop: 16
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#92400e" }}>
                ⏱ Datas de Execução (opcional — preencha se já executou)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Início da Execução</label>
                  <input type="datetime-local" value={cr.dataInicioExec} onChange={set("dataInicioExec")} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Término da Execução</label>
                  <input type="datetime-local" value={cr.dataFimExec} onChange={set("dataFimExec")} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>
                💡 Se preencher <strong>término</strong>, o serviço já nasce como <strong>concluído</strong>.
                Se preencher só <strong>início</strong>, fica como <strong>em andamento</strong> e você encerra depois.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn-success">
                💾 Salvar Serviço
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowCadastroRapido(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Em Andamento ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#dc2626" }}>
          🔴 Em Andamento ({emAndamento.length})
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {emAndamento.map((s: any) => {
            const equipe = (equipes ?? []).find((e: any) => e._id === s.equipeId);
            return (
              <ServicoCard
                key={s._id}
                servico={s}
                equipe={equipe}
                encerrarObs={encerrarObs}
                setEncerrarObs={setEncerrarObs}
                onEncerrar={handleEncerrar}
                showCadastroDireto={false}
              />
            );
          })}
          {emAndamento.length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum serviço em andamento.</p>
          )}
        </div>
      </div>

      {/* ── Aguardando ──────────────────────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#1e40af" }}>
          📋 Aguardando Execução ({aguardando.length})
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {aguardando.map((s: any) => {
            const equipe = (equipes ?? []).find((e: any) => e._id === s.equipeId);
            return (
              <ServicoCard
                key={s._id}
                servico={s}
                equipe={equipe}
                encerrarObs={encerrarObs}
                setEncerrarObs={setEncerrarObs}
                onEncerrar={handleEncerrar}
                onIniciar={handleIniciar}
                showCadastroDireto={false}
              />
            );
          })}
          {aguardando.length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum serviço aguardando execução.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componente: Card de Serviço ──────────────────────────────────────
function ServicoCard({ servico: s, equipe, encerrarObs, setEncerrarObs, onEncerrar, onIniciar, showCadastroDireto }: any) {
  const borderColor = s.status === "em_andamento" ? "#e30613" : "#1e40af";
  const badgeClass = s.status === "em_andamento" ? "em_andamento" : "aprovado";

  return (
    <div className="card" style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{s.titulo}</div>
          {s.cadastroDireto && s.dadosSolicitante && (
            <div style={{ fontSize: 12, background: "#eff6ff", padding: "4px 8px", borderRadius: 4, marginBottom: 6, display: "inline-block" }}>
              👤 {s.dadosSolicitante.solicitanteGraduacao} {s.dadosSolicitante.solicitanteNomeDeGuerra} — {s.dadosSolicitante.solicitanteSecao}
            </div>
          )}
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            📍 {s.local} &nbsp;|&nbsp; Urgência: <span className={`urgencia ${s.urgencia}`}>{s.urgencia}</span>
          </div>
          {s.descricao && (
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.descricao}</div>
          )}
          {s.dataInicioExec && (
            <div style={{ fontSize: 13, color: "#003882", marginTop: 6 }}>
              🕐 Início: {new Date(s.dataInicioExec).toLocaleString("pt-BR")}
            </div>
          )}
          {s.dataFimExec && (
            <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>
              ✅ Término: {new Date(s.dataFimExec).toLocaleString("pt-BR")}
            </div>
          )}
          {s.observacaoGestor && (
            <div style={{ fontSize: 12, background: "#fef9c3", padding: "6px 10px", borderRadius: 6, marginTop: 8 }}>
              📝 {s.observacaoGestor}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span className={`badge ${badgeClass}`}>{s.status.replace("_", " ")}</span>
          {s.status === "aprovado" && onIniciar && (
            <button className="btn btn-primary" style={{ fontSize: 13, padding: "6px 14px", whiteSpace: "nowrap" }}
              onClick={() => onIniciar(s._id)}>
              ▶️ Começar
            </button>
          )}
          {s.status === "em_andamento" && (
            <button className="btn btn-success" style={{ fontSize: 13, padding: "6px 14px", whiteSpace: "nowrap" }}
              onClick={() => setEncerrarObs(s._id)}>
              ✅ Encerrar
            </button>
          )}
        </div>
      </div>

      {/* Modal encerramento */}
      {encerrarObs === s._id && (
        <div style={{ marginTop: 12, padding: 16, background: "#f8fafc", borderRadius: 8 }}>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>Observação (opcional)</label>
            <textarea id={`obs-${s._id}`} rows={2} placeholder="Descreva o que foi feito..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-success" onClick={() => {
              const ta = document.getElementById(`obs-${s._id}`) as HTMLTextAreaElement;
              onEncerrar(s._id, ta?.value ?? "");
            }}>
              Confirmar Encerramento
            </button>
            <button className="btn btn-outline" onClick={() => setEncerrarObs(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

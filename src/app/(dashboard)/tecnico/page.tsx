"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export default function TecnicoPage() {
  const servicos = useQuery(api.mutations.listServicos);
  const equipes = useQuery(api.mutations.listEquipes);
  const iniciar = useMutation(api.mutations.iniciarServico);
  const encerrar = useMutation(api.mutations.encerrarServico);
  const pausar = useMutation(api.mutations.pausarServico);
  const retomar = useMutation(api.mutations.retomarServico);
  const criarDireto = useMutation(api.mutations.criarServicoDireto);

  const [encerrarObs, setEncerrarObs] = useState<string | null>(null);
  const [pausarServ, setPausarServ] = useState<string | null>(null);
  const [motivoPausa, setMotivoPausa] = useState("");
  const [showCadastroRapido, setShowCadastroRapido] = useState(false);

  const [cr, setCr] = useState({
    titulo: "", descricao: "", local: "", urgencia: "media",
    solicitanteNome: "", solicitanteGraduacao: "", solicitanteNomeDeGuerra: "",
    solicitanteRe: "", solicitanteSecao: "",
    dataInicioExec: "", dataFimExec: "",
  });

  const emAndamento = (servicos ?? []).filter((s: any) => s.status === "em_andamento");
  const aguardando = (servicos ?? []).filter((s: any) => s.status === "aprovado");
  const pausados = (servicos ?? []).filter((s: any) => s.status === "pausado");

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

  async function handlePausar(servicoId: any) {
    if (!motivoPausa.trim()) { alert("Informe o motivo da pausa."); return; }
    try {
      await pausar({ servicoId, motivo: motivoPausa });
      setPausarServ(null);
      setMotivoPausa("");
    } catch (e: any) { alert(e.message); }
  }

  async function handleRetomar(servicoId: any) {
    try { await retomar({ servicoId }); }
    catch (e: any) { alert(e.message); }
  }

  async function handleCadastroDireto(e: React.FormEvent) {
    e.preventDefault();
    try {
      await criarDireto({
        titulo: cr.titulo, descricao: cr.descricao, local: cr.local,
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
      setCr({ titulo: "", descricao: "", local: "", urgencia: "media",
        solicitanteNome: "", solicitanteGraduacao: "", solicitanteNomeDeGuerra: "",
        solicitanteRe: "", solicitanteSecao: "",
        dataInicioExec: "", dataFimExec: "" });
    } catch (e: any) { alert(e.message); }
  }

  const set = (field: string) => (e: any) =>
    setCr((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔧 Painel do Técnico</h1>
        <button className="btn btn-primary" onClick={() => setShowCadastroRapido(!showCadastroRapido)}>
          {showCadastroRapido ? "✖ Fechar" : "⚡ Cadastro Rápido"}
        </button>
      </div>

      {/* ── Cadastro Rápido ─────────────────────────────────────────────── */}
      {showCadastroRapido && (
        <div className="card" style={{ marginBottom: 24, border: "2px solid #003882" }}>
          <div style={{ background: "#003882", color: "#fff", padding: "10px 16px", borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            ⚡ Cadastro Rápido — preencha os dados do solicitante + serviço
          </div>
          <form onSubmit={handleCadastroDireto}>
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#003882" }}>👤 Dados do Solicitante</div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label>Título do Serviço *</label><input type="text" value={cr.titulo} onChange={set("titulo")} placeholder="Ex: Troca de torneira" required /></div>
              <div className="form-group"><label>Local *</label><input type="text" value={cr.local} onChange={set("local")} placeholder="Ex: Banheiro 2º andar, Ala B" required /></div>
              <div className="form-group"><label>Urgência</label><select value={cr.urgencia} onChange={set("urgencia")}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
              <div className="form-group"><label>Descrição</label><input type="text" value={cr.descricao} onChange={set("descricao")} placeholder="Detalhes do serviço..." /></div>
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: 16, borderRadius: 8, marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#92400e" }}>⏱ Datas de Execução (opcional)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}><label>Início</label><input type="datetime-local" value={cr.dataInicioExec} onChange={set("dataInicioExec")} /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Término</label><input type="datetime-local" value={cr.dataFimExec} onChange={set("dataFimExec")} /></div>
              </div>
              <p style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>💡 Se preencher <strong>término</strong>, o serviço já nasce como <strong>concluído</strong>.</p>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn-success">💾 Salvar Serviço</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowCadastroRapido(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Pausados ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#c2410c" }}>
          ⏸ Pausados ({pausados.length})
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {pausados.map((s: any) => (
            <div key={s._id} className="card" style={{ borderLeft: "4px solid #c2410c", background: "#fff7ed" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.titulo}</div>
                  {s.cadastroDireto && s.dadosSolicitante && (
                    <div style={{ fontSize: 12, background: "#eff6ff", padding: "2px 8px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
                      👤 {s.dadosSolicitante.solicitanteGraduacao} {s.dadosSolicitante.solicitanteNomeDeGuerra}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>📍 {s.local}</div>
                  {s.motivoPausa && (
                    <div style={{ fontSize: 12, background: "#fed7aa", padding: "6px 10px", borderRadius: 6, marginTop: 8, color: "#9a3412" }}>
                      ⏸ Motivo: {s.motivoPausa}
                    </div>
                  )}
                  {s.pausadoEm && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      Pausado em: {new Date(s.pausadoEm).toLocaleString("pt-BR")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <span className="badge" style={{ background: "#fed7aa", color: "#9a3412" }}>Pausado</span>
                  <button className="btn btn-success" style={{ fontSize: 13, padding: "6px 14px", whiteSpace: "nowrap" }}
                    onClick={() => handleRetomar(s._id)}>
                    ▶️ Retomar
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
                    onClick={() => { setEncerrarObs(s._id); }}>
                    ✅ Encerrar
                  </button>
                </div>
              </div>
            </div>
          ))}
          {pausados.length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum serviço pausado.</p>
          )}
        </div>
      </div>

      {/* ── Em Andamento ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#dc2626" }}>
          🔴 Em Andamento ({emAndamento.length})
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {emAndamento.map((s: any) => (
            <ServicoCard
              key={s._id}
              servico={s}
              onIniciar={handleIniciar}
              onEncerrar={(id) => setEncerrarObs(id)}
              onPausar={(id) => setPausarServ(id)}
              showPausar
            />
          ))}
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
          {aguardando.map((s: any) => (
            <ServicoCard key={s._id} servico={s} onIniciar={handleIniciar} />
          ))}
          {aguardando.length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum serviço aguardando execução.</p>
          )}
        </div>
      </div>

      {/* ── Modal Encerrar ─────────────────────────────────────────────── */}
      {encerrarObs && (
        <Modal title="Encerrar Serviço" onClose={() => setEncerrarObs(null)}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Observação (opcional)</label>
            <textarea id="obs-modal" rows={3} placeholder="Descreva o que foi feito..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-success" onClick={() => {
              const ta = document.getElementById("obs-modal") as HTMLTextAreaElement;
              handleEncerrar(encerrarObs, ta?.value ?? "");
            }}>Confirmar</button>
            <button className="btn btn-outline" onClick={() => setEncerrarObs(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* ── Modal Pausar ───────────────────────────────────────────────── */}
      {pausarServ && (
        <Modal title="⏸ Pausar Serviço" onClose={() => { setPausarServ(null); setMotivoPausa(""); }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Informe o motivo da pausa. O gestor pode transferir este serviço para outra equipe.
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Motivo da pausa *</label>
            <textarea
              rows={3}
              value={motivoPausa}
              onChange={(e) => setMotivoPausa(e.target.value)}
              placeholder="Ex: Aguardando peça, outra demanda urgente..."
              required
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => handlePausar(pausarServ)}>Pausar</button>
            <button className="btn btn-outline" onClick={() => { setPausarServ(null); setMotivoPausa(""); }}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Card genérico ─────────────────────────────────────────────────────────
function ServicoCard({ servico: s, onIniciar, onEncerrar, onPausar, showPausar }: any) {
  const borderColor = s.status === "em_andamento" ? "#e30613" : "#1e40af";
  return (
    <div className="card" style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{s.titulo}</div>
          {s.cadastroDireto && s.dadosSolicitante && (
            <div style={{ fontSize: 12, background: "#eff6ff", padding: "2px 8px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
              👤 {s.dadosSolicitante.solicitanteGraduacao} {s.dadosSolicitante.solicitanteNomeDeGuerra}
            </div>
          )}
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            📍 {s.local} &nbsp;|&nbsp; Urgência: <span className={`urgencia ${s.urgencia}`}>{s.urgencia}</span>
          </div>
          {s.descricao && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.descricao}</div>}
          {s.dataInicioExec && <div style={{ fontSize: 13, color: "#003882", marginTop: 6 }}>🕐 Início: {new Date(s.dataInicioExec).toLocaleString("pt-BR")}</div>}
          {s.dataFimExec && <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>✅ Término: {new Date(s.dataFimExec).toLocaleString("pt-BR")}</div>}
          {s.observacaoGestor && <div style={{ fontSize: 12, background: "#fef9c3", padding: "6px 10px", borderRadius: 6, marginTop: 8 }}>📝 {s.observacaoGestor}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span className={`badge ${s.status}`}>{s.status.replace("_", " ")}</span>
          {s.status === "aprovado" && onIniciar && (
            <button className="btn btn-primary" style={{ fontSize: 13, padding: "6px 14px", whiteSpace: "nowrap" }} onClick={() => onIniciar(s._id)}>
              ▶️ Começar
            </button>
          )}
          {s.status === "em_andamento" && (
            <>
              <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px", whiteSpace: "nowrap" }}
                onClick={() => onPausar?.(s._id)}>
                ⏸ Pausar
              </button>
              <button className="btn btn-success" style={{ fontSize: 13, padding: "6px 14px", whiteSpace: "nowrap" }}
                onClick={() => onEncerrar?.(s._id)}>
                ✅ Encerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal genérico ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div className="card" style={{ maxWidth: 440, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

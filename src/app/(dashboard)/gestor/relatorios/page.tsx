"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useMemo } from "react";

export const dynamic = "force-dynamic";

export default function RelatoriosPage() {
  const stats = useQuery(api.mutations.dashboardStats);
  const servicos = useQuery(api.mutations.listServicos, {});
  const equipes = useQuery(api.mutations.listEquipes);
  const tecnicos = useQuery(api.mutations.listTecnicos, {});

  // Cálculos adicionais
  const relatorio = useMemo(() => {
    if (!servicos || !equipes || !tecnicos || !stats) return null;

    // Serviços por mês (últimos 6)
    const agora = new Date();
    const meses: { label: string; total: number; concluido: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const prox = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
      const noMes = servicos.filter((s: any) => {
        const t = s._creationTime;
        return t >= d.getTime() && t < prox.getTime();
      });
      meses.push({
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        total: noMes.length,
        concluido: noMes.filter((s: any) => s.status === "concluido").length,
      });
    }

    // Serviços por técnico
    const porTecnico: { nome: string; total: number; concluido: number; duracaoMedia: number }[] = [];
    for (const t of tecnicos.filter((tc: any) => tc.ativo)) {
      const meus = servicos.filter((s: any) => s.tecnicoId === t._id);
      const concluidos = meus.filter((s: any) => s.status === "concluido");
      // Calcula duração média (em minutos)
      let duracaoTotal = 0;
      let count = 0;
      for (const s of concluidos) {
        if (s.dataInicioExec && s.dataFimExec) {
          const inicio = new Date(s.dataInicioExec).getTime();
          const fim = new Date(s.dataFimExec).getTime();
          duracaoTotal += (fim - inicio) / 60000;
          count++;
        }
      }
      porTecnico.push({
        nome: t.nomeDeGuerra,
        total: meus.length,
        concluido: concluidos.length,
        duracaoMedia: count > 0 ? Math.round(duracaoTotal / count) : 0,
      });
    }

    // Serviços por local
    const porLocal: Record<string, number> = {};
    for (const s of servicos) {
      const local = (s as any).local || "(sem local)";
      porLocal[local] = (porLocal[local] || 0) + 1;
    }
    const locaisOrdenados = Object.entries(porLocal)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return { meses, porTecnico, locaisOrdenados };
  }, [stats, servicos, equipes, tecnicos]);

  function exportCSV() {
    if (!servicos) return;
    const rows = [
      ["ID", "Título", "Local", "Urgência", "Status", "Equipe", "Cadastro", "Início Exec", "Fim Exec"],
      ...servicos.map((s: any) => [
        s._id.toString().slice(-6),
        s.titulo,
        s.local,
        s.urgencia,
        s.status,
        s.equipeId ? (equipeNome(s.equipeId)) : "",
        new Date(s._creationTime).toLocaleString("pt-BR"),
        s.dataInicioExec ?? "",
        s.dataFimExec ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-manutencao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function equipeNome(equipeId: string): string {
    return (equipes ?? []).find((e: any) => e._id === equipeId)?.nome ?? "";
  }

  function printPage() {
    window.print();
  }

  if (!relatorio) {
    return <div className="page-container">Carregando...</div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>📊 Relatórios</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportCSV} className="btn btn-primary">📥 Exportar CSV</button>
          <button onClick={printPage} className="btn btn-outline">🖨 Imprimir</button>
        </div>
      </div>

      {/* Resumo Geral */}
      <div className="card" style={{ marginBottom: 24, pageBreakAfter: "always" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: "#003882" }}>📈 Resumo Geral</h2>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
          Gerado em {new Date().toLocaleString("pt-BR")}
        </p>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="value">{stats?.total ?? 0}</div>
            <div className="label">Total de Solicitações</div>
          </div>
          <div className="stat-card">
            <div className="value" style={{ color: "#92400e" }}>{stats?.pendente ?? 0}</div>
            <div className="label">Pendentes</div>
          </div>
          <div className="stat-card">
            <div className="value" style={{ color: "#c2410c" }}>{stats?.emAndamento ?? 0}</div>
            <div className="label">Em Andamento</div>
          </div>
          <div className="stat-card">
            <div className="value" style={{ color: "#c2410c" }}>{stats?.pausado ?? 0}</div>
            <div className="label">Pausados</div>
          </div>
          <div className="stat-card">
            <div className="value" style={{ color: "#003882" }}>{stats?.concluido ?? 0}</div>
            <div className="label">Concluídos</div>
          </div>
          <div className="stat-card">
            <div className="value" style={{ color: "#6b7280", fontSize: 20 }}>{stats?.tempoMedioMin ?? 0} min</div>
            <div className="label">Tempo Médio</div>
          </div>
        </div>
      </div>

      {/* Por Equipe */}
      <div className="card" style={{ marginBottom: 24, pageBreakAfter: "always" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: "#003882" }}>👥 Por Equipe</h2>
        <table>
          <thead>
            <tr>
              <th>Equipe</th>
              <th>Total</th>
              <th>Concluídos</th>
              <th>Em Andamento</th>
              <th>Pausados</th>
              <th>Taxa de Conclusão</th>
            </tr>
          </thead>
          <tbody>
            {(equipes ?? []).map((eq: any) => {
              const s = stats?.porEquipe?.[eq._id] ?? { total: 0, concluido: 0, emAndamento: 0, pausado: 0 };
              const taxa = s.total > 0 ? Math.round((s.concluido / s.total) * 100) : 0;
              return (
                <tr key={eq._id}>
                  <td><strong>{eq.nome}</strong></td>
                  <td>{s.total}</td>
                  <td style={{ color: "#166534" }}>{s.concluido}</td>
                  <td style={{ color: "#c2410c" }}>{s.emAndamento}</td>
                  <td style={{ color: "#c2410c" }}>{s.pausado}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, maxWidth: 120, height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${taxa}%`, height: "100%", background: taxa >= 80 ? "#16a34a" : taxa >= 50 ? "#f59e0b" : "#dc2626" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{taxa}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Por Técnico */}
      <div className="card" style={{ marginBottom: 24, pageBreakAfter: "always" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: "#003882" }}>🔧 Produtividade por Técnico</h2>
        <table>
          <thead>
            <tr>
              <th>Técnico</th>
              <th>Total Atribuído</th>
              <th>Concluídos</th>
              <th>Tempo Médio</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.porTecnico
              .filter((t) => t.total > 0)
              .sort((a, b) => b.concluido - a.concluido)
              .map((t) => (
                <tr key={t.nome}>
                  <td><strong>{t.nome}</strong></td>
                  <td>{t.total}</td>
                  <td style={{ color: "#166534" }}>{t.concluido}</td>
                  <td>{t.duracaoMedia > 0 ? `${t.duracaoMedia} min` : "—"}</td>
                </tr>
              ))}
            {relatorio.porTecnico.filter((t) => t.total > 0).length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>
                  Nenhum técnico atendeu serviços ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Histórico mensal */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: "#003882" }}>📅 Últimos 6 meses</h2>
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Solicitações</th>
              <th>Concluídos</th>
              <th>Taxa</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.meses.map((m) => (
              <tr key={m.label}>
                <td><strong>{m.label}</strong></td>
                <td>{m.total}</td>
                <td style={{ color: "#166534" }}>{m.concluido}</td>
                <td>{m.total > 0 ? Math.round((m.concluido / m.total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top Locais */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: "#003882" }}>📍 Top 10 Locais com mais Solicitações</h2>
        <table>
          <thead>
            <tr>
              <th>Local</th>
              <th>Solicitações</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.locaisOrdenados.map(([local, count]) => (
              <tr key={local}>
                <td>{local}</td>
                <td><strong>{count}</strong></td>
              </tr>
            ))}
            {relatorio.locaisOrdenados.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>
                  Nenhuma solicitação registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

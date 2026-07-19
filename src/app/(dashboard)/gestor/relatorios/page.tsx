"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useMemo } from "react";
import * as XLSX from "xlsx";

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

    // Serviços REALIZADOS (concluídos) por equipe com data
    const concluidos = servicos.filter((s: any) => s.status === "concluido");
    const porEquipeComData: {
      equipe: string;
      servicos: { titulo: string; data: string; tecnico: string; duracao: number; local: string }[];
    }[] = [];
    for (const eq of equipes) {
      const daEquipe = concluidos
        .filter((s: any) => s.equipeId === eq._id)
        .map((s: any) => {
          // pega o tecnico
          const tec = tecnicos.find((t: any) => t._id === s.tecnicoId);
          // calcula duracao
          let duracao = 0;
          if (s.dataInicioExec && s.dataFimExec) {
            const inicio = new Date(s.dataInicioExec).getTime();
            const fim = new Date(s.dataFimExec).getTime();
            duracao = Math.round((fim - inicio) / 60000);
          }
          // data: usa dataFimExec se existir, senao createdAt
          const dataRef = s.dataFimExec
            ? new Date(s.dataFimExec).toLocaleDateString("pt-BR")
            : new Date(s._creationTime).toLocaleDateString("pt-BR");
          return {
            titulo: s.titulo,
            data: dataRef,
            tecnico: tec?.nomeDeGuerra ?? "—",
            duracao,
            local: s.local,
          };
        })
        .sort((a: any, b: any) => {
          // converte data DD/MM/YYYY pra Date e compara
          const [da, ma, ya] = a.data.split("/").map(Number);
          const [db, mb, yb] = b.data.split("/").map(Number);
          return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
        });
      porEquipeComData.push({ equipe: eq.nome, servicos: daEquipe });
    }

    return { meses, porTecnico, locaisOrdenados, porEquipeComData };
  }, [stats, servicos, equipes, tecnicos]);

  function exportXLSX() {
    if (!servicos || !relatorio) return;
    const wb = XLSX.utils.book_new();

    // ── Aba 1: Resumo ──
    const resumoData = [
      ["Relatório de Manutenção — CPI-7"],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      [],
      ["Indicador", "Valor"],
      ["Total de Solicitações", stats?.total ?? 0],
      ["Pendentes", stats?.pendente ?? 0],
      ["Em Andamento", stats?.emAndamento ?? 0],
      ["Pausados", stats?.pausado ?? 0],
      ["Concluídos", stats?.concluido ?? 0],
      ["Tempo Médio (min)", stats?.tempoMedioMin ?? 0],
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
    wsResumo["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    // ── Aba 2: Por Equipe ──
    const porEquipeData: any[][] = [
      ["Equipe", "Total", "Concluídos", "Em Andamento", "Pausados", "Taxa de Conclusão (%)"],
    ];
    (equipes ?? []).forEach((eq: any) => {
      const s = stats?.porEquipe?.[eq._id] ?? { total: 0, concluido: 0, emAndamento: 0, pausado: 0 };
      const taxa = s.total > 0 ? Math.round((s.concluido / s.total) * 100) : 0;
      porEquipeData.push([eq.nome, s.total, s.concluido, s.emAndamento, s.pausado, taxa]);
    });
    const wsEquipe = XLSX.utils.aoa_to_sheet(porEquipeData);
    wsEquipe["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsEquipe, "Por Equipe");

    // ── Aba 3: Produtividade por Técnico ──
    const porTecnicoData: any[][] = [
      ["Técnico", "Total Atribuído", "Concluídos", "Tempo Médio (min)"],
    ];
    relatorio.porTecnico
      .filter((t) => t.total > 0)
      .sort((a, b) => b.concluido - a.concluido)
      .forEach((t) => {
        porTecnicoData.push([t.nome, t.total, t.concluido, t.duracaoMedia > 0 ? t.duracaoMedia : "—"]);
      });
    const wsTec = XLSX.utils.aoa_to_sheet(porTecnicoData);
    wsTec["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsTec, "Por Tecnico");

    // ── Aba 4: Serviços Realizados por Equipe (uma seção por equipe) ──
    relatorio.porEquipeComData.forEach((grupo) => {
      const data: any[][] = [
        [`SERVIÇOS REALIZADOS — ${grupo.equipe.toUpperCase()}`],
        [],
        ["Data", "Serviço", "Local", "Técnico", "Duração (min)"],
      ];
      if (grupo.servicos.length === 0) {
        data.push(["—", "Nenhum serviço concluído por esta equipe", "—", "—", "—"]);
      } else {
        grupo.servicos.forEach((s) => {
          data.push([s.data, s.titulo, s.local, s.tecnico, s.duracao > 0 ? s.duracao : "—"]);
        });
      }
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 25 }, { wch: 20 }, { wch: 14 }];
      const sheetName = grupo.equipe.replace(/[^\w]/g, "").slice(0, 28) || "Equipe";
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // ── Aba final: Todos os Serviços (lista completa) ──
    const todosData: any[][] = [
      ["ID", "Título", "Local", "Urgência", "Status", "Equipe", "Cadastro", "Início Exec", "Fim Exec"],
    ];
    servicos.forEach((s: any) => {
      todosData.push([
        s._id.toString().slice(-6),
        s.titulo,
        s.local,
        s.urgencia,
        s.status,
        s.equipeId ? equipeNome(s.equipeId) : "",
        new Date(s._creationTime).toLocaleString("pt-BR"),
        s.dataInicioExec ?? "",
        s.dataFimExec ?? "",
      ]);
    });
    const wsTodos = XLSX.utils.aoa_to_sheet(todosData);
    wsTodos["!cols"] = [{ wch: 8 }, { wch: 40 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsTodos, "Todos os Servicos");

    // Gera e baixa o arquivo
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-manutencao-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
          <button onClick={exportXLSX} className="btn btn-primary">📥 Exportar Excel</button>
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

      {/* Serviços Realizados por Equipe */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4, color: "#003882" }}>✅ Serviços Realizados por Equipe</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          Lista de todos os serviços concluídos, agrupados por equipe, com data e técnico responsável.
        </p>

        {relatorio.porEquipeComData.map((grupo) => (
          <div key={grupo.equipe} style={{ marginBottom: 20, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              background: "#003882", color: "#fff", padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <strong style={{ fontSize: 14 }}>👥 {grupo.equipe}</strong>
              <span style={{ fontSize: 12, background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 10 }}>
                {grupo.servicos.length} serviços
              </span>
            </div>
            {grupo.servicos.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                Nenhum serviço concluído por esta equipe ainda.
              </div>
            ) : (
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Data</th>
                    <th>Serviço</th>
                    <th>Local</th>
                    <th>Técnico</th>
                    <th style={{ width: 80 }}>Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.servicos.map((s, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 13 }}>{s.data}</td>
                      <td>{s.titulo}</td>
                      <td style={{ fontSize: 13 }}>{s.local}</td>
                      <td style={{ fontSize: 13 }}>{s.tecnico}</td>
                      <td style={{ fontSize: 13 }}>{s.duracao > 0 ? `${s.duracao} min` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {relatorio.porEquipeComData.every((g) => g.servicos.length === 0) && (
          <div style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>
            Nenhum serviço concluído ainda.
          </div>
        )}
      </div>
    </div>
  );
}

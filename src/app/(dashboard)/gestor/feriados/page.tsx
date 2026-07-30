"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";
import { RoleGuard } from "../../../../components/RoleGuard";

export const dynamic = "force-dynamic";

export default function FeriadosPage() {
  return (
    <RoleGuard allow={["gestor", "admin"]}>
      <FeriadosPageContent />
    </RoleGuard>
  );
}

function FeriadosPageContent() {
  const feriados = useQuery(api.mutations.listFeriados, {}) ?? [];
  const addFeriado = useMutation(api.mutations.addFeriado);
  const removeFeriado = useMutation(api.mutations.removeFeriado);

  const [showAdd, setShowAdd] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"nacional" | "estadual" | "municipal">("nacional");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addFeriado({ data: novaData, nome: novoNome, tipo: novoTipo });
      setNovaData("");
      setNovoNome("");
      setShowAdd(false);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleRemove(id: any) {
    if (!confirm("Remover este feriado?")) return;
    try {
      await removeFeriado({ id });
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Agrupa por ano
  const porAno: Record<string, any[]> = {};
  for (const f of feriados) {
    const ano = f.data.slice(0, 4);
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(f);
  }
  const anos = Object.keys(porAno).sort();

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>📅 Feriados</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)} style={{ whiteSpace: "nowrap" }}>
          {showAdd ? "✖ Fechar" : "➕ Adicionar Feriado"}
        </button>
      </div>

      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
        Feriados cadastrados são usados para detectar chamados <strong>extra</strong> (acionados emergencialmente na folga).
        Já vem preenchidos com os nacionais de 2026 e 2027.
      </p>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20, border: "2px solid #003882" }}>
          <div style={{ background: "#003882", color: "#fff", padding: "10px 16px", borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            ➕ Novo Feriado
          </div>
          <form onSubmit={handleAdd}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="form-grid">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Data</label>
                <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} required style={{ fontSize: 16, padding: "10px 12px" }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nome</label>
                <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Aniversário da cidade" required style={{ fontSize: 16, padding: "10px 12px" }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Tipo</label>
                <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as any)} style={{ fontSize: 16, padding: "10px 12px" }}>
                  <option value="nacional">Nacional</option>
                  <option value="estadual">Estadual</option>
                  <option value="municipal">Municipal</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary">💾 Salvar</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {anos.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          Nenhum feriado cadastrado.
        </div>
      ) : (
        anos.map((ano) => (
          <div key={ano} className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#003882", marginBottom: 12 }}>
              {ano}
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>Data</th>
                    <th>Nome</th>
                    <th style={{ width: 120 }}>Tipo</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {porAno[ano]
                    .sort((a, b) => a.data.localeCompare(b.data))
                    .map((f: any) => (
                      <tr key={f._id}>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                          {new Date(f.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })}
                        </td>
                        <td>{f.nome}</td>
                        <td>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: f.tipo === "nacional" ? "#dbeafe" : f.tipo === "estadual" ? "#fef3c7" : "#dcfce7",
                            color: f.tipo === "nacional" ? "#1e40af" : f.tipo === "estadual" ? "#92400e" : "#166534",
                          }}>
                            {f.tipo}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            onClick={() => handleRemove(f._id)}
                            title="Remover feriado"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

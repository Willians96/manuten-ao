"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export default function EquipesPage() {
  const equipes = useQuery(api.mutations.listEquipes);
  const tecnicos = useQuery(api.mutations.listTecnicos);
  const criarEquipe = useMutation(api.mutations.criarEquipe);
  const cadastrarTecnico = useMutation(api.mutations.cadastrarTecnico);

  const [novaEquipe, setNovaEquipe] = useState("");
  const [cadTecnico, setCadTecnico] = useState<{ equipeId: string; graduacao: string; nomeDeGuerra: string; re: string }>({
    equipeId: "", graduacao: "", nomeDeGuerra: "", re: ""
  });

  async function handleCriarEquipe(e: React.FormEvent) {
    e.preventDefault();
    if (!novaEquipe.trim()) return;
    await criarEquipe({ nome: novaEquipe.trim() });
    setNovaEquipe("");
  }

  async function handleCadastrarTecnico(e: React.FormEvent) {
    e.preventDefault();
    await cadastrarTecnico({
      equipeId: cadTecnico.equipeId as any,
      graduacao: cadTecnico.graduacao,
      nomeDeGuerra: cadTecnico.nomeDeGuerra,
      re: cadTecnico.re,
    });
    setCadTecnico({ equipeId: "", graduacao: "", nomeDeGuerra: "", re: "" });
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

      {/* Equipes e técnicos */}
      {(equipes ?? []).map((eq: any) => {
        const tecnicosEq = (tecnicos ?? []).filter((t: any) => t.equipeId === eq._id);
        return (
          <div key={eq._id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 16 }}>{eq.nome}</h3>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {tecnicosEq.length} técnico(s)
              </span>
            </div>

            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Graduação</th>
                  <th>Nome de Guerra</th>
                  <th>RE</th>
                </tr>
              </thead>
              <tbody>
                {tecnicosEq.map((t: any) => (
                  <tr key={t._id}>
                    <td>{t.graduacao}</td>
                    <td>{t.nomeDeGuerra}</td>
                    <td>{t.re}</td>
                  </tr>
                ))}
                {tecnicosEq.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                      Nenhum técnico nesta equipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Cadastrar técnico */}
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#003882", fontWeight: 500 }}>
                ➕ Cadastrar Técnico nesta Equipe
              </summary>
              <form onSubmit={handleCadastrarTecnico} style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="hidden" value={eq._id} onChange={(e) => setCadTecnico({ ...cadTecnico, equipeId: e.target.value })} />
                <div className="form-group">
                  <label>Equipe</label>
                  <select
                    value={cadTecnico.equipeId}
                    onChange={(e) => setCadTecnico({ ...cadTecnico, equipeId: e.target.value })}
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
                    value={cadTecnico.graduacao}
                    onChange={(e) => setCadTecnico({ ...cadTecnico, graduacao: e.target.value })}
                    required
                  >
                    <option value="">Selecione...</option>
                    {["Cb","ST","1º Sgt","2º Sgt","3º Sgt","Sd"].map((g) => (
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
                  <button type="submit" className="btn btn-success">Cadastrar</button>
                </div>
              </form>
            </details>
          </div>
        );
      })}

      {equipes?.length === 0 && (
        <p style={{ color: "#6b7280" }}>Nenhuma equipe criada ainda.</p>
      )}
    </div>
  );
}

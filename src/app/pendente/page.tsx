"use client";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PendentePage() {
  const { user, isLoaded } = useUser();
  const upsertUser = useMutation(api.mutations.upsertUser);
  const router = useRouter();

  const [graduacao, setGraduacao] = useState("");
  const [nomeDeGuerra, setNomeDeGuerra] = useState("");
  const [re, setRe] = useState("");
  const [secao, setSecao] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!isLoaded) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    await upsertUser({
      clerkId: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      name: user.fullName ?? user.firstName ?? "",
      graduacao,
      nomeDeGuerra,
      re,
      secao,
      role: "solicitante",
    });

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f6f9"
      }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: "#003882", marginBottom: 8 }}>Cadastro enviado!</h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Seu perfil foi enviado para aprovação.<br />
            Um gestor vai validar seus dados em breve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f6f9",
      padding: 16
    }}>
      <div className="card" style={{ maxWidth: 480, width: "100%" }}>
        <h2 style={{ color: "#003882", marginBottom: 4 }}>Complete seu perfil</h2>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
          Preencha os dados abaixo para solicitar serviços de manutenção.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Graduação</label>
            <select value={graduacao} onChange={(e) => setGraduacao(e.target.value)} required>
              <option value="">Selecione...</option>
              <option>Cel</option>
              <option>Ten Cel</option>
              <option>Maj</option>
              <option>Cap</option>
              <option>1º Ten</option>
              <option>2º Ten</option>
              <option>Asp</option>
              <option>ST</option>
              <option>Sd</option>
              <option>CB</option>
              <option>3º Sgt</option>
              <option>2º Sgt</option>
              <option>1º Sgt</option>
              <option>Aluno</option>
              <option>Civil</option>
            </select>
          </div>

          <div className="form-group">
            <label>Nome de Guerra</label>
            <input
              type="text"
              value={nomeDeGuerra}
              onChange={(e) => setNomeDeGuerra(e.target.value)}
              placeholder="Ex: WILSON"
              required
            />
          </div>

          <div className="form-group">
            <label>RE (Registro do Expediente)</label>
            <input
              type="text"
              value={re}
              onChange={(e) => setRe(e.target.value)}
              placeholder="Ex: 123.456-7"
              required
            />
          </div>

          <div className="form-group">
            <label>Seção / Local de Trabalho</label>
            <input
              type="text"
              value={secao}
              onChange={(e) => setSecao(e.target.value)}
              placeholder="Ex: Almoxarifado, TI, Administrativo..."
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            Enviar para aprovação
          </button>
        </form>
      </div>
    </div>
  );
}

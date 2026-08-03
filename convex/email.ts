"use node";
// convex/email.ts - Sistema de notificacao por email
// Usa Gmail SMTP via Nodemailer
// Chamado por mutations quando servico e criado ou atribuido

import { action } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";
import { api } from "./_generated/api";

const EMAIL_USER = process.env.EMAIL_USER || "michelwilliam@policiamilitar.sp.gov.br";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Manutenção CPI-7";
const EMAIL_SG = process.env.EMAIL_SG || "cpi7logistica@policiamilitar.sp.gov.br";
const EMAIL_TI = process.env.EMAIL_TI || "cpi7telematica@policiamilitar.sp.gov.br";

// Cache do transporter (singleton)
let transporter: any = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
  return transporter;
}

// Query interna: pegar servico por id
// Query interna: pegar user por id
// Action: envia email HTML simples
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    cc: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; messageId?: string }> => {
    if (!EMAIL_PASS) {
      console.warn("[email] EMAIL_PASS nao configurada, pulando envio");
      return { ok: false, error: "EMAIL_PASS nao configurada" };
    }
    try {
      const t = getTransporter();
      const info = await t.sendMail({
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
        to: args.to,
        cc: args.cc?.join(", "),
        subject: args.subject,
        html: args.html,
      });
      console.log("[email] enviado:", info.messageId);
      return { ok: true, messageId: info.messageId };
    } catch (e: any) {
      console.error("[email] erro:", e.message);
      return { ok: false, error: e.message };
    }
  },
});

// Action: envia email de NOVA SOLICITACAO para SG ou TI
export const sendNovaSolicitacaoEmail = action({
  args: {
    servicoId: v.id("servicos"),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; messageId?: string; to?: string }> => {
    const servico: any = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: args.servicoId });
    if (!servico) return { ok: false, error: "servico nao encontrado" };

    // Define destinatario baseado na modalidade
    const modalidade = servico.modalidade ?? "servicos_gerais";
    const emailDestino = modalidade === "informatica" ? EMAIL_TI : EMAIL_SG;
    const prefixo = modalidade === "informatica" ? "[TI]" : "[SG]";

    // Dados do solicitante
    let solNome = "Não identificado";
    let solSecao = "";
    let solRe = "";
    if (servico.solicitanteId) {
      const sol = await ctx.runQuery(api.mutations.findUserByIdPublic, { id: servico.solicitanteId });
      if (sol) {
        solNome = `${sol.graduacao ?? ""} ${sol.nomeDeGuerra ?? sol.name ?? ""}`.trim();
        solSecao = sol.secao ?? "";
        solRe = sol.re ?? "";
      }
    }

    const urgenciaLabel: Record<string, string> = {
      baixa: "🟢 Baixa",
      media: "🟡 Média",
      alta: "🟠 Alta",
      critica: "🔴 Crítica",
    };

    const dataHora = new Date(servico._creationTime).toLocaleString("pt-BR");
    const link = `https://manutencao-drab.vercel.app/gestor`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #003882; color: #fff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">${prefixo} Nova Solicitação de Serviço</h1>
      <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">Sistema Manutenção CPI-7</p>
    </div>

    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; width: 100px;"><strong>Título:</strong></td>
          <td style="padding: 6px 0;"><strong>${servico.titulo}</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;"><strong>Local:</strong></td>
          <td style="padding: 6px 0;">${servico.local}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;"><strong>Urgência:</strong></td>
          <td style="padding: 6px 0;">${urgenciaLabel[servico.urgencia] ?? servico.urgencia}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;"><strong>Solicitante:</strong></td>
          <td style="padding: 6px 0;">${solNome}${solSecao ? ` (${solSecao})` : ""}</td>
        </tr>
        ${solRe ? `<tr><td style="padding: 6px 0; color: #6b7280;"><strong>RE:</strong></td><td style="padding: 6px 0;">${solRe}</td></tr>` : ""}
        <tr>
          <td style="padding: 6px 0; color: #6b7280;"><strong>Data/Hora:</strong></td>
          <td style="padding: 6px 0;">${dataHora}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0 0; color: #6b7280;"><strong>Descrição:</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; border-left: 3px solid #003882; border-radius: 4px;">
            ${(servico.descricao || "(sem descrição)").replace(/\n/g, "<br>")}
          </td>
        </tr>
      </table>

      <div style="text-align: center; margin: 24px 0 0;">
        <a href="${link}" style="display: inline-block; background: #003882; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Ver no Sistema
        </a>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 12px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
      Policia Militar de São Paulo · CPI-7 · Sistema de Manutenção
    </div>
  </div>
</body>
</html>`;

    if (!EMAIL_PASS) {
      return { ok: false, error: "EMAIL_PASS nao configurada" };
    }
    try {
      const t = getTransporter();
      const info = await t.sendMail({
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
        to: emailDestino,
        subject: `${prefixo} ${servico.titulo} - ${urgenciaLabel[servico.urgencia] ?? servico.urgencia}`,
        html,
      });
      console.log("[email] nova solicitacao enviado:", info.messageId, "para", emailDestino);
      return { ok: true, messageId: info.messageId, to: emailDestino };
    } catch (e: any) {
      console.error("[email] erro nova solicitacao:", e.message);
      return { ok: false, error: e.message };
    }
  },
});

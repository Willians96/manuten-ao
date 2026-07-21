import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Users ──────────────────────────────────────────────────────────────
  // Perfil estendido do Clerk. 'approved' é false até gestor liberar.
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("solicitante"),
      v.literal("gestor"),
      v.literal("tecnico"),
      v.literal("admin")
    ),
    // preenchidos manualmente após login social
    graduacao: v.optional(v.string()),
    nomeDeGuerra: v.optional(v.string()),
    re: v.optional(v.string()),
    secao: v.optional(v.string()),
    approved: v.boolean(), // false = aguardando aprovação do gestor
    isAdminMaster: v.optional(v.boolean()), // true só pro primeiro admin do sistema
    fcmToken: v.optional(v.string()), // token Firebase Cloud Messaging pra push
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_approved", ["approved"]),

  // ── Equipes ───────────────────────────────────────────────────────────
  // Regime 12x36 — uma equipe trabalha, a outra descansa.
  equipes: defineTable({
    nome: v.string(), // "Equipe A" / "Equipe B"
    ativo: v.boolean(),
    createdAt: v.number(),
  }),

  // ── Técnicos ──────────────────────────────────────────────────────────
  // Cada policial vinculado a uma equipe.
  tecnicos: defineTable({
    userId: v.id("users"),
    equipeId: v.id("equipes"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
    ativo: v.boolean(),
    status: v.optional(
      v.union(
        v.literal("ativo"),
        v.literal("ferias"),
        v.literal("baixa")
      )
    ), // status de trabalho: ativo (default), ferias ou baixa
    createdAt: v.number(),
  })
    .index("by_equipe", ["equipeId"])
    .index("by_user", ["userId"]),

  // ── Solicitações de serviço ────────────────────────────────────────────
  servicos: defineTable({
    solicitanteId: v.id("users"),
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),           // "Banheiro 2º andar, Ala B"
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
    status: v.union(
      v.literal("pendente"),       // aguardando gestor aprovar
      v.literal("aprovado"),       // aprovado, aguardando execução
      v.literal("em_andamento"),   // técnico começou
      v.literal("pausado"),        // pausado, pode ser transferido
      v.literal("concluido"),      // encerrado
      v.literal("cancelado")
    ),
    // atribuído pelo gestor
    equipeId: v.optional(v.id("equipes")),
    tecnicoId: v.optional(v.id("tecnicos")),
    dataAgendada: v.optional(v.string()), // "2026-07-20"
    observacaoGestor: v.optional(v.string()),

    // ── Cadastro direto pelo técnico ─────────────────────────────────────
    // Quando técnico cadastra p/ um solicitante, guarda os dados aqui
    // (solicitante pode não ter login no sistema)
    cadastroDireto: v.optional(v.boolean()),
    dadosSolicitante: v.optional(v.object({
      nome: v.string(),
      graduacao: v.string(),
      nomeDeGuerra: v.string(),
      re: v.string(),
      secao: v.string(),
    })),
    // Datas de execução preenchidas pelo técnico no cadastro direto
    dataInicioExec: v.optional(v.string()), // "2026-07-18T14:00"
    dataFimExec: v.optional(v.string()),   // "2026-07-18T16:30"

    // Pausa
    motivoPausa: v.optional(v.string()),  // por que pausou
    pausadoEm: v.optional(v.number()),    // timestamp da pausa

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_equipe", ["equipeId"])
    .index("by_solicitante", ["solicitanteId"])
    .index("by_urgencia", ["urgencia"]),

  // ── Log de execução ────────────────────────────────────────────────────
  // Controla início / fim do serviço pelo técnico.
  serviceLogs: defineTable({
    servicoId: v.id("servicos"),
    tecnicoId: v.id("tecnicos"),
    acao: v.union(v.literal("inicio"), v.literal("fim"), v.literal("observacao")),
    observacao: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_servico", ["servicoId"])
    .index("by_tecnico", ["tecnicoId"]),
});

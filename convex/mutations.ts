import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId } from "./auth";

// ── Queries ──────────────────────────────────────────────────────────────

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
  },
});

export const listServicos = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!user) return [];

    let q = ctx.db.query("servicos").order("desc");

    if (args.status) {
      q = ctx.db
        .query("servicos")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc");
    }

    const servicos = await q.collect();

    // Tecnicos veem só os serviços da própria equipe
    if (user.role === "tecnico") {
      const tecnico = await ctx.db
        .query("tecnicos")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      if (tecnico) {
        return servicos.filter(
          (s) =>
            s.equipeId === tecnico.equipeId &&
            (s.status === "aprovado" || s.status === "em_andamento" || s.status === "pausado")
        );
      }
      return [];
    }

    return servicos;
  },
});

export const listTecnicos = query({
  args: { equipeId: v.optional(v.id("equipes")) },
  handler: async (ctx, args) => {
    const tecnicos = await (args.equipeId
      ? ctx.db.query("tecnicos").withIndex("by_equipe", (q) => q.eq("equipeId", args.equipeId as Id<"equipes">))
      : ctx.db.query("tecnicos")
    ).collect();
    // Traz user info
    const withUser = await Promise.all(
      tecnicos.map(async (t) => ({
        ...t,
        user: await ctx.db.get(t.userId),
      }))
    );
    return withUser;
  },
});

export const listEquipes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("equipes").collect();
  },
});

export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const servicos = await ctx.db.query("servicos").collect();
    const tecnicos = await ctx.db.query("tecnicos").collect();
    const equipes = await ctx.db.query("equipes").collect();

    // Conta por equipe
    const porEquipe: Record<string, { total: number; concluido: number; emAndamento: number; pausado: number }> = {};
    for (const eq of equipes) {
      porEquipe[eq._id] = { total: 0, concluido: 0, emAndamento: 0, pausado: 0 };
    }

    for (const s of servicos) {
      if (s.equipeId && porEquipe[s.equipeId]) {
        porEquipe[s.equipeId].total++;
        if (s.status === "concluido") porEquipe[s.equipeId].concluido++;
        if (s.status === "em_andamento") porEquipe[s.equipeId].emAndamento++;
        if (s.status === "pausado") porEquipe[s.equipeId].pausado++;
      }
    }

    // Tempos médios (serviceLogs)
    const serviceLogs = await ctx.db.query("serviceLogs").collect();
    const tempos: Record<string, number[]> = {};

    for (const log of serviceLogs) {
      if (!tempos[log.servicoId]) tempos[log.servicoId] = [];
    }

    const servicosConcluidos = await ctx.db
      .query("servicos")
      .withIndex("by_status", (q) => q.eq("status", "concluido"))
      .collect();

    const avgDurations = await Promise.all(
      servicosConcluidos.map(async (s) => {
        const logs = await ctx.db
          .query("serviceLogs")
          .withIndex("by_servico", (q) => q.eq("servicoId", s._id))
          .collect();
        const inicio = logs.find((l) => l.acao === "inicio")?.createdAt;
        const fim = logs.find((l) => l.acao === "fim")?.createdAt;
        if (inicio && fim) return (fim - inicio) / (1000 * 60); // minutos
        return null;
      })
    );

    const durations = avgDurations.filter((d) => d !== null) as number[];
    const tempoMedioMin =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    return {
      total: servicos.length,
      pendente: servicos.filter((s) => s.status === "pendente").length,
      emAndamento: servicos.filter((s) => s.status === "em_andamento").length,
      pausado: servicos.filter((s) => s.status === "pausado").length,
      concluido: servicos.filter((s) => s.status === "concluido").length,
      porEquipe,
      equipes,
      tempoMedioMin,
    };
  },
});

export const pendingUsers = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_approved", (q) => q.eq("approved", false))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────────

export const upsertUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    graduacao: v.optional(v.string()),
    nomeDeGuerra: v.optional(v.string()),
    re: v.optional(v.string()),
    secao: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("solicitante"),
        v.literal("gestor"),
        v.literal("tecnico"),
        v.literal("admin")
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      // ── Promove a admin master se ainda não houver nenhum admin no sistema ──
      const anyAdmin = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first();
      const isOrphanUser = !anyAdmin;
      const makeAdmin = isOrphanUser;

      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        ...(args.graduacao && { graduacao: args.graduacao }),
        ...(args.nomeDeGuerra && { nomeDeGuerra: args.nomeDeGuerra }),
        ...(args.re && { re: args.re }),
        ...(args.secao && { secao: args.secao }),
        ...(makeAdmin && { role: "admin", approved: true }),
      });
      return existing._id;
    } else {
      // ── Primeiro acesso: vira admin master automaticamente ──
      const totalUsers = await ctx.db.query("users").take(2);
      const isFirstUser = totalUsers.length === 0;
      const isAdminMaster = isFirstUser;

      const id = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        role: isAdminMaster ? "admin" : (args.role ?? "solicitante"),
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        secao: args.secao,
        approved: isAdminMaster, // admin master já fica aprovado direto
        createdAt: Date.now(),
      });
      return id;
    }
  },
});

export const approveUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Não autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("Não autorizado");
    }
    await ctx.db.patch(args.userId, { approved: true });
  },
});

export const criarServico = mutation({
  args: {
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || !user.approved) throw new Error("Usuário não aprovado");

    return await ctx.db.insert("servicos", {
      solicitanteId: user._id,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      status: "pendente",
      createdAt: Date.now(),
    });
  },
});

export const atribuirServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    equipeId: v.id("equipes"),
    dataAgendada: v.optional(v.string()),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("Não autorizado");
    }

    const servico = await ctx.db.get(args.servicoId);
    if (!servico) throw new Error("Serviço não encontrado");

    // Se estava pausado, mantém pausado (equipe nova vai retomar)
    // Se era pendente, volta pra aprovado
    const novoStatus = servico.status === "pausado" ? "pausado" : "aprovado";

    await ctx.db.patch(args.servicoId, {
      equipeId: args.equipeId,
      dataAgendada: args.dataAgendada,
      observacaoGestor: args.observacao,
      status: novoStatus as any,
      updatedAt: Date.now(),
    });
  },
});

export const pausarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    motivo: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("Não autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("Técnico não cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico || servico.equipeId !== tecnico.equipeId) {
      throw new Error("Serviço não pertence à sua equipe");
    }

    await ctx.db.patch(args.servicoId, {
      status: "pausado",
      motivoPausa: args.motivo,
      pausadoEm: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "observacao",
      observacao: `⏸ Pausado: ${args.motivo}`,
      createdAt: Date.now(),
    });
  },
});

export const retomarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("Não autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("Técnico não cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico) throw new Error("Serviço não encontrado");

    // Pode retomar se: (a) era da equipe original, ou (b) foi reassignado pra esta equipe
    if (servico.equipeId !== tecnico.equipeId) {
      throw new Error("Serviço não pertence à sua equipe");
    }

    await ctx.db.patch(args.servicoId, {
      status: "em_andamento",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "inicio",
      observacao: "▶️ Retomado",
      createdAt: Date.now(),
    });
  },
});

export const iniciarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("Não autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("Técnico não cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico || servico.equipeId !== tecnico.equipeId) {
      throw new Error("Serviço não pertence à sua equipe");
    }

    await ctx.db.patch(args.servicoId, {
      tecnicoId: tecnico._id,
      status: "em_andamento",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "inicio",
      createdAt: Date.now(),
    });
  },
});

export const encerrarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("Não autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("Técnico não cadastrado");

    await ctx.db.patch(args.servicoId, {
      status: "concluido",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "fim",
      observacao: args.observacao,
      createdAt: Date.now(),
    });
  },
});

export const criarEquipe = mutation({
  args: { nome: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("Não autorizado");
    }

    return await ctx.db.insert("equipes", {
      nome: args.nome,
      ativo: true,
      createdAt: Date.now(),
    });
  },
});

export const criarServicoDireto = mutation({
  args: {
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
    // dados do solicitante
    solicitanteNome: v.string(),
    solicitanteGraduacao: v.string(),
    solicitanteNomeDeGuerra: v.string(),
    solicitanteRe: v.string(),
    solicitanteSecao: v.string(),
    // datas de execução
    dataInicioExec: v.optional(v.string()),
    dataFimExec: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("Apenas técnicos podem fazer cadastro direto");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("Técnico não cadastrado em nenhuma equipe");

    // Se forneceu dataFim → já nasce concluído
    const status = args.dataFimExec ? "concluido" : "em_andamento";

    const servicoId = await ctx.db.insert("servicos", {
      solicitanteId: user._id,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      status: status as any,
      equipeId: tecnico.equipeId,
      tecnicoId: tecnico._id,
      cadastroDireto: true,
      dadosSolicitante: {
        nome: args.solicitanteNome,
        graduacao: args.solicitanteGraduacao,
        nomeDeGuerra: args.solicitanteNomeDeGuerra,
        re: args.solicitanteRe,
        secao: args.solicitanteSecao,
      },
      dataInicioExec: args.dataInicioExec,
      dataFimExec: args.dataFimExec,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log de início
    if (args.dataInicioExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: tecnico._id,
        acao: "inicio",
        observacao: `Cadastro direto — início: ${args.dataInicioExec}`,
        createdAt: new Date(args.dataInicioExec).getTime(),
      });
    }

    // Log de fim se fornecido
    if (args.dataFimExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: tecnico._id,
        acao: "fim",
        observacao: `Cadastro direto — fim: ${args.dataFimExec}`,
        createdAt: new Date(args.dataFimExec).getTime(),
      });
    }

    return servicoId;
  },
});

export const cadastrarTecnico = mutation({
  args: {
    equipeId: v.id("equipes"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Não autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("Não autorizado");
    }

    // upsert user como tecnico
    await ctx.db.patch(user._id, { role: "tecnico", approved: true });

    return await ctx.db.insert("tecnicos", {
      userId: user._id,
      equipeId: args.equipeId,
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      ativo: true,
      createdAt: Date.now(),
    });
  },
});

// -- Debug / Fix account -----------------------------------------------------
export const anyAdminExists = query({
  args: {},
  handler: async (ctx) => {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    return { exists: !!admin, admin };
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

export const forceAdminMaster = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("N�o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
    if (!user) throw new Error("User n�o existe no banco. Preencha o perfil em /pendente primeiro.");
    await ctx.db.patch(user._id, {
      role: "admin",
      approved: true,
    });
    return { ok: true, newRole: "admin" };
  },
});

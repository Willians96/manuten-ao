import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, action } from "./_generated/server";
import { getCurrentUserId } from "./auth";

// ── Helper: envia push notification via FCM HTTP legacy API ─────────────
// Requer variavel de ambiente FCM_SERVER_KEY (chave legada do Firebase)
async function sendPushNotification(
  ctx: any,
  tokens: string[],
  title: string,
  body: string,
  url?: string
) {
  if (!tokens || tokens.length === 0) return;
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.warn("FCM_SERVER_KEY nao configurada - push desabilitado");
    return;
  }
  for (const token of tokens) {
    try {
      await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${serverKey}`,
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body, sound: "default" },
          data: { url: url || "" },
        }),
      });
    } catch (e) {
      console.error("Erro ao enviar push:", e);
    }
  }
}

// Salva o FCM token do user (chamado pelo app no login)
export const saveFcmToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
    if (!user) return;
    await ctx.db.patch(user._id, { fcmToken: args.token });
  },
});


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
    // EXCETO pausados: pausados aparecem pra QUALQUER equipe (outra equipe pode retomar)
    if (user.role === "tecnico") {
      const tecnico = await ctx.db
        .query("tecnicos")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      if (tecnico) {
        return servicos.filter(
          (s) =>
            // Pausados: qualquer técnico de qualquer equipe vê
            (s.status === "pausado") ||
            // Demais status (aprovado, em_andamento): só da própria equipe
            ((s.status === "aprovado" || s.status === "em_andamento") &&
             s.equipeId === tecnico.equipeId)
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
      // ── Verifica se é um tecnico pre-cadastrado (placeholder) ──
      // Se o RE bater com um placeholder criado pelo cadastrarTecnico, vincula
      if (args.re) {
        const placeholder = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", `pendente:${args.re}`))
          .first();
        if (placeholder) {
          // Atualiza o placeholder com o clerkId real
          await ctx.db.patch(placeholder._id, {
            clerkId: args.clerkId,
            email: args.email,
            name: args.name,
            ...(args.graduacao && { graduacao: args.graduacao }),
            ...(args.nomeDeGuerra && { nomeDeGuerra: args.nomeDeGuerra }),
            ...(args.secao && { secao: args.secao }),
          });
          return placeholder._id;
        }
      }

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
        approved: isAdminMaster,
        isAdminMaster: isAdminMaster, // marca o primeiro admin como master
        createdAt: Date.now(),
      });
      return id;
    }
  },
});

export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(
      v.union(
        v.literal("solicitante"),
        v.literal("gestor"),
        v.literal("tecnico")
      )
    ),
  },
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
    await ctx.db.patch(args.userId, {
      approved: true,
      ...(args.role && { role: args.role }),
    });
  },
});

// Atualizar role de um usuário já aprovado (e suspender/reativar)
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("solicitante"),
      v.literal("gestor"),
      v.literal("tecnico"),
      v.literal("admin")
    ),
    approved: v.optional(v.boolean()),
  },
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
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Usuário não encontrado");
    // Não pode rebaixar o próprio admin master (proteção)
    if (target.isAdminMaster && target._id !== user._id) {
      throw new Error("Não é possível alterar o Admin Master");
    }
    const updates: any = { role: args.role };
    if (args.approved !== undefined) updates.approved = args.approved;
    await ctx.db.patch(args.userId, updates);
  },
});

// Excluir usuário PERMANENTEMENTE - SÓ Admin Master
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Não autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user) throw new Error("Não autorizado");
    if (user.isAdminMaster !== true) {
      throw new Error("Apenas o Admin Master pode excluir usuários");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Usuário não encontrado");
    // Proteções
    if (target._id === user._id) {
      throw new Error("Você não pode excluir a si mesmo");
    }
    if (target.isAdminMaster) {
      throw new Error("Não é possível excluir o Admin Master");
    }
    // Verifica se tem serviços vinculados
    const servicos = await ctx.db
      .query("servicos")
      .withIndex("by_solicitante", (q) => q.eq("solicitanteId", args.userId))
      .collect();
    if (servicos.length > 0) {
      throw new Error(`Usuário tem ${servicos.length} serviço(s) vinculado(s). Use "Excluir em cascata" pra apagar tudo junto.`);
    }
    // Verifica se é técnico
    const tecnicos = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (tecnicos.length > 0) {
      throw new Error("Usuário é técnico cadastrado. Exclua-o na página de Equipes primeiro.");
    }
    await ctx.db.delete(args.userId);
  },
});

// Excluir usuário EM CASCATA - SÓ Admin Master
// Apaga TUDO do user: serviços onde foi solicitante, técnicos vinculados, e o user
// (serviços onde o user é TÉCNICO não são apagados - só ficam sem responsável)
export const forceDeleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Não autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user) throw new Error("Não autorizado");
    if (user.isAdminMaster !== true) {
      throw new Error("Apenas o Admin Master pode excluir usuários");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Usuário não encontrado");
    if (target._id === user._id) {
      throw new Error("Você não pode excluir a si mesmo");
    }
    if (target.isAdminMaster) {
      throw new Error("Não é possível excluir o Admin Master");
    }

    // 1. Apaga logs de serviços onde o user era técnico
    const tecnicos = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of tecnicos) {
      // serviceLogs tem by_tecnico
      const logs = await ctx.db
        .query("serviceLogs")
        .withIndex("by_tecnico", (q) => q.eq("tecnicoId", t._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      // Apaga o técnico
      await ctx.db.delete(t._id);
    }

    // 2. Apaga serviços onde o user foi solicitante (junto com logs)
    const servicos = await ctx.db
      .query("servicos")
      .withIndex("by_solicitante", (q) => q.eq("solicitanteId", args.userId))
      .collect();
    for (const s of servicos) {
      const logs = await ctx.db
        .query("serviceLogs")
        .withIndex("by_servico", (q) => q.eq("servicoId", s._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      await ctx.db.delete(s._id);
    }

    // 3. Apaga o user
    await ctx.db.delete(args.userId);
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

    const newId = await ctx.db.insert("servicos", {
      solicitanteId: user._id,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      status: "pendente",
      createdAt: Date.now(),
    });

    // PUSH: notifica todos os gestores
    const gestores = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "gestor"))
      .collect();
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    const tokens = [...gestores, ...admins]
      .map((u) => u.fcmToken)
      .filter((t): t is string => !!t);
    await sendPushNotification(
      ctx, tokens,
      "🔔 Novo serviço aguardando aprovação",
      `${user.graduacao ?? ""} ${user.nomeDeGuerra ?? user.name}: ${args.titulo}`,
      "/gestor"
    );

    return newId;
  },
});

export const atribuirServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    equipeId: v.id("equipes"),
    tecnicoId: v.optional(v.id("tecnicos")), // atribuir a um tecnico especifico (opcional)
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
      tecnicoId: args.tecnicoId, // se null, qualquer tecnico da equipe pode pegar
      dataAgendada: args.dataAgendada,
      observacaoGestor: args.observacao,
      status: novoStatus as any,
      updatedAt: Date.now(),
    });

    // PUSH: notifica o técnico (se específico) ou todos da equipe
    const tokens: string[] = [];
    if (args.tecnicoId) {
      const tec = await ctx.db.get(args.tecnicoId);
      if (tec) {
        const userTec = await ctx.db.get(tec.userId);
        if (userTec?.fcmToken) tokens.push(userTec.fcmToken);
      }
    } else {
      // Notifica todos os técnicos ativos da equipe
      const tecs = await ctx.db
        .query("tecnicos")
        .withIndex("by_equipe", (q) => q.eq("equipeId", args.equipeId))
        .collect();
      for (const t of tecs) {
        if (t.ativo && (t.status === "ativo" || !t.status)) {
          const u = await ctx.db.get(t.userId);
          if (u?.fcmToken) tokens.push(u.fcmToken);
        }
      }
    }
    const equipe = await ctx.db.get(args.equipeId);
    await sendPushNotification(
      ctx, tokens,
      "🔧 Novo serviço atribuído",
      `${servico.titulo} — ${equipe?.nome ?? "equipe"}`,
      "/tecnico"
    );
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

    // Se NÃO é pausado, mantém regra original: só a equipe responsável pode retomar
    if (servico.status !== "pausado" && servico.equipeId !== tecnico.equipeId) {
      throw new Error("Serviço não pertence à sua equipe");
    }

    // Servico pausado: qualquer tecnico de qualquer equipe pode retomar
    // Ao retomar, transfere o servico pra equipe do novo tecnico
    const transferido = servico.status === "pausado" && servico.equipeId !== tecnico.equipeId;
    const equipeAnterior = servico.equipeId;

    await ctx.db.patch(args.servicoId, {
      status: "em_andamento",
      tecnicoId: tecnico._id,
      equipeId: tecnico.equipeId, // transfere pra equipe que está retomando
      motivoPausa: undefined,
      pausadoEm: undefined,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "inicio",
      observacao: transferido
        ? `▶️ Retomado por outra equipe (anterior: ${equipeAnterior})`
        : "▶️ Retomado",
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
    // Se já tem tecnicoId definido (específico), só esse pode iniciar
    if (servico.tecnicoId && servico.tecnicoId !== tecnico._id) {
      throw new Error("Este serviço está atribuído a outro técnico da sua equipe");
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

    // PUSH: notifica o gestor e o solicitante (só se NÃO for cadastroDireto)
    const servico = await ctx.db.get(args.servicoId);
    if (servico && !servico.cadastroDireto) {
      const tokens: string[] = [];
      // Gestores
      const gestores = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "gestor"))
        .collect();
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      for (const u of [...gestores, ...admins]) {
        if (u.fcmToken) tokens.push(u.fcmToken);
      }
      // Solicitante (só se não for cadastroDireto - aí tem user real)
      if (servico.solicitanteId) {
        const sol = await ctx.db.get(servico.solicitanteId);
        if (sol?.fcmToken) tokens.push(sol.fcmToken);
      }
      await sendPushNotification(
        ctx, tokens,
        "✅ Serviço concluído",
        `${servico.titulo} — por ${tecnico.graduacao} ${tecnico.nomeDeGuerra}`,
        "/gestor"
      );
    }
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
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Não autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Não autorizado");
    }

    // Verifica se já existe um tecnico com esse RE
    const existingTecnico = await ctx.db
      .query("tecnicos")
      .filter((q) => q.eq(q.field("re"), args.re))
      .first();

    if (existingTecnico) {
      // Se já existe o RE: atualiza SÓ se for da MESMA equipe
      // (se for de outra equipe, é o mesmo PM com RE duplicado — não mexe)
      if (existingTecnico.equipeId === args.equipeId) {
        await ctx.db.patch(existingTecnico._id, {
          graduacao: args.graduacao,
          nomeDeGuerra: args.nomeDeGuerra,
          ativo: true,
        });
        return existingTecnico._id;
      }
      // RE existe em outra equipe → throw
      throw new Error(
        `Já existe um técnico com RE ${args.re} em outra equipe. Use o botão "Editar" para movê-lo.`
      );
    }

    // Cria um user PLACEHOLDER pro tecnico (clerkId fake)
    // Quando o tecnico real logar, o upsertUser vincula pelo RE
    const placeholderClerkId = `pendente:${args.re}`;
    const newUserId = await ctx.db.insert("users", {
      clerkId: placeholderClerkId,
      email: `${args.re}@pendente.pmesp`,
      name: args.nomeDeGuerra,
      role: "tecnico",
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      secao: "Manutenção",
      approved: true,
      createdAt: Date.now(),
    });

    return await ctx.db.insert("tecnicos", {
      userId: newUserId,
      equipeId: args.equipeId,
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      ativo: true,
      status: "ativo" as const,
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
      isAdminMaster: true,
    });
    return { ok: true, newRole: "admin" };
  },
});

// -- Editar / Excluir Tecnico ------------------------------------------------
export const alterarStatusTecnico = mutation({
  args: {
    tecnicoId: v.id("tecnicos"),
    status: v.union(
      v.literal("ativo"),
      v.literal("ferias"),
      v.literal("baixa")
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nao autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nao autorizado");
    }
    await ctx.db.patch(args.tecnicoId, { status: args.status });
    return { ok: true };
  },
});

export const editarTecnico = mutation({
  args: {
    tecnicoId: v.id("tecnicos"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
    equipeId: v.id("equipes"),
    ativo: v.boolean(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("N�o autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("N�o autorizado");
    }

    const tecnico = await ctx.db.get(args.tecnicoId);
    if (!tecnico) throw new Error("T�cnico n�o encontrado");

    // Atualiza o tecnico
    await ctx.db.patch(args.tecnicoId, {
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      equipeId: args.equipeId,
      ativo: args.ativo,
    });

    // Sincroniza os dados no user placeholder (se for placeholder)
    const user = await ctx.db.get(tecnico.userId);
    if (user && user.clerkId.startsWith("pendente:")) {
      await ctx.db.patch(tecnico.userId, {
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        name: args.nomeDeGuerra,
      });
    }

    return args.tecnicoId;
  },
});

export const excluirTecnico = mutation({
  args: { tecnicoId: v.id("tecnicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("N�o autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("N�o autorizado");
    }

    const tecnico = await ctx.db.get(args.tecnicoId);
    if (!tecnico) throw new Error("T�cnico n�o encontrado");

    // Verifica se h� servi�os pendentes atribu�dos a este tecnico
    const servicosPendentes = await ctx.db
      .query("servicos")
      .withIndex("by_status", (q) => q.eq("status", "em_andamento"))
      .filter((q) => q.eq(q.field("tecnicoId"), args.tecnicoId))
      .first();

    if (servicosPendentes) {
      throw new Error("N�o � poss�vel excluir: t�cnico tem servi�os em andamento");
    }

    // Soft delete: marca como inativo
    await ctx.db.patch(args.tecnicoId, { ativo: false });

    return { ok: true, softDeleted: true };
  },
});

// -- Gest�o de Servi�os (admin/gestor) ---------------------------------------
export const excluirServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("N�o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("N�o autorizado");
    }
    // So o admin master pode excluir permanentemente
    if (!currentUser.isAdminMaster) {
      throw new Error("Apenas o Admin Master pode excluir. Use Cancelar.");
    }
    // Apaga os logs relacionados
    const logs = await ctx.db
      .query("serviceLogs")
      .withIndex("by_servico", (q) => q.eq("servicoId", args.servicoId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
    // Apaga o servi�o
    await ctx.db.delete(args.servicoId);
    return { ok: true };
  },
});

export const cancelarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("N�o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("N�o autorizado");
    }
    await ctx.db.patch(args.servicoId, {
      status: "cancelado",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const editarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
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
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("N�o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("N�o autorizado");
    }
    await ctx.db.patch(args.servicoId, {
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

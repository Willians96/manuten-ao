import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * HTTP Action pública para o app Android salvar o FCM token.
 *
 * Fluxo:
 *   1. Android pega o token via FirebaseMessaging.getInstance().token
 *   2. WebView carrega, JS pega Clerk.user.id + window.__fcmToken
 *   3. JS faz POST pra cá com {clerkId, token, appSecret}
 *   4. A action valida secret, chama runQuery/runMutation e salva fcmToken
 *
 * Por que não usar a mutation saveFcmToken (autenticada)?
 *   - A mutation autenticada exige JWT do Clerk, que só existe no browser
 *   - Esta httpAction é stateless, validada por secret compartilhado
 *
 * IMPORTANTE: trocar FCM_APP_SECRET em produção!
 * Definir via: npx convex env set FCM_APP_SECRET "outro-valor-aqui"
 */
const APP_SECRET = process.env.FCM_APP_SECRET || "PMESP-FCM-2026-manutencao-drab";

const saveFcmToken = httpAction(async (ctx, request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const { clerkId, token, appSecret } = body || {};
  if (!clerkId || !token || typeof clerkId !== "string" || typeof token !== "string") {
    return new Response(
      JSON.stringify({ error: "clerkId and token are required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Valida secret
  if (appSecret !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Procura o user via query pública
  const user = await ctx.runQuery(api.mutations.findUserByClerkIdPublic, { clerkId });
  if (!user) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Salva token via mutation pública
  await ctx.runMutation(api.mutations.setFcmTokenByUserIdPublic, {
    userId: user._id,
    token,
  });

  return new Response(
    JSON.stringify({ ok: true, userId: user._id }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});

const http = httpRouter();
http.route({
  path: "/saveFcmToken",
  method: "POST",
  handler: saveFcmToken,
});

// HTTP action pra debug do FCM - loga cada passo do app Android
// Grava na tabela debugLogs que pode ser vista em /debug-fcm
const fcmDebugLog = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {}
  const { step, info, hasToken, hasClerkUser, clerkId, error, source } = body || {};
  const msg = `[FCM-DEBUG] step=${step} hasToken=${!!hasToken} hasClerkUser=${!!hasClerkUser} clerkId=${clerkId || "?"} info=${info || ""} error=${error || ""}`;
  console.log(msg);

  // Grava na tabela debugLogs via mutation pública
  try {
    await ctx.runMutation(api.mutations.addDebugLogPublic, {
      source: source || "fcm-android",
      step: step || "unknown",
      info,
      clerkId,
      hasToken,
      hasClerkUser,
      error,
    });
  } catch (e) {
    console.error("[FCM-DEBUG] Erro ao gravar no debugLogs:", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

http.route({
  path: "/fcmDebugLog",
  method: "POST",
  handler: fcmDebugLog,
});

// HTTP action admin pra rodar migrations (valida via FCM_APP_SECRET)
// Usada pra corrigir dados do banco sem precisar de auth Clerk
const runMigration = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const APP_SECRET = process.env.FCM_APP_SECRET || "PMESP-FCM-2026-manutencao-drab";
  let body: any = {};
  try { body = await request.json(); } catch {}
  const { name, args: migArgs, appSecret } = body || {};

  if (appSecret !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "fixTecnicoUserLink") {
    const { re } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Acha o tecnico via query pública
    const tecnico = await ctx.runQuery(api.mutations.findTecnicoByRePublic, { re });
    if (!tecnico) {
      return new Response(JSON.stringify({ error: `Técnico com RE ${re} não encontrado` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Acha o user real
    const realUser = await ctx.runQuery(api.mutations.findRealUserByRePublic, { re });
    if (!realUser) {
      return new Response(JSON.stringify({ error: `User real com RE ${re} não encontrado` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Atualiza o tecnico
    await ctx.runMutation(api.mutations.patchTecnicoUserIdPublic, {
      tecnicoId: tecnico._id,
      userId: realUser._id,
    });
    // Deleta placeholders
    const deleted = await ctx.runMutation(api.mutations.deletePlaceholderUsersByRePublic, { re });
    return new Response(JSON.stringify({
      ok: true,
      tecnicoId: tecnico._id,
      realUserId: realUser._id,
      realUserName: realUser.name,
      deletedPlaceholders: deleted,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "setDefaultModalidades") {
    // Migration: seta modalidades=["servicos_gerais"] em todos os tecnicos existentes
    // e modalidade="servicos_gerais" em todos os servicos existentes
    const allTecnicos = await ctx.runQuery(api.mutations.listAllTecnicosPublic, {});
    let tecnicosUpdated = 0;
    for (const t of allTecnicos) {
      if (!t.modalidades || t.modalidades.length === 0) {
        await ctx.runMutation(api.mutations.setDefaultTecnicoModalidadesPublic, {
          id: t._id,
          modalidades: ["servicos_gerais"],
        });
        tecnicosUpdated++;
      }
    }
    const allServicos = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    let servicosUpdated = 0;
    for (const s of allServicos) {
      if (!s.modalidade) {
        await ctx.runMutation(api.mutations.setDefaultServicoModalidadePublic, {
          id: s._id,
          modalidade: "servicos_gerais",
        });
        servicosUpdated++;
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      tecnicosUpdated,
      servicosUpdated,
      tecnicosTotal: allTecnicos.length,
      servicosTotal: allServicos.length,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "criarEquipeTIeMoverWilliam") {
    // Cria a equipe "Telemática" (modalidade=informatica) e move o William pra lá
    // Garante que Equipe A/B continuam como servicos_gerais

    // 1. Atualiza equipes existentes pra terem modalidade servicos_gerais (retroativo)
    const allEquipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    let equipesUpdated = 0;
    let equipeTICreated = null;
    for (const eq of allEquipes) {
      if (!eq.modalidade) {
        await ctx.runMutation(api.mutations.setEquipeModalidadePublic, {
          id: eq._id,
          modalidade: "servicos_gerais",
        });
        equipesUpdated++;
      }
    }
    // 2. Verifica se equipe "Telemática" já existe
    const telematica = allEquipes.find((e: any) => e.nome === "Telemática");
    if (telematica) {
      // Garante que tem modalidade informatica
      if (telematica.modalidade !== "informatica") {
        await ctx.runMutation(api.mutations.setEquipeModalidadePublic, {
          id: telematica._id,
          modalidade: "informatica",
        });
      }
      equipeTICreated = telematica;
    } else {
      // Cria a equipe "Telemática"
      const result = await ctx.runMutation(api.mutations.criarEquipeAdminPublic, {
        nome: "Telemática",
        modalidade: "informatica",
      });
      equipeTICreated = { _id: result.equipeId, nome: "Telemática", modalidade: "informatica" };
    }
    // 3. Acha o tecnico William (RE 111926-5) e move pra Telemática
    const williamTecnico = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re: "111926-5" });
    if (williamTecnico) {
      await ctx.runMutation(api.mutations.patchTecnicoEquipePublic, {
        id: williamTecnico._id,
        equipeId: equipeTICreated._id,
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      message: "Equipe Telemática criada/atualizada e William movido pra lá",
      equipeTI: equipeTICreated,
      williamTecnicoId: williamTecnico?._id,
      equipesUpdated,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "cadastrarWilliamComoTecnicoTI") {
    // Cadastra William (admin master, RE 111926-5) como técnico de TI na Equipe A
    // (vamos usar a Equipe A por padrão, pode mudar depois)
    const william = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re: "111926-5" });
    if (!william) {
      return new Response(JSON.stringify({ error: "William (RE 111926-5) não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Verifica se já é técnico
    const existing = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re: "111926-5" });
    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: "William já é técnico", tecnicoId: existing._id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Pega a primeira equipe (Equipe A)
    const equipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    if (equipes.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma equipe cadastrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const equipeA = equipes[0];
    const result = await ctx.runMutation(api.mutations.cadastrarTecnicoAdminPublic, {
      userId: william._id,
      equipeId: equipeA._id,
      graduacao: "Cb",
      nomeDeGuerra: "William",
      re: "111926-5",
      modalidades: ["informatica"],
    });
    return new Response(JSON.stringify({
      ok: true,
      message: "William cadastrado como técnico de TI!",
      tecnicoId: result.tecnicoId,
      equipe: equipeA.nome,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "createPastService") {
    // Cria um serviço retroativo (que aconteceu antes do sistema entrar em uso)
    if (!migArgs) {
      return new Response(JSON.stringify({ error: "args é obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const required = ["criadoPorUserId", "titulo", "descricao", "local", "urgencia", "equipeId", "tecnicoId", "solicitanteNome", "solicitanteGraduacao", "solicitanteNomeDeGuerra", "solicitanteRe", "solicitanteSecao"];
    for (const f of required) {
      if (!migArgs[f]) {
        return new Response(JSON.stringify({ error: `Campo obrigatório: ${f}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    const result = await ctx.runMutation(api.mutations.criarServicoAdminPublic, migArgs);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


  if (name === "reatribuirSolicitante") {
    // Reatribui o solicitante de um servico para o user de um RE especifico
    // Usado quando o servico foi cadastrado em nome de outra pessoa (cadastroDireto)
    // Args: { servicoId? OU titulo, solicitanteRe }
    if (!migArgs || !migArgs.solicitanteRe) {
      return new Response(JSON.stringify({ error: "solicitanteRe e obrigatorio (use servicoId OU titulo)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!migArgs.servicoId && !migArgs.titulo) {
      return new Response(JSON.stringify({ error: "informe servicoId OU titulo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    let servico;
    if (migArgs.servicoId) {
      servico = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: migArgs.servicoId });
    } else {
      const matches = await ctx.runQuery(api.mutations.findServicoByTituloPublic, { titulo: migArgs.titulo });
      if (matches.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum servico encontrado com esse titulo" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (matches.length > 1) {
        return new Response(JSON.stringify({
          error: "Multiplos servicos encontrados, use servicoId",
          matches: matches.map((m: any) => ({ _id: m._id, titulo: m.titulo, data: m._creationTime })),
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      servico = matches[0];
    }
    if (!servico) {
      return new Response(JSON.stringify({ error: "Servico nao encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const novoSolicitante = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re: migArgs.solicitanteRe });
    if (!novoSolicitante) {
      return new Response(JSON.stringify({ error: "User com RE " + migArgs.solicitanteRe + " nao encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    await ctx.runMutation(api.mutations.patchServicoSolicitanteIdPublic, {
      id: servico._id,
      solicitanteId: novoSolicitante._id,
    });
    return new Response(JSON.stringify({
      ok: true,
      servicoId: servico._id,
      servicoTitulo: servico.titulo,
      novoSolicitanteId: novoSolicitante._id,
      novoSolicitanteNome: novoSolicitante.nomeDeGuerra || novoSolicitante.name,
      novoSolicitanteGraduacao: novoSolicitante.graduacao,
      novoSolicitanteRe: novoSolicitante.re,
      antigoSolicitanteId: servico.solicitanteId,
      dadosSolicitanteAnterior: servico.dadosSolicitante,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

    if (name === "limparTecnicosInativos") {
    // Lista tecnicos com ativo=false e que NAO tem servicos vinculados
    // Deleta eles via deleteTecnicoPublic
    const inativos = await ctx.runQuery(api.mutations.listTecnicosInativosPublic, {});
    const removidos: any[] = [];
    const erros: any[] = [];
    for (const t of inativos) {
      const r = await ctx.runMutation(api.mutations.deleteTecnicoPublic, { id: t._id });
      if (r.ok) {
        removidos.push({ id: t._id, nome: t.nomeDeGuerra, re: t.re });
      } else {
        erros.push({ id: t._id, nome: t.nomeDeGuerra, erro: r.error });
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      totalInativos: inativos.length,
      removidos: removidos.length,
      erros: erros.length,
      detalhes: { removidos, erros },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "corrigirHorariosServicos") {
    // Ajusta dataInicioExec, dataFimExec e status de uma lista de servicos
    // Args: { updates: [{ servicoId, dataInicioExec?, dataFimExec?, status? }] }
    if (!migArgs || !Array.isArray(migArgs.updates) || migArgs.updates.length === 0) {
      return new Response(JSON.stringify({ error: "updates (array) obrigatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const resultados: any[] = [];
    for (const u of migArgs.updates) {
      if (!u.servicoId) {
        resultados.push({ ok: false, error: "servicoId obrigatorio" });
        continue;
      }
      const servico = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: u.servicoId });
      if (!servico) {
        resultados.push({ ok: false, servicoId: u.servicoId, error: "Servico nao encontrado" });
        continue;
      }
      const patch: any = { updatedAt: Date.now() };
      if (u.dataInicioExec !== undefined) patch.dataInicioExec = u.dataInicioExec;
      if (u.dataFimExec !== undefined) patch.dataFimExec = u.dataFimExec;
      if (u.status) patch.status = u.status;
      const { updatedAt, ...campos } = patch;
      await ctx.runMutation(api.mutations.patchServicoCamposPublic, { id: u.servicoId, ...campos });
      resultados.push({ ok: true, servicoId: u.servicoId, titulo: servico.titulo, patch });
    }
    return new Response(JSON.stringify({
      ok: true,
      total: migArgs.updates.length,
      sucessos: resultados.filter((r: any) => r.ok).length,
      erros: resultados.filter((r: any) => !r.ok).length,
      detalhes: resultados,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


    if (name === "inferirDatasDosLogs") {
    // Para servicos concluidos sem dataFimExec OU em_andamento sem dataInicioExec,
    // infere as datas dos serviceLogs (acao=inicio -> dataInicioExec, acao=fim -> dataFimExec)
    const semFim = await ctx.runQuery(api.mutations.listServicosSemDataFimPublic, {});
    const semInicio = await ctx.runQuery(api.mutations.listServicosSemDataInicioPublic, {});
    const alvos = [...semFim, ...semInicio];
    const resultados: any[] = [];
    for (const serv of alvos) {
      const logs = await ctx.runQuery(api.mutations.listServiceLogsByServicoPublic, { servicoId: serv._id });
      const inicioLog = logs.find((l: any) => l.acao === "inicio");
      const fimLog = logs.find((l: any) => l.acao === "fim");
      const patch: any = {};
      if (!serv.dataInicioExec && inicioLog) {
        patch.dataInicioExec = new Date(inicioLog.createdAt).toISOString();
      } else if (!serv.dataInicioExec) {
        // Sem log de inicio: usa dataFimExec ou _creationTime como fallback
        const ref = serv.dataFimExec || serv._creationTime;
        patch.dataInicioExec = new Date(ref).toISOString();
      }
      if (serv.status === "concluido" && !serv.dataFimExec) {
        if (fimLog) {
          patch.dataFimExec = new Date(fimLog.createdAt).toISOString();
        } else if (serv.dataInicioExec) {
          // Fallback: 30min depois do inicio
          patch.dataFimExec = new Date(new Date(serv.dataInicioExec).getTime() + 30 * 60000).toISOString();
        } else if (inicioLog) {
          patch.dataFimExec = new Date(new Date(inicioLog.createdAt).getTime() + 30 * 60000).toISOString();
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.runMutation(api.mutations.patchServicoCamposPublic, { id: serv._id, ...patch });
        resultados.push({ ok: true, servicoId: serv._id, titulo: serv.titulo, patch, usouFallback: !inicioLog && !fimLog });
      } else {
        resultados.push({ ok: false, servicoId: serv._id, titulo: serv.titulo, error: "nada para inferir" });
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      total: alvos.length,
      atualizados: resultados.filter((r: any) => r.ok).length,
      semLogs: resultados.filter((r: any) => r.usouFallback).length,
      detalhes: resultados,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "seedFeriadosNacionais") {
    // Adiciona feriados nacionais BR 2026 + 2027 (idempotente)
    const feriados2026 = [
      { data: "2026-01-01", nome: "Confraternizacao Universal" },
      { data: "2026-04-03", nome: "Paixao de Cristo" },
      { data: "2026-04-21", nome: "Tiradentes" },
      { data: "2026-05-01", nome: "Dia do Trabalho" },
      { data: "2026-09-07", nome: "Independencia" },
      { data: "2026-10-12", nome: "N. Sra. Aparecida" },
      { data: "2026-11-02", nome: "Finados" },
      { data: "2026-11-15", nome: "Proclamacao da Republica" },
      { data: "2026-11-20", nome: "Consciencia Negra" },
      { data: "2026-12-25", nome: "Natal" },
    ];
    const feriados2027 = [
      { data: "2027-01-01", nome: "Confraternizacao Universal" },
      { data: "2027-03-26", nome: "Paixao de Cristo" },
      { data: "2027-04-21", nome: "Tiradentes" },
      { data: "2027-05-01", nome: "Dia do Trabalho" },
      { data: "2027-09-07", nome: "Independencia" },
      { data: "2027-10-12", nome: "N. Sra. Aparecida" },
      { data: "2027-11-02", nome: "Finados" },
      { data: "2027-11-15", nome: "Proclamacao da Republica" },
      { data: "2027-11-20", nome: "Consciencia Negra" },
      { data: "2027-12-25", nome: "Natal" },
    ];
    const todos = [...feriados2026, ...feriados2027];
    const adicionados: any[] = [];
    const jaExistentes: any[] = [];
    for (const f of todos) {
      const r = await ctx.runMutation(api.mutations.addFeriadoPublic, {
        data: f.data, nome: f.nome, tipo: "nacional",
      });
      if (r.ok) adicionados.push(f);
      else jaExistentes.push(f);
    }
    return new Response(JSON.stringify({
      ok: true,
      adicionados: adicionados.length,
      jaExistentes: jaExistentes.length,
      detalhes: { adicionados, jaExistentes },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: `migration '${name}' not found` }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});

http.route({
  path: "/runMigration",
  method: "POST",
  handler: runMigration,
});

export default http;

import { httpAction } from "./_generated/server";

/**
 * HTTP Action pública para o app Android salvar o FCM token.
 *
 * Fluxo:
 *   1. Android pega o token via FirebaseMessaging.getInstance().token
 *   2. WebView carrega, JS pega Clerk.user.id + window.__fcmToken
 *   3. JS faz POST pra cá com {clerkId, token, appSecret}
 *   4. A action valida secret, acha user por clerkId, salva fcmToken
 *
 * Por que não usar a mutation saveFcmToken (autenticada)?
 *   - A mutation autenticada exige JWT do Clerk, que só existe no browser
 *   - Esta httpAction é stateless, validada por secret compartilhado
 *
 * IMPORTANTE: trocar FCM_APP_SECRET em produção!
 * Definir via: npx convex env set FCM_APP_SECRET "outro-valor-aqui"
 */
const APP_SECRET = process.env.FCM_APP_SECRET || "PMESP-FCM-2026-manutencao-drab";

export const saveFcmToken = httpAction(async (ctx, request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-App-Secret",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { clerkId, token, appSecret } = body || {};
  if (!clerkId || !token || typeof clerkId !== "string" || typeof token !== "string") {
    return new Response(
      JSON.stringify({ error: "clerkId and token are required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Valida secret
  if (appSecret !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Procura o user direto via ctx.db (httpAction tem acesso ao db)
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .first();

  if (!user) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Salva token
  await ctx.db.patch(user._id, { fcmToken: token });

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

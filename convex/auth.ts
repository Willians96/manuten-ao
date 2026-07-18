// Auth via Clerk — o frontend envia o token no header Authorization
// O middleware Clerk do Next.js valida o token antes de chegar ao frontend
// Aqui no Convex, extraímos o userId via ctx.auth
export async function getCurrentUserId(ctx: { auth: any }): Promise<string | null> {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return identity.subject;
  } catch {
    return null;
  }
}

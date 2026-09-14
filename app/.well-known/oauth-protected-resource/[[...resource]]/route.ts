import { originOf, SCOPES } from "@/lib/auth";
import { DEMO_MERCHANT } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// OAuth 2.0 Protected Resource Metadata (RFC 9728). Path-suffixed form: /.well-known/oauth-protected-resource/api/mcp/<merchant>
export async function GET(req: Request, ctx: { params: Promise<{ resource?: string[] }> }) {
  const origin = originOf(req);
  const { resource } = await ctx.params;
  const resourcePath = resource?.length ? `/${resource.join("/")}` : `/api/mcp/${DEMO_MERCHANT.slug}`;
  return Response.json({
    resource: `${origin}${resourcePath}`,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Storefront in a Box: Alexa+ add-on",
    resource_documentation: `${origin}/#account-linking`,
  });
}

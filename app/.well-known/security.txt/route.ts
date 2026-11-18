import { getSettings } from "@/lib/settings";
import { buildSecurityTxt } from "@/lib/security-txt";
import { absoluteUrl } from "@/lib/site-url";

/** RFC 9116 security.txt：后台「站点设置」里填写了安全联系方式才提供。 */
export async function GET() {
  const { securityContact } = await getSettings();
  if (!securityContact) {
    return new Response("Not Found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = buildSecurityTxt({
    contact: securityContact,
    canonical: absoluteUrl("/.well-known/security.txt"),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

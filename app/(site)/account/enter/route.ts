import { CUSTOMER_COOKIE, magicLinkResponse } from "@/lib/portal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return magicLinkResponse(new URL(req.url).searchParams.get("token"), CUSTOMER_COOKIE, "/account");
}

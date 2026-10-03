import { checkPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const result = checkPassword(req.headers.get("x-app-password"));
  if (result === "not-configured") {
    return Response.json({ error: "APP_PASSWORD não está configurada no servidor." }, { status: 500 });
  }
  if (result === "unauthorized") {
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }
  return Response.json({ ok: true });
}

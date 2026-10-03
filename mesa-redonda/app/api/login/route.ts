import { checkPassword, passwordRequired } from "@/lib/auth";

export async function GET() {
  return Response.json({ required: passwordRequired() });
}

export async function POST(req: Request) {
  if (checkPassword(req.headers.get("x-app-password")) === "unauthorized") {
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }
  return Response.json({ ok: true });
}

import { requireMe } from "@/lib/server";
import { V2Home } from "./V2Home";

export const metadata = { title: "Accueil" };

export default async function V2HomePage() {
  const me = await requireMe();
  return <V2Home me={me} />;
}

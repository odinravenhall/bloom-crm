import type { Metadata } from "next";
import { Suspense } from "react";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Inbox } from "./Inbox";

export const metadata: Metadata = { title: "Messagerie" };
export const dynamic = "force-dynamic";

export default async function Messagerie() {
  await requireMe(CHAT_ROLES);
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

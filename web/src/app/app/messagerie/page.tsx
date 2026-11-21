import type { Metadata } from "next";
import { Suspense } from "react";
import { requireMe } from "@/lib/server";
import { Inbox } from "./Inbox";

export const metadata: Metadata = { title: "Messagerie" };
export const dynamic = "force-dynamic";

export default async function Messagerie() {
  await requireMe();
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

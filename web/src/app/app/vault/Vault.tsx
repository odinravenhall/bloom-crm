"use client";

import { useCreators } from "@/lib/creators";
import { VaultPage } from "./VaultPage";
import { VaultPro } from "./VaultPro";

/** OnlyFans : Vault Pro façon Infloww ; MYM : le vault simple. */
export function Vault({ canEdit }: { canEdit: boolean }) {
  const { pf } = useCreators();
  return pf === "mym" ? <VaultPage /> : <VaultPro canEdit={canEdit} />;
}

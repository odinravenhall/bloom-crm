"use client";

import { useCreators } from "@/lib/creators";
import { FanLists } from "./FanLists";
import { SmartLists } from "./SmartLists";

/** OnlyFans : Smart lists façon Infloww ; MYM : Groupes (comme MyPulse). */
export function Lists({ canEdit }: { canEdit: boolean }) {
  const { pf } = useCreators();
  return pf === "mym" ? <FanLists canEdit={canEdit} /> : <SmartLists canEdit={canEdit} />;
}

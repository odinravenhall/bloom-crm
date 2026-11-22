export type Model = { id: string; userName: string | null; displayName: string; avatar: string | null; connected: boolean; platform?: string | null };

export type Conv = {
  id: string;
  modelId: string;
  memberId: string | null;
  memberName: string | null;
  memberAvatar: string | null;
  nickname: string | null;
  totalSpent: number;
  lastSeenAt: string | null;
  lastMessageAt: string | null;
  preview: string;
  lastFromFan: boolean;
  /** Arrivée du fan chez la modèle (abonnement) : badge « New sub +1/+2/+3 » les 3 premiers jours. */
  subscribedAt?: string | null;
  pinnedBy?: { id: number; name: string } | null;
  seen?: boolean;
  unread: boolean;
  fresh: boolean;
  pinned: boolean;
  vip: boolean;
  needsReply: boolean;
  waitingSince: string | null;
  crmNote: string;
  crmTags: string[];
  revealNote: string;
  cardVerified: boolean;
  badge: { icon: string | null; label: string | null };
  score: { rank: "diamond" | "gold" | "silver" | "bronze" | "unranked"; top: number | null; lastPaidAt: string | null; paidWeek: boolean };
  lock: { userId: number; name: string } | null;
  /** Bloom : IA de Substy active sur ce fan, « à reprendre », peut recevoir un message. */
  ai?: boolean;
  handoff?: boolean;
  canSend?: boolean;
};

export type Media = {
  id: string;
  type: "photo" | "video" | "audio";
  url?: string;
  smallUrl?: string;
  mediumUrl?: string;
  largeUrl?: string;
  thumbnailUrl?: string;
  name?: string | null;
  /** Description du média (ce que dit le vocal, quand l'envoyer…), écrite dans le CRM ou sur Reveal. */
  description?: string | null;
  durationSeconds?: number | null;
  status?: string[];
};

export type LiveMsg = {
  message: { id: string; content: string; type: string; createdAt: string; deletedAt?: string | null; bundleId?: string };
  authorMessage?: { memberId?: string; displayName?: string };
  medias?: Media[];
  bundleWithMedias?: { bundle: { price: number; discountedPrice?: number; isPaid?: boolean }; medias?: Media[]; teasingMedias?: Media[]; teasingMedia?: Media };
  replyTo?: { id: string; content: string; authorDisplayName: string } | null;
  /** Réactions (emoji) : memberId = le fan, modelId = la modèle. */
  reactions?: { id: string; emoji: string; memberId?: string | null; modelId?: string | null }[];
  /** Ajouté par le CRM : message supprimé (texte conservé en base). */
  crmDeleted?: { byFan: boolean; mediaCount?: number };
};

export type Script = { id: string; name: string; content: string; price: number | null; tags: string[]; medias: Media[]; sentCount: number; paidCount: number; paidTotal: number };

export type BoxInfo = { modelId: string; config: { enabled: boolean; count: number; names: string[] }; mine: number[]; perBox: Record<number, number> };
export type QueueResp = { items: (Conv & { box: number | null; relance?: { ppv: number | null; step: string | null; at: string | null } })[]; counts: Record<string, number>; allReply: number; totals: { reply: number; unread: number; all: number; newSubs?: number; relances?: number; pinned?: number; pinnedReply?: number; online?: number; handoff?: number }; boxes: BoxInfo | null; hidden?: string[] };

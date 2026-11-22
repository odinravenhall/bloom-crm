export type Role = "admin" | "manager" | "lead" | "chatter" | "model";
export type Me = { id: number; email: string; name: string; role: Role; avatar: string | null; discord_id: string | null };
export const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", lead: "Team leader", chatter: "Chatteur", model: "Modèle" };
/** Managers et admins : toutes les créatrices. */
export const seesAll = (r?: string | null) => r === "admin" || r === "manager";
/** Chiffres et équipe : admins, managers, team leaders. */
export const isBoss = (r?: string | null) => seesAll(r) || r === "lead";
/** Page d'arrivée selon le rôle. */
export const homeOf = (r?: string | null) => (r === "chatter" ? "/app/messagerie" : "/app");

export type Creator = { id: string; name: string; username: string | null; platform: string | null; avatar: string | null; ai: boolean | null };

export type Chat = {
  fanId: string;
  name: string;
  username: string | null;
  avatar: string | null;
  unread: number;
  ai: boolean;
  handoff: boolean;
  spent: number;
  subscribed: string | null;
  canSend: boolean;
  last: { text: string; at: string; fromCreator: boolean; media: number } | null;
};

export type Media = { id: string; type: string; thumb: string | null; full: string | null; duration: number | null; price?: number };

export type Message = {
  id: string;
  text: string;
  at: string;
  fromFan: boolean;
  by: { kind: "bloom" | "ai" | "auto" | "script" | "employee" | "creator"; name: string } | null;
  medias: Media[];
  price: number;
  paid: boolean;
  tip: boolean;
  read: boolean;
  reverted: boolean;
};

export type AiLog = { id: string; at: string; on: boolean | null; action: string; reason: string; by: string | null };

export type Fan = {
  fanId: string;
  name: string;
  username: string | null;
  avatar: string | null;
  ai: boolean;
  subscription: { status: string; since: string | null; renews: string | null; canceled: boolean; price: number } | null;
  spend: { net: number; gross: number; purchases: number; last: string | null };
  breakdown: { tips: number; subscriptions: number; messages: number; posts: number };
  lists: string[];
  lastPpv: string | null;
};

type Part = { v: number; d: number | null };
export type Revenue = { total: Part; messages: Part; tips: Part; subscriptions: Part; posts: Part; newSubs: Part; chart: { date: string; v: number }[]; currency: string };
export type Count = { n: number | null; more: boolean };
export type Sale = { id: string; type: string; at: string; price: string; fan: string | null; fanId: string | null; creatorId: string; creator: string };
export type Activity = { fanIn: number; ai: number; team: number; auto: number; ppv: number; ppvValue: number; tips: number; fans: number };
export type DashCreator = Creator & {
  live: boolean;
  unread: Count;
  handoff: Count;
  aiOff: Count;
  recent: Chat[];
  revenue: Revenue | { error: string } | null;
  today: Activity | null;
  week: Activity | null;
};
export type Dashboard = { period: string; start: string; end: string; revenue: Revenue | { error: string } | null; sales: Sale[]; creators: DashCreator[]; at: number };
export const okRev = (r: Revenue | { error: string } | null | undefined): r is Revenue => !!r && !("error" in r);

/** Revenus officiels (Infloww / MyPulse) d'une période. Montants en centimes ; eur = converti en euros. */
export type RevenueCreator = {
  creatorId: string;
  account: string | null;
  platform: "onlyfans" | "mym" | null;
  currency: "USD" | "EUR" | null;
  net: number;
  eur: number;
  prev: number;
  provisional: number;
  sales: number;
  byType: Record<string, number>;
  byOrigin: Record<string, number>;
};
export type RevenueSale = { id: string; creatorId: string; at: string; type: string; net: number; currency: string; fan: string | null; fanId: string | null; origin: string; by: string | null; provisional: boolean };
export type RevenueR = {
  from: string;
  to: string;
  total: number;
  prev: number;
  provisional: number;
  sales: number;
  buyers: number;
  byType: Record<string, number>;
  byOrigin: Record<string, number>;
  days: { day: string; onlyfans: number; mym: number; provisional: number }[];
  creators: RevenueCreator[];
  recent: RevenueSale[];
  unmapped: string[];
};

/** Page Équipe. */
export type Member = {
  id: number;
  name: string;
  role: Role;
  avatar: string | null;
  discord: boolean;
  active: boolean;
  allCreators: boolean;
  creators: string[];
  online: boolean;
  seenAt: number | null;
  on: { creatorId: string | null; fanId: string | null; page: string | null } | null;
  today: { msgs: number; ppv: number; ppvValue: number; last: number | null };
  lastSent: number | null;
  sold: { currency: string; n: number; net: number }[];
};
/** Quelqu'un d'autre sur la même créatrice (messagerie). */
export type Presence = { userId: number; name: string; avatar: string | null; fanId: string | null };

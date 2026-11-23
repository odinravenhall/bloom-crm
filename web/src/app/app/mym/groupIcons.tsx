import {
  Award, Bell, CircleDollarSign, Crown, Flame, Gamepad2, Gift, Heart, Laugh, Lightbulb, Mail, Medal, MessageCircle, MessageSquare, Palette, Smile, Star, Trophy,
  UserCheck, UserPlus, UserRound, UsersRound, VolumeX, Users, type LucideIcon,
} from "lucide-react";

// Les 24 icônes des groupes (dans l'ordre de MyPulse). Clés gardées dans la base (`fan_lists.icon`).
export const GROUP_ICONS: [string, LucideIcon][] = [
  ["user", UserRound], ["user-star", UserCheck], ["user-heart", UserPlus], ["users", Users], ["group", UsersRound], ["dollar", CircleDollarSign], ["heart", Heart], ["star", Star],
  ["trophy", Trophy], ["medal", Medal], ["award", Award], ["crown", Crown], ["flame", Flame], ["mute", VolumeX], ["game", Gamepad2], ["palette", Palette],
  ["gift", Gift], ["chat", MessageCircle], ["msg", MessageSquare], ["mail", Mail], ["bell", Bell], ["smile", Smile], ["laugh", Laugh], ["idea", Lightbulb],
];
const MAP = new Map<string, LucideIcon>([...GROUP_ICONS, ["gem", Award], ["zap", Flame], ["sparkles", Star]]);
export const groupIcon = (k: string | null | undefined): LucideIcon => MAP.get(k || "") ?? UsersRound;

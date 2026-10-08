// Ícones só desta tela; o resto vem do conjunto compartilhado (../Icon).
import { ArrowDown, ArrowLeft, BellOff, Calendar, CircleX, RefreshCw, Server, ShieldAlert, Siren, Sunrise, UsersRound, type LucideIcon } from "lucide-react";
import { Icon } from "../Icon";

const LOCAL: Record<string, LucideIcon> = {
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "bell-off": BellOff,
  calendar: Calendar,
  "circle-x": CircleX,
  "refresh-cw": RefreshCw,
  server: Server,
  "shield-alert": ShieldAlert,
  siren: Siren,
  sunrise: Sunrise,
  "users-round": UsersRound,
};

export function NIcon({ name, size = 16, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  const C = LOCAL[name];
  if (!C) return <Icon name={name} size={size} color={color} className={className} />;
  return <C size={size} color={color} className={className} aria-hidden="true" style={{ flex: "none" }} />;
}

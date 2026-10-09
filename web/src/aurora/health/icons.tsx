// Ícones só desta tela; o resto vem do conjunto compartilhado (../Icon).
import { ArrowDown, CircleX, HardDrive, Lightbulb, MessageSquareText, Network, Siren, TrendingUp, type LucideIcon } from "lucide-react";
import { Icon } from "../Icon";

const LOCAL: Record<string, LucideIcon> = {
  "arrow-down": ArrowDown,
  "circle-x": CircleX,
  "hard-drive": HardDrive,
  lightbulb: Lightbulb,
  "message-square-text": MessageSquareText,
  network: Network,
  siren: Siren,
  "trending-up": TrendingUp,
};

export function HIcon({ name, size = 16, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  const C = LOCAL[name];
  if (!C) return <Icon name={name} size={size} color={color} className={className} />;
  return <C size={size} color={color} className={className} aria-hidden="true" style={{ flex: "none" }} />;
}

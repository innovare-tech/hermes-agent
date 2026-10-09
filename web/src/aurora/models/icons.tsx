// Ícones só desta tela; o resto vem do conjunto compartilhado (../Icon).
import { Bell, Boxes, Braces, Cpu, CornerDownRight, CircleDashed, CircleX, EyeOff, ListChecks, PlugZap, Shrink, Split, TrendingUp, Type, Wallet, type LucideIcon } from "lucide-react";
import { Icon } from "../Icon";

const LOCAL: Record<string, LucideIcon> = {
  bell: Bell,
  boxes: Boxes,
  braces: Braces,
  cpu: Cpu,
  "corner-down-right": CornerDownRight,
  "circle-dashed": CircleDashed,
  "circle-x": CircleX,
  "eye-off": EyeOff,
  "list-checks": ListChecks,
  "plug-zap": PlugZap,
  shrink: Shrink,
  split: Split,
  "trending-up": TrendingUp,
  type: Type,
  wallet: Wallet,
};

export function MIcon({ name, size = 16, color, className, spin }: { name: string; size?: number; color?: string; className?: string; spin?: boolean }) {
  const C = LOCAL[name];
  const cls = [className, spin ? "au-spin" : ""].filter(Boolean).join(" ") || undefined;
  if (!C) return <Icon name={name} size={size} color={color} className={cls} />;
  return <C size={size} color={color} className={cls} aria-hidden="true" style={{ flex: "none" }} />;
}

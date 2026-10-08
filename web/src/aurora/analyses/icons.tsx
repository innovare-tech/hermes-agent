// Ícones só desta tela; o resto vem do conjunto compartilhado (../Icon).
import { ArrowDown, ArrowUpRight, Building2, CircleAlert, CircleDashed, ClipboardCheck, CloudOff, Coffee, Ear, Frown, Gauge, Heart, Info, Lightbulb, MessagesSquare, Minus, SearchX, Siren, Tag, ThumbsDown, Video, type LucideIcon } from "lucide-react";
import { Icon } from "../Icon";

const LOCAL: Record<string, LucideIcon> = {
  "arrow-down": ArrowDown,
  "arrow-up-right": ArrowUpRight,
  "building-2": Building2,
  "circle-alert": CircleAlert,
  "circle-dashed": CircleDashed,
  "clipboard-check": ClipboardCheck,
  "cloud-off": CloudOff,
  coffee: Coffee,
  ear: Ear,
  frown: Frown,
  gauge: Gauge,
  heart: Heart,
  info: Info,
  lightbulb: Lightbulb,
  "messages-square": MessagesSquare,
  minus: Minus,
  "search-x": SearchX,
  siren: Siren,
  tag: Tag,
  "thumbs-down": ThumbsDown,
  video: Video,
};

export function AIcon({ name, size = 16, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  const C = LOCAL[name];
  if (!C) return <Icon name={name} size={size} color={color} className={className} />;
  return <C size={size} color={color} className={className} aria-hidden="true" style={{ flex: "none" }} />;
}

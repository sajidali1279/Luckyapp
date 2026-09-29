// Draws a lucide icon in place of an emoji. Many pages keep an emoji in their data (a category, a stat, a template) as its icon;
// passing it through <Glyph e={...} /> shows one consistent icon set instead, without rewriting every data list.
import type { CSSProperties } from 'react';
import {
  CheckCircle2, Store, Hourglass, AlertTriangle, Fuel, ClipboardList, Receipt, Trash2, Gift, CalendarDays, Megaphone, Hand, Package,
  Tag, Search, MapPin, Printer, Globe, Coins, Pencil, RefreshCw, CreditCard, Star, Settings, Trophy, Link, FileText, Image, Banknote,
  ShoppingCart, UtensilsCrossed, ShoppingBag, XCircle, Ban, OctagonX, Rocket, Snowflake, Salad, MessageSquare, Medal, Siren, Truck,
  Flame, BarChart3, User, KeyRound, Building2, Clock, Users, Smartphone, Lock, FolderOpen, DollarSign, Zap, Bell, Crown, Building, Save,
  Circle, Handshake, Pin, Sparkles, Brush, Sunrise, Puzzle, Plus, Send, Timer, TrendingUp, TrendingDown, Award, Palmtree, Gem,
  ShieldAlert, HardHat, CupSoda, Square, Minus, Upload, Calendar, FlaskConical, Bot, Mail, Construction, Camera, Sun, Moon, ShieldCheck,
  Wifi, Cookie, ScrollText, NotebookPen, Radio, Scale, BookOpen, Wrench, Flag, Lightbulb, Ruler, Inbox, Coffee, Sprout, Ticket, Compass,
  PartyPopper, Sandwich, Wallet, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  '✅': CheckCircle2, '🏪': Store, '⏳': Hourglass, '⌛': Hourglass, '⚠': AlertTriangle, '⛽': Fuel, '📋': ClipboardList, '🧾': Receipt,
  '🗑': Trash2, '🎁': Gift, '📅': CalendarDays, '🗓': Calendar, '📢': Megaphone, '📣': Megaphone, '🙋': Hand, '✋': Hand, '📦': Package,
  '🏷': Tag, '🔍': Search, '🔎': Search, '📍': MapPin, '🖨': Printer, '🌐': Globe, '💰': Coins, '✏': Pencil, '🔄': RefreshCw,
  '💳': CreditCard, '⭐': Star, '★': Star, '⚙': Settings, '🏆': Trophy, '🔗': Link, '📄': FileText, '📜': ScrollText, '🖼': Image,
  '💵': Banknote, '💲': DollarSign, '🛒': ShoppingCart, '🌮': UtensilsCrossed, '🌭': Sandwich, '🛍': ShoppingBag, '❌': XCircle,
  '🚫': Ban, '⛔': OctagonX, '🚀': Rocket, '🧊': Snowflake, '🥗': Salad, '💬': MessageSquare, '🥇': Medal, '🥈': Medal, '🥉': Medal,
  '🏅': Award, '🚨': Siren, '🚛': Truck, '🔥': Flame, '📊': BarChart3, '📈': TrendingUp, '📉': TrendingDown, '👤': User, '👥': Users,
  '🔑': KeyRound, '🏢': Building2, '🏬': Building, '🕐': Clock, '⏱': Timer, '📱': Smartphone, '🔒': Lock, '🔐': Lock, '🗂': FolderOpen,
  '⚡': Zap, '🔔': Bell, '👑': Crown, '💾': Save, '🟢': Circle, '🔴': Circle, '🔵': Circle, '🤝': Handshake, '📌': Pin, '🧹': Brush,
  '🌅': Sunrise, '🧩': Puzzle, '➕': Plus, '➖': Minus, '📨': Send, '📤': Upload, '📩': Mail, '🏖': Palmtree, '💎': Gem, '🔞': ShieldAlert,
  '🥤': CupSoda, '☕': Coffee, '👷': HardHat, '⏹': Square, '🧪': FlaskConical, '🤖': Bot, '💼': Wallet, '🚧': Construction,
  '📷': Camera, '☀': Sun, '🌙': Moon, '📶': Wifi, '🍪': Cookie, '📝': NotebookPen, '📡': Radio, '⚖': Scale, '📖': BookOpen,
  '🛠': Wrench, '🔧': Wrench, '🏁': Flag, '💡': Lightbulb, '📐': Ruler, '📭': Inbox, '✨': Sparkles, '🌱': Sprout, '🎟': Ticket,
  '🧭': Compass, '🎉': PartyPopper, '👋': Hand, '🛡': ShieldCheck,
};

/** The lucide icon for an emoji, or undefined when there is none. */
export function glyphFor(e?: string | null): LucideIcon | undefined {
  if (!e) return undefined;
  return MAP[e.replace(/️/g, '').trim()];
}

export default function Glyph({ e, size = 16, color, style, strokeWidth }: { e?: string | null; size?: number; color?: string; style?: CSSProperties; strokeWidth?: number }) {
  const Icon = glyphFor(e);
  if (!Icon) return null;
  return <Icon size={size} color={color} style={{ flexShrink: 0, ...style }} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/**
 * Textos de la página «Qué es Keirost». Datos aparte de la maqueta (AboutPage)
 * para poder retocar el contenido sin tocar la composición. Los textos son
 * claves de i18n (`app.aboutPage.*`): AboutPage los traduce al pintar.
 */
import {
  Bot,
  ClipboardList,
  Globe,
  Landmark,
  Package,
  Puzzle,
  ShoppingCart,
  Target,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Lo que pasa en la cinta que se desplaza bajo la portada. */
export const MARQUEE_ITEMS = [
  'app.aboutPage.marquee.m0',
  'app.aboutPage.marquee.m1',
  'app.aboutPage.marquee.m2',
  'app.aboutPage.marquee.m3',
  'app.aboutPage.marquee.m4',
  'app.aboutPage.marquee.m5',
  'app.aboutPage.marquee.m6',
  'app.aboutPage.marquee.m7',
  'app.aboutPage.marquee.m8',
  'app.aboutPage.marquee.m9',
  'app.aboutPage.marquee.m10',
  'app.aboutPage.marquee.m11',
  'app.aboutPage.marquee.m12',
  'app.aboutPage.marquee.m13',
  'app.aboutPage.marquee.m14',
  'app.aboutPage.marquee.m15',
];

export interface AboutModule {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Tarjeta grande y destacada en la rejilla (2×2). */
  featured?: boolean;
  /** Ocupa dos columnas: con la destacada, cuadra la rejilla de 4 en filas completas. */
  wide?: boolean;
}

export const MODULES: AboutModule[] = [
  {
    icon: ShoppingCart,
    title: 'app.aboutPage.modules.sales.title',
    text: 'app.aboutPage.modules.sales.text',
    featured: true,
  },
  {
    icon: Package,
    title: 'app.aboutPage.modules.warehouse.title',
    text: 'app.aboutPage.modules.warehouse.text',
  },
  {
    icon: Target,
    title: 'app.aboutPage.modules.crm.title',
    text: 'app.aboutPage.modules.crm.text',
  },
  {
    icon: Landmark,
    title: 'app.aboutPage.modules.accounting.title',
    text: 'app.aboutPage.modules.accounting.text',
  },
  {
    icon: Users,
    title: 'app.aboutPage.modules.people.title',
    text: 'app.aboutPage.modules.people.text',
  },
  {
    icon: Truck,
    title: 'app.aboutPage.modules.logistics.title',
    text: 'app.aboutPage.modules.logistics.text',
  },
  {
    icon: ClipboardList,
    title: 'app.aboutPage.modules.forms.title',
    text: 'app.aboutPage.modules.forms.text',
  },
  {
    icon: Globe,
    title: 'app.aboutPage.modules.web.title',
    text: 'app.aboutPage.modules.web.text',
    wide: true,
  },
  {
    icon: Bot,
    title: 'app.aboutPage.modules.ai.title',
    text: 'app.aboutPage.modules.ai.text',
    wide: true,
  },
  {
    icon: Puzzle,
    title: 'app.aboutPage.modules.plugins.title',
    text: 'app.aboutPage.modules.plugins.text',
    wide: true,
  },
];

/** Un documento de principio a fin. */
export const DOC_CHAIN = [
  {
    id: 'quote',
    label: 'app.aboutPage.chain.quote.label',
    description: 'app.aboutPage.chain.quote.description',
  },
  {
    id: 'order',
    label: 'app.aboutPage.chain.order.label',
    description: 'app.aboutPage.chain.order.description',
  },
  {
    id: 'delivery',
    label: 'app.aboutPage.chain.delivery.label',
    description: 'app.aboutPage.chain.delivery.description',
  },
  {
    id: 'invoice',
    label: 'app.aboutPage.chain.invoice.label',
    description: 'app.aboutPage.chain.invoice.description',
  },
  {
    id: 'payment',
    label: 'app.aboutPage.chain.payment.label',
    description: 'app.aboutPage.chain.payment.description',
  },
];

export const STATS = [
  { value: 16, label: 'app.aboutPage.stats.s0' },
  { value: 8, label: 'app.aboutPage.stats.s1' },
  { value: 100, suffix: '%', label: 'app.aboutPage.stats.s2' },
  { value: 1, label: 'app.aboutPage.stats.s3' },
];

export const FAQ = [
  {
    key: 'free',
    title: 'app.aboutPage.faq.free.title',
    content: 'app.aboutPage.faq.free.content',
  },
  {
    key: 'data',
    title: 'app.aboutPage.faq.data.title',
    content: 'app.aboutPage.faq.data.content',
  },
  {
    key: 'companies',
    title: 'app.aboutPage.faq.companies.title',
    content: 'app.aboutPage.faq.companies.content',
  },
  {
    key: 'mobile',
    title: 'app.aboutPage.faq.mobile.title',
    content: 'app.aboutPage.faq.mobile.content',
  },
  {
    key: 'extend',
    title: 'app.aboutPage.faq.extend.title',
    content: 'app.aboutPage.faq.extend.content',
  },
  {
    key: 'ai',
    title: 'app.aboutPage.faq.ai.title',
    content: 'app.aboutPage.faq.ai.content',
  },
];

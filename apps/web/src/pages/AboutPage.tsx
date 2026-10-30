import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  BentoGrid,
  BentoItem,
  Button,
  CountUp,
  GradientText,
  Marquee,
  Stepper,
  TextReveal,
} from '@openfactu/ui';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { AuroraBackdrop } from '../components/login/AuroraBackdrop';
import { BrandShowcase } from '../components/login/BrandShowcase';
import { useIsMobile } from '../hooks/useMediaQuery';
import { DOC_CHAIN, FAQ, MARQUEE_ITEMS, MODULES, STATS } from './about/aboutContent';
import { useI18n } from '@/i18n/I18nContext';

/**
 * «Qué es Keirost»: presentación pública (sin sesión) que enlaza el login del
 * móvil. También es escaparate de @openfactu/ui: BentoGrid, Marquee, Stepper,
 * CountUp, Accordion y los efectos de texto, con los colores del tema.
 * El contenido vive en `about/aboutContent.ts`.
 */

const Section: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  intro?: string;
  children: React.ReactNode;
}> = ({ eyebrow, title, intro, children }) => (
  <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20 space-y-8">
    <div className="max-w-2xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg-default">
        {title}
      </h2>
      {intro && <p className="text-base leading-relaxed text-fg-muted">{intro}</p>}
    </div>
    {children}
  </section>
);

export const AboutPage: React.FC = () => {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const toLogin = () => navigate('/login');
  const { t } = useI18n();

  return (
    <div className="min-h-dvh bg-bg-app">
      {/* ── Portada, sobre el color de la marca ── */}
      <header className="relative flex min-h-[85dvh] flex-col overflow-hidden bg-primary text-primary-fg">
        <AuroraBackdrop />
        <div className="relative flex items-center justify-between p-6 sm:px-12">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={toLogin}
            className="px-0 !text-primary-fg"
          >
            <ArrowLeft size={14} /> {t('app.aboutPage.backToLogin')}
          </Button>
        </div>
        <div className="relative mx-auto mt-auto w-full max-w-5xl p-6 pb-12 sm:p-12">
          <BrandShowcase />
        </div>
      </header>

      {/* ── Cinta con todo lo que hace ── */}
      <div className="border-y border-border-default bg-bg-card py-4">
        <Marquee speed={40} fade pauseOnHover label={t('app.aboutPage.marqueeLabel')}>
          {MARQUEE_ITEMS.map((item) => (
            <span key={item} className="flex items-center gap-3 text-sm font-medium text-fg-body">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {t(item)}
            </span>
          ))}
        </Marquee>
      </div>

      {/* ── Módulos ── */}
      <Section
        eyebrow={t('app.aboutPage.modulesEyebrow')}
        title={
          <>
            <TextReveal text={t('app.aboutPage.modulesTitle1')} by="word" />{' '}
            <GradientText animated>{t('app.aboutPage.modulesTitle2')}</GradientText>
          </>
        }
        intro={t('app.aboutPage.modulesIntro')}
      >
        <BentoGrid columns={4} rowHeight={170}>
          {MODULES.map(({ icon: Icon, title, text, featured, wide }) => (
            <BentoItem
              key={title}
              icon={<Icon size={18} />}
              title={t(title)}
              description={t(text)}
              featured={featured}
              colSpan={featured || wide ? 2 : 1}
              rowSpan={featured ? 2 : 1}
            />
          ))}
        </BentoGrid>
      </Section>

      {/* ── Un documento de principio a fin ── */}
      <div className="bg-bg-card border-y border-border-default">
        <Section
          eyebrow={t('app.aboutPage.chainEyebrow')}
          title={t('app.aboutPage.chainTitle')}
          intro={t('app.aboutPage.chainIntro')}
        >
          <Stepper
            aria-label={t('app.aboutPage.chainAria')}
            orientation={mobile ? 'vertical' : 'horizontal'}
            current={DOC_CHAIN.length}
            steps={DOC_CHAIN.map((s) => ({
              ...s,
              label: t(s.label),
              description: t(s.description),
            }))}
          />
        </Section>
      </div>

      {/* ── Cifras ── */}
      <Section eyebrow={t('app.aboutPage.statsEyebrow')} title={t('app.aboutPage.statsTitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--k-radius-lg)] border border-border-default bg-bg-card p-6 space-y-2"
            >
              <p className="font-display text-5xl font-bold tracking-tight text-fg-default">
                <CountUp value={s.value} />
                {s.suffix}
              </p>
              <p className="text-sm leading-snug text-fg-muted">{t(s.label)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Preguntas ── */}
      <div className="bg-bg-card border-y border-border-default">
        <Section eyebrow={t('app.aboutPage.faqEyebrow')} title={t('app.aboutPage.faqTitle')}>
          <Accordion
            type="single"
            defaultOpenKeys={[FAQ[0].key]}
            items={FAQ.map((f) => ({
              key: f.key,
              title: t(f.title),
              content: <p className="text-sm leading-relaxed text-fg-muted">{t(f.content)}</p>,
            }))}
          />
        </Section>
      </div>

      {/* ── Cierre ── */}
      <footer className="relative overflow-hidden bg-primary text-primary-fg">
        <AuroraBackdrop />
        <div className="relative mx-auto w-full max-w-5xl px-6 py-16 sm:py-20 space-y-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight !text-primary-fg">
            {t('app.aboutPage.ctaTitle')}
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-primary-fg/75">
            {t('app.aboutPage.ctaBody')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="accent" onClick={toLogin}>
              {t('app.aboutPage.goToLogin')} <ArrowRight size={16} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-primary-fg/30 !text-primary-fg hover:border-primary-fg/60"
              onClick={() => window.open('https://docs.keirost.es', '_blank', 'noopener')}
            >
              <BookOpen size={16} /> {t('app.login.docs')}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AboutPage;

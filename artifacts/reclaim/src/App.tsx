import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthProvider, useSession } from '@/hooks/use-auth';
import { Burst, CountUp, FadeIn, MotionRoot, Particles, Pop, Rise, Tilt } from '@/components/motion';
import { AvatarArt, AvatarPicker } from '@/components/avatars';
import { AnimatePresence, motion } from 'framer-motion';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetBillingStatusQueryKey, getGetHistoryQueryKey, getGetMeQueryKey, getGetRecommendationsQueryKey,
  getGetSummaryQueryKey, getGetWeeklySummaryQueryKey, useCreateBillingCheckout, useCreateBillingPortal,
  useCreateCompletion, useCreateManualEntry, useGetBillingProducts, useGetBillingStatus, useGetHistory,
  useGetMe, useGetRecommendations, useGetSummary, useGetWeeklySummary, useListActivities, useRestoreBilling, useUpdateMe,
} from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, Clock3, CreditCard,
  Feather, Flame, History as HistoryIcon, Home, Leaf, LogOut, Menu, Moon, Pause, Palette, Play, Plus,
  RefreshCw, Settings as SettingsIcon, Sparkles, Sun, Trophy, UserRound, Users, WalletCards,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function formatMoney(amount: number | null | undefined, currency = 'usd') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}
function prettyDate(date: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date)); }
function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(' '); }

function Logo({ light = false }: { light?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
    <img src={`${basePath}/logo.svg`} alt="Reclaim" className="h-9 w-9 rounded-xl" data-testid="img-logo" />
    <span className={cx('font-display text-xl font-semibold tracking-tight', light ? 'text-[#F6F4EC]' : 'text-foreground')}>reclaim</span>
  </Link>;
}

function Button({ children, onClick, href, variant = 'primary', className = '', disabled = false, testId = 'button-action' }: {
  children: ReactNode; onClick?: () => void; href?: string; variant?: 'primary' | 'quiet' | 'outline' | 'coral'; className?: string; disabled?: boolean; testId?: string;
}) {
  const styles = { primary: 'bg-[#163D3B] text-[#F6F4EC] hover:bg-[#285A56]', coral: 'bg-[#DD765D] text-[#FFF9F0] hover:bg-[#C86650]', quiet: 'bg-transparent text-muted-foreground hover:bg-muted', outline: 'border border-border text-foreground hover:bg-muted' };
  const classes = cx('relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-5 py-3 text-sm font-semibold transition-all duration-300 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const spawnRipple = (e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples(rs => [...rs.slice(-4), { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    window.setTimeout(() => setRipples(rs => rs.filter(q => q.id !== id)), 650);
  };
  const rippleLayer = ripples.map(q => <motion.span key={q.id} className="pointer-events-none absolute rounded-full bg-white/50" style={{ left: q.x - 10, top: q.y - 10, width: 20, height: 20 }} initial={{ scale: 0.3, opacity: 0.7 }} animate={{ scale: 6, opacity: 0 }} transition={{ duration: 0.75, ease: 'easeOut' }} />);
  if (href) return <Link href={href} onClick={onClick} onPointerDown={spawnRipple} className={classes} data-testid={testId}>{rippleLayer}{children}</Link>;
  return <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onClick} onPointerDown={spawnRipple} disabled={disabled} className={classes} data-testid={testId}>{rippleLayer}{children}</motion.button>;
}

function PartnerBadge() {
  return <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center justify-center rounded-full bg-background/70 p-1.5 text-muted-foreground" role="img" aria-label="Needs a partner" data-testid="badge-partner"><Users size={12} /></span></TooltipTrigger><TooltipContent side="top"><p>Needs a partner</p></TooltipContent></Tooltip>;
}
function Loading({ label = 'Gathering your space' }: { label?: string }) {
  return <div className="space-y-4" data-testid="status-loading">
    <div className="h-7 w-44 rounded-full animate-shimmer" /><div className="h-28 rounded-3xl animate-shimmer" /><p className="text-sm text-muted-foreground">{label}</p>
  </div>;
}
function TargetBar({ label, have, goal, testId }: { label: string; have: number; goal?: number | null; testId: string }) {
  if (goal == null || goal <= 0) return null;
  const pct = Math.min(100, Math.round((have / goal) * 100));
  return <div data-testid={testId}><div className="flex items-baseline justify-between text-sm"><span className="font-semibold text-foreground">{label}</span><span className="font-mono text-xs text-muted-foreground">{have} of {goal} min</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#DD765D] transition-all duration-700" style={{ width: `${pct}%` }} /></div></div>;
}
function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="rounded-3xl border border-[#E9C7BB] bg-[#FFF0E9] p-7 text-center" data-testid="status-error">
    <p className="font-display text-2xl text-[#7C463D]">A small pause.</p><p className="mt-2 text-sm text-[#7C6B64]">We couldn’t reach your reclaimed time just now.</p>
    {onRetry && <Button onClick={onRetry} variant="outline" className="mt-5" testId="button-retry">Try again</Button>}
  </div>;
}
function EmptyState({ title, copy, href = '/choose-time' }: { title: string; copy: string; href?: string }) {
  return <div className="rounded-3xl border border-dashed border-[#CEC7B9] bg-muted p-10 text-center" data-testid="status-empty">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7E2D5] text-[#DD765D]"><Leaf size={21} /></div>
    <h3 className="font-display text-2xl text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
    <Button href={href} className="mt-6" testId="button-empty-cta">Find a small beginning <ArrowRight size={16} /></Button>
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, signOut } = useSession();
  const me = useGetMe();
  const nav = [{ href: '/app', label: 'Today', icon: Home }, { href: '/history', label: 'History', icon: HistoryIcon }, { href: '/weekly-summary', label: 'Your rhythm', icon: BarChart3 }];
  return <div className="min-h-[100dvh] bg-background text-foreground">
    <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#163D3B] px-6 py-7 transition-transform duration-300 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')} data-testid="navigation-sidebar">
      <Logo light />
      <div className="mt-14 flex-1 space-y-1">
        <p className="mb-4 px-3 font-mono text-[10px] uppercase tracking-[.2em] text-[#9FB1A6]">Your space</p>
        {nav.map(({ href, label, icon: Icon }) => { const active = location === href; return <Link key={href} href={href} onClick={() => setOpen(false)} className={cx('relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors', active ? 'font-semibold text-[#F6F4EC]' : 'text-[#B3C5B8] hover:bg-[#214B48] hover:text-[#F6F4EC]')} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}>{active && <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-xl bg-[#285A56]" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}<span className="relative z-10 flex items-center gap-3"><Icon size={17} strokeWidth={1.8} />{label}</span></Link>; })}
        <div className="my-7 h-px bg-[#2D5854]" />
        <Link href="/choose-time" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#B3C5B8] hover:bg-[#214B48] hover:text-[#F6F4EC]" data-testid="link-nav-new-activity"><Plus size={17} />Make room for something</Link>
      </div>
      <div className="space-y-1 border-t border-[#2D5854] pt-5">
        <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#B3C5B8] hover:bg-[#214B48] hover:text-[#F6F4EC]" data-testid="link-nav-settings"><SettingsIcon size={17} />Settings</Link>
        <button type="button" onClick={() => void signOut().then(() => { queryClient.clear(); setLocation('/'); })} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[#B3C5B8] hover:bg-[#214B48] hover:text-[#F6F4EC]" data-testid="button-sign-out"><LogOut size={17} />Sign out</button>
        <div className="flex items-center gap-3 px-3 pt-5"><div data-testid="text-avatar"><AvatarArt id={me.data?.avatarId} size={32} /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#F6F4EC]" data-testid="text-user-name">{me.data?.firstName || 'Your account'}</p><p className="truncate text-[11px] text-[#9FB1A6]">{user?.email}</p></div></div>
      </div>
    </aside>
    {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-[#163D3B]/30 lg:hidden" data-testid="button-close-navigation" />}
    <main className="min-h-[100dvh] lg:pl-[248px]">
      <header className="flex items-center justify-between px-5 py-5 sm:px-10 lg:hidden"><button type="button" onClick={() => setOpen(true)} className="rounded-full p-2 hover:bg-[#E9E5DA]" data-testid="button-open-navigation"><Menu size={21} /></button><Logo /><Link href="/settings" className="rounded-full p-2 hover:bg-[#E9E5DA]" data-testid="link-mobile-settings"><UserRound size={19} /></Link></header>
      {children}
    </main>
  </div>;
}

function PageFrame({ eyebrow, title, copy, children, action }: { eyebrow?: string; title: string; copy?: string; children: ReactNode; action?: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-5 pb-16 pt-5 sm:px-10 lg:px-14 lg:pt-14">
    <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div>{eyebrow && <p className="font-mono text-[10px] uppercase tracking-[.24em] text-[#DD765D]">{eyebrow}</p>}<h1 className="mt-2 font-display text-4xl leading-tight tracking-[-.03em] text-foreground sm:text-5xl" data-testid="text-page-title">{title}</h1>{copy && <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">{copy}</p>}</div>{action}</div><FadeIn>{children}</FadeIn>
  </div>;
}

function Landing() {
  return <div className="min-h-[100dvh] overflow-hidden bg-background text-foreground reclaim-grain">
    <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10"><Logo /><div className="flex items-center gap-2"><Button href="/sign-in" variant="quiet" className="px-4 py-2.5" testId="link-landing-sign-in">Sign in</Button><Button href="/sign-up" variant="primary" className="px-4 py-2.5" testId="link-landing-sign-up">Start gently</Button></div></nav>
    <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-14 sm:px-10 md:grid-cols-[1.02fr_.98fr] md:pb-28 md:pt-24">
      <div className="relative z-10 animate-rise"><p className="font-mono text-[11px] uppercase tracking-[.28em] text-[#DD765D]">A kinder way to spend a minute</p><motion.h1 className="mt-6 max-w-2xl font-display text-6xl leading-[.98] tracking-[-.045em] text-foreground sm:text-7xl lg:text-[88px]" initial={{ opacity: 0, filter: 'blur(12px)', y: 18 }} animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>Make a little<br /><span className="text-[#DD765D]">room.</span></motion.h1><p className="mt-7 max-w-md text-lg leading-8 text-muted-foreground">Reclaim turns the minutes that slip through the day into something that feels like yours again.</p><div className="mt-9 flex flex-wrap gap-3"><Button href="/sign-up" variant="coral" className="px-6" testId="button-landing-start">Find your next small thing <ArrowRight size={17} /></Button><Button href="/sign-in" variant="quiet" testId="button-landing-return">I already have a space</Button></div></div>
      <div className="relative min-h-[390px] animate-rise [animation-delay:120ms]"><Particles /><div className="absolute right-0 top-3 h-[300px] w-[300px] rounded-full bg-[#E9B979]/60 blur-[1px] sm:h-[390px] sm:w-[390px]" /><div className="absolute right-8 top-10 h-[285px] w-[285px] rounded-full border border-[#163D3B]/15 sm:h-[370px] sm:w-[370px]" /><div className="absolute left-8 top-24 h-44 w-52 -rotate-6 rounded-[2rem] bg-[#163D3B] p-6 text-[#F6F4EC] soft-shadow sm:left-16"><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-[#B3C5B8]">TODAY</span><Leaf size={17} className="text-[#DD765D]" /></div><p className="mt-10 font-display text-5xl">34</p><p className="mt-1 text-sm text-[#B3C5B8]">minutes reclaimed</p></div><div className="absolute bottom-5 right-3 w-64 rotate-3 rounded-[2rem] border border-border bg-card p-6 soft-shadow sm:right-10"><p className="font-mono text-[10px] uppercase tracking-widest text-[#DD765D]">A thought for now</p><p className="mt-4 font-display text-2xl leading-tight">Step outside and notice three blue things.</p><div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} />10 minutes · low energy</div></div></div>
    </section>
    <section className="border-y border-[#DDD8CC] bg-muted px-6 py-16 sm:px-10"><div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[.8fr_1.2fr] md:items-center"><div><p className="font-mono text-[10px] uppercase tracking-[.24em] text-[#DD765D]">No streaks. No score.</p><h2 className="mt-3 font-display text-4xl leading-tight tracking-[-.03em]">A soft landing<br />for spare time.</h2></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-background p-5"><Clock3 size={19} className="text-[#DD765D]" /><h3 className="mt-10 font-semibold">Choose your window</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Five minutes counts. So does an hour.</p></div><div className="rounded-2xl bg-background p-5"><Sparkles size={19} className="text-[#DD765D]" /><h3 className="mt-10 font-semibold">Meet your mood</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Suggestions tuned to how you actually feel.</p></div><div className="rounded-2xl bg-background p-5"><Trophy size={19} className="text-[#DD765D]" /><h3 className="mt-10 font-semibold">Keep the feeling</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Watch meaningful minutes quietly add up.</p></div></div></div></section>
    <section className="mx-auto max-w-7xl px-6 py-20 text-center sm:px-10 md:py-28"><p className="font-display text-4xl leading-tight tracking-[-.03em] sm:text-6xl">“The best part of my day<br /><span className="text-[#DD765D]">doesn’t need a plan.</span>”</p><p className="mt-7 font-mono text-[10px] uppercase tracking-[.25em] text-muted-foreground">A quiet tool for a full life</p></section>
    <footer className="flex flex-col justify-between gap-3 border-t border-[#DDD8CC] px-6 py-7 text-xs text-muted-foreground sm:flex-row sm:px-10"><Logo /><span>© 2025 Reclaim · time, returned.</span><Link href="/pricing" className="hover:text-[#DD765D]" data-testid="link-landing-pricing">Plans & billing</Link></footer>
  </div>;
}

function Dashboard() {
  const me = useGetMe(); const summary = useGetSummary(); const manual = useCreateManualEntry(); const qc = useQueryClient();
  const [showManual, setShowManual] = useState(false); const [manualTitle, setManualTitle] = useState(''); const [manualMinutes, setManualMinutes] = useState('10'); const [manualCategory, setManualCategory] = useState('Rest');
  const firstName = me.data?.firstName || 'there';
  const saveManual = () => { if (!manualTitle.trim() || Number(manualMinutes) < 1) return; manual.mutate({ data: { title: manualTitle, durationMinutes: Number(manualMinutes), category: manualCategory } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetHistoryQueryKey() }); setManualTitle(''); setShowManual(false); } }); };
  if (me.isLoading || summary.isLoading) return <AppShell><PageFrame title="A moment for you"><Loading /></PageFrame></AppShell>;
  if (me.isError || summary.isError) return <AppShell><PageFrame title="A moment for you"><ErrorState onRetry={() => { me.refetch(); summary.refetch(); }} /></PageFrame></AppShell>;
  const s = summary.data; const categories = s?.categories || [];
  return <AppShell><PageFrame eyebrow="Your space" title={`Good to see you, ${firstName}.`} copy="What would feel good to give yourself today?" action={<Button href="/choose-time" variant="coral" testId="button-dashboard-reclaim">Reclaim some time <ArrowRight size={16} /></Button>}>
    <div className="grid gap-5 md:grid-cols-[1.25fr_.75fr]"><section className="relative overflow-hidden rounded-[2rem] bg-[#163D3B] p-7 text-[#F6F4EC] sm:p-9"><div className="absolute -right-14 -top-16 h-52 w-52 rounded-full border border-[#B3C5B8]/20" /><div className="absolute -right-3 -top-5 h-28 w-28 rounded-full border border-[#DD765D]/50" /><p className="font-mono text-[10px] uppercase tracking-[.24em] text-[#B3C5B8]">Reclaimed today</p><div className="mt-7 flex items-end gap-3"><CountUp className="font-display text-7xl leading-none" value={s?.todayMinutes ?? 0} /><span className="pb-2 text-sm text-[#B3C5B8]">minutes</span></div><div className="mt-8 flex items-center justify-between border-t border-[#41615D] pt-4 text-sm"><span className="text-[#B3C5B8]">{s?.sessions ?? 0} small moments this year</span><Link href="/weekly-summary" className="flex items-center gap-1 font-semibold text-[#E9B979] hover:text-[#F6F4EC]" data-testid="link-dashboard-summary">See your rhythm <ArrowRight size={14} /></Link></div></section>
      <section className="rounded-[2rem] border border-border bg-card p-7 sm:p-9"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#DD765D]">The bigger picture</p><BarChart3 size={18} className="text-[#DD765D]" /></div><div className="mt-7 space-y-5"><div><p className="font-display text-4xl"><CountUp value={s?.monthMinutes ?? 0} /><span className="ml-2 font-sans text-sm text-muted-foreground">min this month</span></p></div><div className="h-px bg-[#E1DDD2]" /><div><p className="font-display text-4xl"><CountUp value={s?.yearMinutes ?? 0} /><span className="ml-2 font-sans text-sm text-muted-foreground">min this year</span></p></div></div></section></div>
    <section className="mt-8"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#DD765D]">A gentle nudge</p><h2 className="mt-1 font-display text-3xl">How do you want to feel?</h2></div><Button href="/browse" variant="quiet" className="hidden sm:inline-flex" testId="button-dashboard-browse">Browse ideas <ChevronRight size={15} /></Button></div><div className="grid gap-4 sm:grid-cols-3"><Link href="/choose-time" className="group rounded-2xl bg-[#E9B979] p-5 transition-transform duration-300 hover:-translate-y-1 dark:text-[#163D3B]" data-testid="card-mood-rest"><Moon size={18} /><h3 className="mt-10 font-display text-2xl">A little lighter</h3><p className="mt-1 text-sm text-[#6C5734]">Rest, reset, exhale.</p></Link><Link href="/choose-time" className="group rounded-2xl bg-[#D8E0CF] p-5 transition-transform duration-300 hover:-translate-y-1 dark:text-[#163D3B]" data-testid="card-mood-curious"><Sparkles size={18} /><h3 className="mt-10 font-display text-2xl">A little curious</h3><p className="mt-1 text-sm text-[#596A57]">Follow a thread.</p></Link><Link href="/choose-time" className="group rounded-2xl bg-[#F0D5C7] p-5 transition-transform duration-300 hover:-translate-y-1 dark:text-[#163D3B]" data-testid="card-mood-creative"><Feather size={18} /><h3 className="mt-10 font-display text-2xl">A little expressive</h3><p className="mt-1 text-sm text-[#80594D]">Make something small.</p></Link></div></section>
    {(me.data?.dailyGoalMinutes || me.data?.yearlyGoalMinutes) ? <section className="mt-8 rounded-3xl border border-border bg-card p-7" data-testid="section-targets"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">Your targets</h2><Link href="/settings" className="text-sm font-semibold text-[#B85642]" data-testid="link-targets-settings">Adjust</Link></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><TargetBar label="Today" have={s?.todayMinutes ?? 0} goal={me.data?.dailyGoalMinutes} testId="bar-target-daily" /><TargetBar label="This year" have={s?.yearMinutes ?? 0} goal={me.data?.yearlyGoalMinutes} testId="bar-target-yearly" /></div></section> : <section className="mt-8 rounded-3xl border border-dashed border-[#CEC7B9] bg-muted p-7" data-testid="section-targets-empty"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-display text-2xl">Set a gentle target?</p><p className="mt-1 text-sm text-muted-foreground">Daily and yearly aims live here once you set them.</p></div><Button href="/settings" variant="outline" testId="button-targets-setup">Set targets</Button></div></section>}<section className="mt-12 rounded-3xl border border-border bg-muted p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-display text-2xl">Already did something good for yourself?</p><p className="mt-1 text-sm text-muted-foreground">Add it here. It still counts.</p></div><Button onClick={() => setShowManual(v => !v)} variant="outline" testId="button-open-manual-entry"><Plus size={16} />Add a moment</Button></div>{showManual && <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_110px_150px_auto]"><input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="What did you make time for?" className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-[#DD765D]" data-testid="input-manual-title" /><input type="number" min="1" value={manualMinutes} onChange={e => setManualMinutes(e.target.value)} className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-[#DD765D]" data-testid="input-manual-minutes" /><select value={manualCategory} onChange={e => setManualCategory(e.target.value)} className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" data-testid="select-manual-category"><option>Rest</option><option>Move</option><option>Make</option><option>Connect</option><option>Learn</option></select><Button onClick={saveManual} disabled={manual.isPending} variant="coral" testId="button-save-manual">Save</Button></div>}</section>
  </PageFrame></AppShell>;
}

const timeOptions = [5, 10, 20, 30, 45, 60];
function ChooseTime() {
  const [selected, setSelected] = useState<number | null>(null); const [custom, setCustom] = useState('');
  const value = selected === 60 ? Number(custom) || 60 : selected;
  return <AppShell><PageFrame eyebrow="Step one of two" title="How much room do you have?" copy="There’s no ideal amount. Pick the time that’s honestly yours."><div className="mx-auto max-w-3xl"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{timeOptions.map((m, mi) => <Rise key={m} delay={0.08 + mi * 0.09}><button type="button" onClick={() => setSelected(m)} className={cx('group relative flex min-h-[158px] flex-col justify-between rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1', selected === m ? 'border-[#DD765D] bg-[#F0D5C7] shadow-[0_8px_25px_rgba(221,118,93,.18)] dark:text-[#163D3B]' : 'border-border bg-card hover:border-[#C5BFB1]')} data-testid={`button-time-${m}`}><span className="flex items-center justify-between"><Clock3 size={18} className={selected === m ? 'text-[#DD765D]' : 'text-muted-foreground'} />{selected === m && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DD765D] text-[#FFF9F0]" data-testid={`check-time-${m}`}><Check size={14} /></span>}</span><span><span className="font-display text-5xl">{m === 60 ? '60+' : m}</span><span className="mt-1 block text-sm text-muted-foreground">minutes</span></span></button></Rise>)}</div>{selected === 60 && <div className="mt-4 rounded-2xl bg-muted p-5"><label className="text-sm font-semibold">How many minutes exactly?</label><input autoFocus type="number" min="60" max="180" value={custom} onChange={e => setCustom(e.target.value)} placeholder="60" className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-[#DD765D]" data-testid="input-custom-minutes" /></div>}<div className="mt-10 flex items-center justify-between"><Button href="/app" variant="quiet" testId="button-time-back"><ArrowLeft size={16} />Back</Button><Button onClick={() => { if (value) window.sessionStorage.setItem('reclaim_minutes', String(value)); }} href={value ? `/choose-mood?minutes=${value}` : undefined} disabled={!value} variant="coral" testId="button-time-continue">Continue <ArrowRight size={16} /></Button></div></div></PageFrame></AppShell>;
}

const moods = [{ name: 'Low energy', detail: 'Keep it easy', color: '#D8E0CF' }, { name: 'Relax', detail: 'Let your shoulders drop', color: '#E9B979' }, { name: 'Curious', detail: 'Follow a question', color: '#D7DCE5' }, { name: 'Energetic', detail: 'Use the good spark', color: '#F0D5C7' }, { name: 'Creative', detail: 'Make a little mess', color: '#E0D4DF' }, { name: 'Social', detail: 'Reach out softly', color: '#CFE0DC' }, { name: 'Surprise me', detail: 'Choose for me', color: '#E5DCCA' }];
function ChooseMood() {
  const [, setLocation] = useLocation(); const params = new URLSearchParams(window.location.search); const minutes = Number(params.get('minutes') || window.sessionStorage.getItem('reclaim_minutes') || 10); const [selected, setSelected] = useState('');
  return <AppShell><PageFrame eyebrow="Step two of two" title="What’s your energy like?" copy="No need to name it perfectly. Choose what feels closest."><div className="mx-auto max-w-3xl"><div className="grid gap-3 sm:grid-cols-2">{moods.map((m, mi) => <Rise key={m.name} delay={mi * 0.05} className={m.name === 'Surprise me' ? 'sm:col-span-2' : undefined}><button type="button" onClick={() => setSelected(m.name)} style={selected === m.name && m.name !== 'Surprise me' ? { backgroundColor: m.color } : undefined} className={cx('relative w-full rounded-2xl border p-5 pl-6 text-left transition-all duration-300 hover:-translate-y-0.5', m.name === 'Surprise me' ? 'border-[#163D3B] bg-[#163D3B] text-[#F6F4EC]' : selected === m.name ? 'border-[#DD765D] dark:text-[#163D3B]' : 'border-border bg-card')} data-testid={`button-mood-${m.name.toLowerCase().replace(' ', '-')}`}><span className="flex items-center gap-2.5">{m.name === 'Surprise me' ? <Sparkles size={18} className="shrink-0 text-[#E9B979]" /> : <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: m.color }} />}<span className="font-display text-2xl leading-snug">{m.name}</span></span><span className="mt-1 block pr-8 text-sm text-muted-foreground">{m.detail}</span><span className="absolute right-4 top-1/2 -translate-y-1/2">{selected === m.name ? <Check size={19} className="text-[#DD765D]" /> : <ChevronRight size={18} className="text-muted-foreground" />}</span></button></Rise>)}</div><div className="mt-10 flex items-center justify-between"><Button href={`/choose-time`} variant="quiet" testId="button-mood-back"><ArrowLeft size={16} />Back</Button><Button onClick={() => { if (selected) { window.sessionStorage.setItem('reclaim_mood', selected); setLocation(`/recommendations?minutes=${minutes}&mood=${encodeURIComponent(selected)}`); } }} disabled={!selected} variant="coral" testId="button-mood-continue">Show me three ideas <Sparkles size={16} /></Button></div></div></PageFrame></AppShell>;
}

function Recommendations() {
  const params = new URLSearchParams(window.location.search); const minutes = Number(params.get('minutes') || window.sessionStorage.getItem('reclaim_minutes') || 10); const mood = params.get('mood') || window.sessionStorage.getItem('reclaim_mood') || 'Surprise me'; const [refresh, setRefresh] = useState(0);
  const rec = useGetRecommendations({ minutes, mood, refresh, hour: new Date().getHours() }, { query: { queryKey: getGetRecommendationsQueryKey({ minutes, mood, refresh, hour: new Date().getHours() }) } });
  const activities = rec.data?.activities || [];
  return <AppShell><PageFrame eyebrow="Just for this moment" title="Three ways to spend it." copy={`${minutes} minutes, feeling ${mood.toLowerCase()}. Take the one that gives you a small yes.`} action={<Button onClick={() => setRefresh(v => v + 1)} variant="outline" disabled={rec.isFetching} testId="button-refresh-recommendations"><RefreshCw size={15} className={rec.isFetching ? 'animate-spin' : ''} />Refresh options</Button>}>{rec.isLoading ? <div className="grid gap-4 md:grid-cols-3"><div className="h-80 animate-shimmer rounded-3xl" /><div className="h-80 animate-shimmer rounded-3xl" /><div className="h-80 animate-shimmer rounded-3xl" /></div> : rec.isError ? <ErrorState onRetry={() => rec.refetch()} /> : activities.length !== 3 ? <EmptyState title="Nothing forced." copy="We couldn’t find three good fits for that combination. Try refreshing for a different angle." href="/choose-time" /> : <div className="grid gap-4 md:grid-cols-3">{activities.map((a, i) => <Rise key={a.id} delay={0.15 + i * 0.16}><Tilt><article className={cx('group flex min-h-[370px] flex-col rounded-[2rem] border p-6 transition-all duration-300 hover:-translate-y-1 hover:soft-shadow', i === 0 ? 'border-border bg-card' : i === 1 ? 'border-border bg-[#E9B979] dark:text-[#163D3B]' : 'border-border bg-[#D8E0CF] dark:text-[#163D3B]')} data-testid={`card-recommendation-${a.id}`}><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.2em]">0{i + 1}</span><span className="flex items-center gap-1.5">{a.requiresOther && <PartnerBadge />}<span className="rounded-full bg-background/70 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">{a.minMinutes}–{a.maxMinutes} min</span></span></div><div className="mt-auto"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#DD765D]">{a.category}</p><h2 className="font-display text-3xl leading-tight">{a.title}</h2><p className="mt-3 text-sm leading-6">{a.description}</p><Button href={`/begin/${a.id}?minutes=${minutes}&from=${encodeURIComponent(window.location.pathname + window.location.search)}`} variant="primary" className="mt-6 w-full">Start this one <Play size={15} fill="currentColor" /></Button></div></article></Tilt></Rise>)}</div>}</PageFrame></AppShell>;
}

function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const completion = useCreateCompletion();
  const manual = useCreateManualEntry();
  const qc = useQueryClient();
  const seeds = useListActivities();
  const [custom] = useState(() => { try { return JSON.parse(window.sessionStorage.getItem('reclaim_custom') || 'null') as { title: string; category: string } | null; } catch { return null; } });
  const [minutes] = useState(() => Math.round(Number(window.sessionStorage.getItem('reclaim_run_minutes') || 0)));
  const [back] = useState(() => window.sessionStorage.getItem('reclaim_back') || '/browse');
  const seed = id === 'custom' ? undefined : seeds.data?.activities.find(a => a.id === id);
  const title = seed?.title ?? custom?.title;
  const category = seed?.category ?? custom?.category ?? 'Rest';
  const total = minutes > 0 ? minutes * 60 : 0;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [credit, setCredit] = useState(0);
  useEffect(() => { if (!running || done || total <= 0) return; const timer = window.setInterval(() => setElapsed(e => (e + 1 >= total ? total : e + 1)), 1000); return () => window.clearInterval(timer); }, [running, done, total]);
  useEffect(() => { const onVis = () => { if (document.hidden) setRunning(false); }; document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis); }, []);
  const invalidate = () => { qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetHistoryQueryKey() }); qc.invalidateQueries({ queryKey: getGetWeeklySummaryQueryKey() }); };
  const doFinish = (mins: number) => {
    const durationMinutes = Math.max(1, Math.min(mins, 240));
    const onOk = () => { setCredit(durationMinutes); setDone(true); setRunning(false); invalidate(); };
    if (seed) completion.mutate({ data: { activityId: seed.id, durationMinutes } }, { onSuccess: onOk });
    else if (title) manual.mutate({ data: { title, category, durationMinutes } }, { onSuccess: onOk });
  };
  const finished = total > 0 && elapsed >= total;
  useEffect(() => { if (finished && !done && (seed || title)) doFinish(minutes); }, [finished]);
  if (seeds.isLoading && id !== 'custom') return <AppShell><PageFrame title="Getting ready"><Loading /></PageFrame></AppShell>;
  if (seeds.isError && id !== 'custom') return <AppShell><PageFrame title="Getting ready"><ErrorState onRetry={() => seeds.refetch()} /></PageFrame></AppShell>;
  if (!title || total <= 0) return <AppShell><PageFrame title="That moment moved on."><EmptyState title="Choose a fresh beginning." copy="Pick an idea and a time, and we’ll meet you there." href="/browse" /></PageFrame></AppShell>;
  const remaining = total - elapsed;
  const percent = total > 0 ? (elapsed / total) * 100 : 0;
  const earlyCredit = Math.floor(elapsed / 60);
  const busy = completion.isPending || manual.isPending;
  const started = elapsed > 0 || running;
  return <AppShell><div className="mx-auto max-w-4xl px-5 pb-16 pt-5 sm:px-10 lg:px-14 lg:pt-14"><Button href={back} variant="quiet" className="px-0" testId="button-activity-back"><ArrowLeft size={16} />Back</Button>{done ? <div className="relative mx-auto max-w-lg py-20 text-center"><Burst testId="effect-completion-burst" /><Pop className="mx-auto flex h-20 w-20 animate-breathe items-center justify-center rounded-full bg-[#DD765D] text-[#FFF9F0]"><Check size={36} /></Pop><p className="mt-8 font-mono text-[10px] uppercase tracking-[.25em] text-[#DD765D]">Time returned</p><h1 className="mt-3 font-display text-5xl tracking-[-.04em]">That was yours.</h1><p className="mt-4 text-muted-foreground">You reclaimed <strong className="text-foreground">{credit} minutes</strong> for {title.toLowerCase()}.</p><div className="mt-8 flex justify-center gap-3"><Button href="/app" testId="button-completion-home">Back home</Button><Button href="/browse" variant="outline" testId="button-completion-another">Find another moment</Button></div></div> : <><div className="mt-12 text-center"><p className="font-mono text-[10px] uppercase tracking-[.25em] text-[#DD765D]">{category} · {seed?.setting ?? 'your way'}</p><h1 className="mx-auto mt-4 max-w-2xl font-display text-5xl leading-tight tracking-[-.04em] sm:text-7xl" data-testid="text-activity-title">{title}</h1>{seed?.description && <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{seed.description}</p>}</div><div className="mx-auto mt-12 max-w-md rounded-[2rem] bg-[#163D3B] p-7 text-center text-[#F6F4EC]"><div className="relative mx-auto flex h-56 w-56 items-center justify-center"><svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90"><circle cx="50" cy="50" r="45" fill="none" stroke="#315B57" strokeWidth="2" /><circle cx="50" cy="50" r="45" fill="none" stroke="#DD765D" strokeWidth="2" strokeDasharray="283" strokeDashoffset={283 - (283 * percent) / 100} strokeLinecap="round" className={remaining <= 60 && remaining > 0 ? 'animate-pulse transition-all duration-1000' : 'transition-all duration-1000'} /></svg><div><p className={cx('font-mono text-4xl', remaining <= 60 && remaining > 0 ? 'animate-pulse text-[#DD765D]' : undefined)} data-testid="text-timer">{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</p><p className="mt-2 text-xs text-[#B3C5B8]">{running ? 'You’re in it' : started ? 'Paused — the clock only runs while you’re here' : 'Whenever you’re ready'}</p></div></div><Button onClick={() => setRunning(r => !r)} disabled={done || busy} variant="coral" className="mt-3 w-full" testId="button-start-timer">{running ? <><Pause size={15} fill="currentColor" />Pause</> : started ? <><Play size={15} fill="currentColor" />Resume</> : <><Play size={15} fill="currentColor" />Start timer</>}</Button><Button onClick={() => doFinish(earlyCredit)} disabled={!started || elapsed < 60 || busy || done} variant="quiet" className="mt-2 w-full text-[#B3C5B8] hover:bg-[#285A56] hover:text-[#F6F4EC]" testId="button-finish-activity">{busy ? 'Saving…' : earlyCredit > 0 && !finished ? `I’m finished · bank ${earlyCredit} min` : 'I’m finished'}</Button>{started && !finished && <p className="mt-3 text-xs text-[#B3C5B8]" data-testid="status-timer-note">The timer pauses itself if you leave this tab. Finishing early banks full minutes only.</p>}</div>{seed?.instructions && seed.instructions.length > 0 && <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-border bg-card p-7"><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#DD765D]">A simple path</p><ol className="mt-5 space-y-4">{seed.instructions.map((instruction: string, index: number) => <li key={instruction} className="flex gap-4 text-sm leading-6 text-muted-foreground" data-testid={`text-instruction-${index}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E9B979] font-mono text-[11px] text-[#604B2B]">{index + 1}</span>{instruction}</li>)}</ol></div>}</>}</div></AppShell>;
}

function Browse() {
  const all = useListActivities();
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const seeds = all.data?.activities ?? [];
  const groups = useMemo(() => {
    const map = new Map<string, typeof seeds>();
    for (const seed of seeds) {
      if (moodFilter && !seed.moods.includes(moodFilter)) continue;
      const group = map.get(seed.category) ?? [];
      group.push(seed);
      map.set(seed.category, group);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [seeds, moodFilter]);
  return <AppShell><PageFrame eyebrow="Wander freely" title="Explore ideas." copy="Every seed below, grouped by kind. Filter by mood, pick one, then say how much time you have.">
    {all.isLoading ? <Loading label="Gathering every seed" /> : all.isError ? <ErrorState onRetry={() => all.refetch()} /> : <>
      <div className="mb-8 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMoodFilter(null)} className={cx('rounded-full border px-4 py-2 text-sm transition-colors', !moodFilter ? 'border-[#DD765D] bg-[#F0D5C7] text-foreground' : 'border-border bg-card text-muted-foreground')} data-testid="button-browse-mood-all">All moods</button>
        {moods.map(m => <button key={m.name} type="button" onClick={() => setMoodFilter(current => current === m.name ? null : m.name)} className={cx('rounded-full border px-4 py-2 text-sm transition-colors', moodFilter === m.name ? 'border-[#DD765D] bg-[#F0D5C7] text-foreground dark:text-[#163D3B]' : 'border-border bg-card text-muted-foreground')} data-testid={`button-browse-mood-${m.name.toLowerCase().replace(' ', '-')}`}>{m.name}</button>)}
      </div>
      <Link href="/begin/custom" className="group mb-10 flex items-center justify-between rounded-2xl bg-[#163D3B] p-5 transition-transform duration-300 hover:-translate-y-0.5" data-testid="card-browse-custom"><span><span className="block font-display text-2xl text-[#F6F4EC]">Make your own</span><span className="mt-1 block text-sm text-[#B3C5B8]">Name it, time it, count it.</span></span><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DD765D] text-[#FFF9F0]"><Plus size={18} /></span></Link>
      {groups.length === 0 ? <p className="rounded-2xl border border-dashed border-[#CEC7B9] bg-muted p-8 text-center text-sm text-muted-foreground" data-testid="status-browse-empty">Nothing matches that mood — try another.</p> : groups.map(([category, items]) => <section key={category} className="mb-10" data-testid={`section-browse-${category.toLowerCase()}`}><h2 className="mb-4 font-display text-3xl text-foreground">{category}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(seed => <Tilt key={seed.id}><Link href={`/begin/${seed.id}`} className="group flex min-h-[190px] flex-col rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:soft-shadow" data-testid={`card-browse-${seed.id}`}><span className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.2em] text-[#DD765D]">{seed.category}</span>{seed.requiresOther && <PartnerBadge />}</span><span className="mt-2 block font-display text-2xl leading-tight text-foreground">{seed.title}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{seed.description}</span><span className="mt-auto block pt-3 font-mono text-[11px] text-muted-foreground">usually {seed.minMinutes}–{seed.maxMinutes} min</span></Link></Tilt>)}</div></section>)}
    </>}
  </PageFrame></AppShell>;
}

function BeginPage() {
  const { id } = useParams<{ id: string }>();
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/browse';
  const prefill = Math.round(Number(params.get('minutes') || 0));
  const [, setLocation] = useLocation();
  const all = useListActivities();
  const isCustom = id === 'custom';
  const seed = !isCustom ? all.data?.activities.find(a => a.id === id) : undefined;
  const categories = useMemo(() => [...new Set((all.data?.activities ?? []).map(a => a.category))].sort(), [all.data]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Rest');
  const [draft, setDraft] = useState('');
  if (all.isLoading) return <AppShell><PageFrame title="Getting ready"><Loading /></PageFrame></AppShell>;
  if (all.isError) return <AppShell><PageFrame title="Getting ready"><ErrorState onRetry={() => all.refetch()} /></PageFrame></AppShell>;
  if (!isCustom && !seed) return <AppShell><PageFrame title="That moment moved on."><EmptyState title="Choose a fresh beginning." copy="That idea is no longer here. Wander and pick another." href="/browse" /></PageFrame></AppShell>;
  const low = seed?.minMinutes ?? 1;
  const high = seed?.maxMinutes ?? 240;
  const minutes = Math.round(Number(draft) || prefill || low);
  const valid = minutes >= 1 && minutes <= 240 && (isCustom ? title.trim().length > 0 : true);
  const outOfRange = !isCustom && !!seed && (minutes < seed.minMinutes || minutes > seed.maxMinutes);
  const start = () => {
    if (!valid) return;
    window.sessionStorage.setItem('reclaim_run_minutes', String(minutes));
    window.sessionStorage.setItem('reclaim_back', from);
    if (isCustom) window.sessionStorage.setItem('reclaim_custom', JSON.stringify({ title: title.trim(), category }));
    else window.sessionStorage.removeItem('reclaim_custom');
    setLocation(`/activity/${id}`);
  };
  return <AppShell><PageFrame eyebrow={isCustom ? 'Make it yours' : seed?.category} title={isCustom ? 'Name your moment.' : seed?.title ?? 'Begin.'} copy={isCustom ? 'Describe it, pick a kind, and say how much time you have.' : seed?.description}>
    <div className="mx-auto max-w-2xl"><div className="rounded-3xl border border-border bg-card p-7">
      {isCustom && <><label className="block text-sm font-semibold text-foreground">What will you do?<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Water the balcony garden" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-[#DD765D]" data-testid="input-begin-title" /></label><label className="mt-4 block text-sm font-semibold text-foreground">What kind is it?<select value={category} onChange={e => setCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal outline-none" data-testid="select-begin-category">{categories.map(c => <option key={c}>{c}</option>)}</select></label></>}
      <label className="mt-4 block text-sm font-semibold text-foreground">How many minutes do you have?<input type="number" min={1} max={240} value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Usually ${low}–${high}`} className="mt-2 w-full rounded-2xl border border-border bg-background px-5 py-4 font-normal outline-none focus:border-[#DD765D]" data-testid="input-begin-minutes" /></label>
      {outOfRange && <p className="mt-3 text-sm text-[#8B5147]" data-testid="status-begin-range">This one usually takes {seed?.minMinutes}–{seed?.maxMinutes} minutes — adjust, or proceed anyway.</p>}
      <Button onClick={start} disabled={!valid} variant="coral" className="mt-6 w-full" testId="button-begin-start">Start {minutes} minutes <ArrowRight size={16} /></Button>
    </div></div>
  </PageFrame></AppShell>;
}

function HistoryPage() {
  const history = useGetHistory(); const entries = history.data?.entries || []; const grouped = useMemo(() => entries.reduce<Record<string, typeof entries>>((all, item) => { const key = prettyDate(item.completedAt); (all[key] ||= []).push(item); return all; }, {}), [entries]); const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  return <AppShell><PageFrame eyebrow="A trail of small choices" title="Your history." copy="Proof that the good stuff can be ordinary."><div className="mx-auto max-w-3xl">{history.isLoading ? <Loading label="Looking back gently" /> : history.isError ? <ErrorState onRetry={() => history.refetch()} /> : entries.length === 0 ? <EmptyState title="Your first moment is waiting." copy="Complete a small activity and it will appear here, quietly keeping track." /> : <div className="space-y-8">{Object.entries(grouped).map(([day, items], di) => { const ranked = [...items].sort((a, b) => b.durationMinutes - a.durationMinutes); const open = !!expandedDays[day]; const shown = open ? ranked : ranked.slice(0, 3); return <section key={day} data-testid={`section-history-${day}`}><div className="mb-3 flex items-center gap-3"><CalendarDays size={15} className="text-[#DD765D]" /><h2 className="font-mono text-[11px] uppercase tracking-[.2em] text-muted-foreground">{day}</h2><div className="h-px flex-1 bg-[#DDD8CC]" /></div><div className="divide-y divide-[#E1DDD2] rounded-2xl border border-border bg-card px-5">{shown.map((item, ii) => <Rise key={item.id} delay={Math.min(ii, 7) * 0.07}><div className="flex items-center justify-between gap-4 py-5" data-testid={`row-history-${item.id}`}><div className="flex min-w-0 items-center gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E9B979]"><Leaf size={17} /></div><div className="min-w-0"><p className="truncate font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.source === 'manual' ? 'Added by you' : 'From Reclaim'}</p></div></div><span className="shrink-0 font-mono text-sm text-[#DD765D]">+{item.durationMinutes} min</span></div></Rise>)}</div>{items.length > 3 && <button type="button" onClick={() => setExpandedDays(e => ({ ...e, [day]: !e[day] }))} className="mt-3 w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground" data-testid={`button-history-${open ? 'collapse' : 'expand'}-${di}`}>{open ? 'Show less' : `Show all ${items.length} moments`}</button>}</section>;})}</div>}</div></PageFrame></AppShell>;
}

const AFFIRMATIONS = [
  "Ten quiet minutes beat an hour of scrolling.",
  "Small moments have a way of becoming a life.",
  "You don't need more time. You need more that's yours.",
  "Rest is not the absence of doing. It is the point.",
  "A short walk counts. So does a long breath.",
  "Attention is the rarest gift. Give some to yourself.",
  "The best part of your day doesn't need a plan.",
  "Five honest minutes beat fifty distracted ones.",
  "You are allowed to pause in the middle of everything.",
  "Notice one beautiful thing. That is the whole exercise.",
  "Time you enjoy is never time wasted — especially ten minutes of it.",
  "Begin small. Stay a while. Leave gently.",
];

function affirmationForToday() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return AFFIRMATIONS[day % AFFIRMATIONS.length];
}

function WeeklySummary() {
  const weekly = useGetWeeklySummary(); const me = useGetMe(); const data = weekly.data; const max = Math.max(...(data?.dailyMinutes || []).map(d => d.minutes), 1);
  return <AppShell><PageFrame eyebrow="Looking back, lightly" title="Your rhythm." copy="A week is not a score. It’s just a shape you can notice.">{weekly.isLoading ? <Loading label="Finding the shape of your week" /> : weekly.isError ? <ErrorState onRetry={() => weekly.refetch()} /> : !data ? <EmptyState title="No rhythm yet." copy="A few reclaimed minutes will give your week a shape." /> : <><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl bg-[#163D3B] p-6 text-[#F6F4EC]"><Clock3 size={18} className="text-[#E9B979]" /><p className="mt-8 font-display text-5xl" data-testid="text-weekly-total"><CountUp value={data.totalMinutes} /></p><p className="mt-1 text-sm text-[#B3C5B8]">minutes this week</p></div><div className="rounded-3xl border border-border bg-card p-6"><Trophy size={18} className="text-[#DD765D]" /><p className="mt-8 font-display text-5xl">{data.topActivities?.[0]?.count || 0}</p><p className="mt-1 text-sm text-muted-foreground">repeat favorite</p></div><div className="rounded-3xl bg-[#E9B979] p-6 dark:text-[#163D3B]"><Flame size={18} /><p className="mt-8 font-display text-5xl">{data.categories?.length || 0}</p><p className="mt-1 text-sm text-[#6C5734]">ways you made room</p></div></div><div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center justify-between">{me.data?.weeklyGoalMinutes ? <div className="mb-5 rounded-3xl border border-border bg-card p-6" data-testid="section-weekly-target"><TargetBar label="This week" have={data?.totalMinutes ?? 0} goal={me.data?.weeklyGoalMinutes} testId="bar-target-weekly" /></div> : null}<h2 className="font-display text-2xl">The week at a glance</h2><span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">minutes</span></div><div className="mt-8 flex h-44 items-end justify-between gap-2">{(data.dailyMinutes || []).map((day, i) => <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{day.minutes || ''}</span><div className="w-full max-w-9 rounded-t-lg bg-[#DD765D] transition-all duration-700" style={{ height: `${Math.max((day.minutes / max) * 125, 8)}px`, opacity: .55 + (i / 20) }} /><span className="font-mono text-[10px] uppercase text-muted-foreground">{new Date(`${day.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span></div>)}</div></section><section className="rounded-3xl bg-[#D8E0CF] p-7 dark:text-[#163D3B]"><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#5E725D]">A thought for now</p><p className="mt-8 font-display text-3xl leading-tight" data-testid="text-weekly-affirmation">{affirmationForToday()}</p></section></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-border bg-card p-7"><h2 className="font-display text-2xl">Where your time went</h2><div className="mt-6 space-y-4">{(data.categories || []).map(c => <div key={c.category}><div className="flex justify-between text-sm"><span>{c.category}</span><span className="font-mono text-xs text-[#DD765D]">{c.minutes} min</span></div><div className="mt-2 h-2 rounded-full bg-[#E9E5DA] dark:bg-muted"><div className="h-2 rounded-full bg-[#163D3B] dark:bg-[#DD765D]" style={{ width: `${Math.min((c.minutes / Math.max(data.totalMinutes, 1)) * 100, 100)}%` }} /></div></div>)}</div></section><section className="rounded-3xl border border-border bg-card p-7"><h2 className="font-display text-2xl">Your top activities</h2><div className="mt-4 divide-y divide-[#E1DDD2]">{(data.topActivities || []).slice(0, 4).map((a, i) => <div key={a.title} className="flex items-center justify-between py-4"><span className="flex items-center gap-3 text-sm"><span className="font-mono text-xs text-[#DD765D]">0{i + 1}</span>{a.title}</span><span className="font-mono text-xs text-muted-foreground">{a.minutes} min</span></div>)}</div></section></div></>}</PageFrame></AppShell>;
}

function LegacyPricing() {
  const status = useGetBillingStatus(); const products = useGetBillingProducts(); const checkout = useCreateBillingCheckout(); const portal = useCreateBillingPortal(); const restore = useRestoreBilling(); const qc = useQueryClient(); const [annual, setAnnual] = useState(true);
  const product = products.data?.products?.[0]; const priceId = annual ? product?.yearlyPriceId : product?.monthlyPriceId;
  const startCheckout = () => { if (priceId) checkout.mutate({ data: { priceId } }, { onSuccess: result => { window.location.href = result.url; } }); };
  return <AppShell><PageFrame eyebrow="A little more room" title="Keep your reclaimed time." copy="Reclaim is free while you find your rhythm. Keep going when the trial ends."><div className="mx-auto max-w-5xl">{status.data?.state === 'trial' && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#E9B979] px-5 py-4 text-sm dark:text-[#163D3B]"><span><strong>{status.data.trialDaysRemaining} days</strong> left in your trial.</span><Link href="/app" className="font-semibold underline underline-offset-4" data-testid="link-pricing-back">Keep exploring for now</Link></div>}<div className="mb-5 flex justify-center"><div className="flex rounded-full border border-border bg-card p-1"><button type="button" onClick={() => setAnnual(false)} className={cx('rounded-full px-5 py-2 text-sm', !annual && 'bg-[#163D3B] text-[#F6F4EC]')} data-testid="button-billing-monthly">Monthly</button><button type="button" onClick={() => setAnnual(true)} className={cx('rounded-full px-5 py-2 text-sm', annual && 'bg-[#163D3B] text-[#F6F4EC]')} data-testid="button-billing-yearly">Yearly <span className="ml-1 text-[#DD765D]">best value</span></button></div></div>{products.isLoading ? <Loading label="Finding the right fit" /> : products.isError ? <ErrorState onRetry={() => products.refetch()} /> : !product ? <EmptyState title="Plans are taking a breath." copy="Billing options aren’t available right now. Please check back soon." href="/app" /> : <div className="grid gap-5 md:grid-cols-[1.2fr_.8fr]"><section className="relative overflow-hidden rounded-[2rem] bg-[#163D3B] p-8 text-[#F6F4EC] sm:p-10"><div className="absolute right-0 top-0 h-48 w-48 rounded-full border border-[#B3C5B8]/20" /><div className="relative"><div className="flex items-start justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#E9B979]">The full space</p><h2 className="mt-4 font-display text-4xl">{product.name}</h2></div><WalletCards className="text-[#DD765D]" /></div><p className="mt-4 max-w-md leading-7 text-[#B3C5B8]">{product.description}</p><div className="mt-10 flex items-end gap-2"><span className="font-display text-6xl">{formatMoney(annual ? product.yearlyAmount : product.monthlyAmount, product.currency)}</span><span className="pb-2 text-sm text-[#B3C5B8]">/{annual ? 'year' : 'month'}</span></div>{annual && product.monthlyAmount && product.yearlyAmount && <p className="mt-2 text-sm text-[#E9B979]">Save {Math.round((1 - product.yearlyAmount / (product.monthlyAmount * 12)) * 100)}% with yearly billing</p>}<Button onClick={startCheckout} disabled={checkout.isPending || !priceId} variant="coral" className="mt-9 w-full" testId="button-start-checkout">{checkout.isPending ? 'Opening secure checkout…' : 'Continue to checkout'} <ArrowRight size={16} /></Button><p className="mt-4 text-center text-xs text-[#9FB1A6]">Secure billing · cancel any time · taxes may apply</p></div></section><section className="rounded-[2rem] border border-border bg-card p-8 sm:p-10"><h3 className="font-display text-3xl">A quieter kind of useful.</h3><ul className="mt-8 space-y-5 text-sm text-muted-foreground">{['Unlimited personalized suggestions', 'Your history and weekly rhythm, kept together', 'A gentle place to start whenever you need it'].map(x => <li key={x} className="flex gap-3"><Check size={17} className="shrink-0 text-[#DD765D]" />{x}</li>)}</ul>{status.data?.state === 'active' && <Button onClick={() => portal.mutate(undefined, { onSuccess: r => { window.location.href = r.url; } })} variant="outline" className="mt-10 w-full" testId="button-manage-billing">Manage billing <CreditCard size={15} /></Button>}{status.data?.state !== 'active' && <Button onClick={() => restore.mutate(undefined)} variant="quiet" className="mt-10 w-full" disabled={restore.isPending} testId="button-restore-purchases">Restore purchases</Button>}</section></div>}</div></PageFrame></AppShell>;
}

function Pricing() {
  const status = useGetBillingStatus();
  const products = useGetBillingProducts();
  const checkout = useCreateBillingCheckout();
  const portal = useCreateBillingPortal();
  const restore = useRestoreBilling();
  const [annual, setAnnual] = useState(true);
  const product = products.data?.products?.[0];
  const priceId = annual ? product?.yearlyPriceId : product?.monthlyPriceId;
  const startCheckout = () => {
    if (priceId) checkout.mutate({ data: { priceId } }, { onSuccess: result => { window.location.href = result.url; } });
  };
  return <AppShell><PageFrame eyebrow="A little more room" title="Keep your reclaimed time." copy="Your time is worth more than another scroll. Reclaim your time. Build better habits. Do more of what matters."><div className="mx-auto max-w-5xl"><div className="mb-6 rounded-[2rem] border border-[#E9C7BB] bg-[#FFF0E9] p-7"><p className="font-display text-3xl text-[#7C463D]">A full-featured 14-day trial.</p><p className="mt-2 text-sm leading-6 text-[#8B655C]">Try every part of Reclaim before choosing a plan. Cancel any time from your billing portal.</p></div>{status.data?.state === 'trial' && <div className="mb-6 rounded-2xl bg-[#E9B979] px-5 py-4 text-sm dark:text-[#163D3B]"><strong>{status.data.trialDaysRemaining} days</strong> left in your trial.</div>}<div className="mb-5 flex justify-center"><div className="flex rounded-full border border-border bg-card p-1"><button type="button" onClick={() => setAnnual(false)} className={cx('rounded-full px-5 py-2 text-sm', !annual && 'bg-[#163D3B] text-[#F6F4EC]')}>Monthly</button><button type="button" onClick={() => setAnnual(true)} className={cx('rounded-full px-5 py-2 text-sm', annual && 'bg-[#163D3B] text-[#F6F4EC]')}>Yearly <span className="ml-1 text-[#DD765D]">best value</span></button></div></div>{products.isLoading ? <Loading label="Finding the right fit" /> : products.isError ? <ErrorState onRetry={() => products.refetch()} /> : !product ? <EmptyState title="Plans are taking a breath." copy="Billing options aren’t available right now." href="/app" /> : <div className="grid gap-5 md:grid-cols-[1.2fr_.8fr]"><section className="rounded-[2rem] bg-[#163D3B] p-8 text-[#F6F4EC] sm:p-10"><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#E9B979]">The full space</p><h2 className="mt-4 font-display text-4xl">{product.name}</h2><p className="mt-4 leading-7 text-[#B3C5B8]">{product.description}</p><div className="mt-10 flex items-end gap-2"><span className="font-display text-6xl">{formatMoney(annual ? product.yearlyAmount : product.monthlyAmount, product.currency)}</span><span className="pb-2 text-sm text-[#B3C5B8]">/{annual ? 'year' : 'month'}</span></div><p className="mt-3 text-sm text-[#E9B979]">{annual ? 'Billed yearly · save with the best value plan' : 'Billed monthly · cancel any time'}</p><Button onClick={startCheckout} disabled={checkout.isPending || !priceId} variant="coral" className="mt-8 w-full">{checkout.isPending ? 'Opening secure checkout…' : 'Continue to checkout'} <ArrowRight size={16} /></Button></section><section className="rounded-[2rem] border border-border bg-card p-8 sm:p-10"><h3 className="font-display text-3xl">A quieter kind of useful.</h3><ul className="mt-8 space-y-5 text-sm text-muted-foreground">{['Unlimited personalized suggestions', 'Your history and weekly rhythm, kept together', 'A gentle place to start whenever you need it'].map(item => <li key={item} className="flex gap-3"><Check size={17} className="shrink-0 text-[#DD765D]" />{item}</li>)}</ul>{status.data?.state === 'active' && <Button onClick={() => portal.mutate(undefined, { onSuccess: result => { window.location.href = result.url; } })} variant="outline" className="mt-10 w-full">Manage billing <CreditCard size={15} /></Button>}<Button onClick={() => restore.mutate(undefined)} variant="quiet" className="mt-4 w-full" disabled={restore.isPending}>{restore.isPending ? 'Checking…' : 'Restore purchases'}</Button></section></div>}</div></PageFrame></AppShell>;
}

function Settings() {
  const me = useGetMe(); const update = useUpdateMe(); const { user, signOut } = useSession(); const [, setLocation] = useLocation(); const [theme, setTheme] = useState(document.documentElement.classList.contains('dark')); const [name, setName] = useState(''); const [dailyGoal, setDailyGoal] = useState(''); const [weeklyGoal, setWeeklyGoal] = useState(''); const [yearlyGoal, setYearlyGoal] = useState(''); const [look, setLook] = useState('leaf'); const [saved, setSaved] = useState(false);
  useEffect(() => { if (me.data) { setName(me.data.firstName || ''); setDailyGoal(me.data.dailyGoalMinutes != null ? String(me.data.dailyGoalMinutes) : ''); setWeeklyGoal(me.data.weeklyGoalMinutes != null ? String(me.data.weeklyGoalMinutes) : ''); setYearlyGoal(me.data.yearlyGoalMinutes != null ? String(me.data.yearlyGoalMinutes) : ''); setLook(me.data.avatarId || 'leaf'); } }, [me.data]);
  const toggleTheme = (next: boolean) => { setTheme(next); document.documentElement.classList.toggle('dark', next); localStorage.setItem('reclaim-theme', next ? 'dark' : 'light'); };
  const toGoal = (value: string) => (value.trim() === '' ? null : Math.max(1, Math.round(Number(value) || 0)));
  const save = () => update.mutate({ data: { firstName: name, dailyGoalMinutes: toGoal(dailyGoal), weeklyGoalMinutes: toGoal(weeklyGoal), yearlyGoalMinutes: toGoal(yearlyGoal), avatarId: look } }, { onSuccess: () => { setSaved(true); void me.refetch(); setTimeout(() => setSaved(false), 2000); } });
  return <AppShell><PageFrame eyebrow="Your space, your way" title="Settings." copy="A few choices to make Reclaim feel more like yours."><div className="mx-auto max-w-2xl space-y-5"><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center gap-3"><UserRound size={18} className="text-[#DD765D]" /><div><h2 className="font-display text-2xl">Account</h2><p className="text-sm text-muted-foreground">The basics, kept simple.</p></div></div><label className="mt-7 block text-sm font-semibold">First name<input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-[#DD765D]" data-testid="input-settings-name" /></label><div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{user?.email}</div><div className="mt-5 flex items-center gap-3"><Button onClick={save} disabled={update.isPending} variant="coral" testId="button-save-settings">{saved ? 'Saved' : update.isPending ? 'Saving…' : 'Save changes'}</Button>{update.isError && <span className="text-sm text-[#B9473B]" data-testid="status-settings-error">Couldn’t save that change.</span>}</div></section><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center gap-3"><Trophy size={18} className="text-[#DD765D]" /><div><h2 className="font-display text-2xl">Your targets</h2><p className="text-sm text-muted-foreground">Small aims for your minutes — daily, weekly, yearly.</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><label className="block text-sm font-semibold">Daily<input type="number" min={1} value={dailyGoal} onChange={e => setDailyGoal(e.target.value)} placeholder="e.g. 10" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-[#DD765D]" data-testid="input-goal-daily" /></label><label className="block text-sm font-semibold">Weekly<input type="number" min={1} value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)} placeholder="e.g. 60" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-[#DD765D]" data-testid="input-goal-weekly" /></label><label className="block text-sm font-semibold">Yearly<input type="number" min={1} value={yearlyGoal} onChange={e => setYearlyGoal(e.target.value)} placeholder="e.g. 3000" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-[#DD765D]" data-testid="input-goal-yearly" /></label></div><p className="mt-3 text-xs text-muted-foreground">Leave blank to clear a target. Targets save with the button above.</p></section><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center gap-3"><Palette size={18} className="text-[#DD765D]" /><div><h2 className="font-display text-2xl">Your look</h2><p className="text-sm text-muted-foreground">An avatar, not a photograph.</p></div></div><div className="mt-6"><AvatarPicker value={look} onPick={setLook} /></div><p className="mt-3 text-xs text-muted-foreground">Saves with the button in Account above.</p></section><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center gap-3"><Sun size={18} className="text-[#DD765D]" /><div><h2 className="font-display text-2xl">Appearance</h2><p className="text-sm text-muted-foreground">Choose the light that feels right.</p></div></div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => toggleTheme(false)} className={cx('flex items-center gap-3 rounded-2xl border p-4 text-left', !theme ? 'border-[#DD765D] bg-[#F0D5C7] dark:text-[#163D3B]' : 'border-border')} data-testid="button-theme-light"><Sun size={18} />Light</button><button type="button" onClick={() => toggleTheme(true)} className={cx('flex items-center gap-3 rounded-2xl border p-4 text-left', theme ? 'border-[#DD765D] bg-[#E9B979] dark:text-[#163D3B]' : 'border-border')} data-testid="button-theme-dark"><Moon size={18} />Dark</button></div></section><section className="rounded-3xl border border-border bg-card p-7"><div className="flex items-center gap-3"><CreditCard size={18} className="text-[#DD765D]" /><div><h2 className="font-display text-2xl">Billing</h2><p className="text-sm text-muted-foreground">Plans, receipts, and your subscription.</p></div></div><Button href="/pricing" variant="outline" className="mt-6" testId="button-settings-billing">Open billing <ArrowRight size={15} /></Button></section><button type="button" onClick={() => void signOut().then(() => { queryClient.clear(); setLocation('/'); })} className="flex w-full items-center justify-between rounded-3xl border border-[#E9C7BB] bg-[#FFF0E9] p-5 text-left text-sm text-[#8B5147]" data-testid="button-settings-sign-out"><span className="flex items-center gap-3"><LogOut size={17} />Sign out of Reclaim</span><ChevronRight size={16} /></button></div></PageFrame></AppShell>;
}

function Onboarding() {
  const me = useGetMe();
  const update = useUpdateMe();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string>('leaf');
  const choices = ['Move', 'Make', 'Learn', 'Connect', 'Rest'];
  const finish = () => update.mutate({
    data: { firstName: name.trim() || undefined, interests, avatarId: avatar, onboardingComplete: true },
  }, { onSuccess: async () => { await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() }); setLocation('/choose-time'); } });
  return <div className="min-h-[100dvh] bg-background px-5 py-8 text-foreground sm:px-10 sm:py-12"><div className="mx-auto max-w-2xl"><Logo /><div className="mt-20"><p className="font-mono text-[10px] uppercase tracking-[.24em] text-[#DD765D]">A gentle beginning</p><h1 className="mt-3 font-display text-5xl leading-tight">Let’s make this space yours.</h1><p className="mt-4 max-w-lg leading-7 text-muted-foreground">A few preferences help Reclaim offer better ideas. You can change them anytime.</p><label className="mt-10 block text-sm font-semibold">What should we call you?<input value={name} onChange={e => setName(e.target.value)} placeholder={me.data?.firstName || 'Your first name'} className="mt-2 w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none focus:border-[#DD765D]" data-testid="input-onboarding-name" /></label><fieldset className="mt-8"><legend className="text-sm font-semibold">What would you like more room for?</legend><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">{choices.map(choice => <button key={choice} type="button" onClick={() => setInterests(current => current.includes(choice) ? current.filter(item => item !== choice) : [...current, choice])} className={cx('rounded-2xl border px-3 py-4 text-sm transition-colors', interests.includes(choice) ? 'border-[#DD765D] bg-[#F0D5C7] dark:text-[#163D3B]' : 'border-border bg-card')} data-testid={`button-onboarding-${choice.toLowerCase()}`}>{choice}</button>)}</div></fieldset><fieldset className="mt-8"><legend className="text-sm font-semibold">Pick your look</legend><div className="mt-3"><AvatarPicker value={avatar} onPick={setAvatar} /></div></fieldset><Button onClick={finish} disabled={update.isPending} variant="coral" className="mt-10 w-full sm:w-auto" testId="button-onboarding-finish">{update.isPending ? 'Making your space…' : 'Start with a few minutes'} <ArrowRight size={16} /></Button></div></div></div>;
}

function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { signIn, signUp } = useSession();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError(null);
    if (mode === 'sign-up') {
      const result = await signUp(email.trim(), password);
      if (result.error) { setBusy(false); setError(result.error); return; }
      if (result.needsConfirmation) { setBusy(false); setNeedsConfirmation(true); return; }
    } else {
      const result = await signIn(email.trim(), password);
      if (result.error) { setBusy(false); setError(result.error); return; }
    }
    await queryClient.invalidateQueries();
    setBusy(false);
    setLocation('/app');
  };
  return <div className="w-[440px] max-w-full overflow-hidden rounded-2xl bg-background p-8 sm:p-10" data-testid="auth-form">
    <p className="font-mono text-[10px] uppercase tracking-[.24em] text-[#DD765D]">{mode === 'sign-up' ? 'Make your space' : 'Welcome back'}</p>
    <h1 className="mt-2 font-display text-4xl text-foreground">{mode === 'sign-up' ? 'Begin with a few quiet minutes.' : 'A little room is waiting.'}</h1>
    {needsConfirmation
      ? <p className="mt-6 text-sm leading-6 text-muted-foreground" data-testid="status-auth-confirm">Please check your inbox to confirm your email, then sign in.</p>
      : <form className="mt-8 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="block text-sm font-semibold text-foreground">Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 font-normal text-foreground outline-none focus:border-[#DD765D]" data-testid="input-auth-email" /></label>
        <label className="block text-sm font-semibold text-foreground">Password<input type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 font-normal text-foreground outline-none focus:border-[#DD765D]" data-testid="input-auth-password" /></label>
        {error && <p className="text-sm text-[#B9473B]" data-testid="status-auth-error">{error}</p>}
        <Button onClick={() => void submit()} disabled={busy || !email.trim() || !password} variant="primary" className="w-full" testId="button-auth-submit">{busy ? 'One moment…' : mode === 'sign-up' ? 'Create my space' : 'Sign in'}</Button>
      </form>}
    <p className="mt-6 text-center text-sm text-muted-foreground">{mode === 'sign-up' ? <>Already have a space? <Link href="/sign-in" className="font-semibold text-[#B85642]" data-testid="link-auth-switch">Sign in</Link></> : <>New here? <Link href="/sign-up" className="font-semibold text-[#B85642]" data-testid="link-auth-switch">Make your space</Link></>}</p>
  </div>;
}

function AuthPage({ signUp = false }: { signUp?: boolean }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-muted px-4 py-10"><div className="absolute left-6 top-6 sm:left-10 sm:top-8"><Logo /></div><FadeIn><AuthForm mode={signUp ? 'sign-up' : 'sign-in'} /></FadeIn></div>;
}
function HomeRedirect() { const { session, loading } = useSession(); if (loading) return <Landing />; return session ? <Redirect to="/app" /> : <Landing />; }
function Protected({ children }: { children: ReactNode }) { const { session, loading } = useSession(); const me = useGetMe(); const billing = useGetBillingStatus(); const [location] = useLocation(); if (loading) return <div className="mx-auto max-w-6xl px-5 py-16 sm:px-10"><Loading /></div>; if (!session) return <Redirect to="/" />; if (me.data && !me.data.onboardingComplete && location !== '/onboarding') return <Redirect to="/onboarding" />; if (billing.data && ['expired', 'past_due'].includes(billing.data.state) && location !== '/pricing') return <Redirect to="/pricing" />; return <>{children}</>; }
function Router() {
  const [location] = useLocation();
  return <AnimatePresence mode="wait" initial={false}><motion.div key={location} initial={{ opacity: 0, x: 52 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -52 }} transition={{ duration: 0.38, ease: 'easeOut' }}><ErrorBoundary resetKey={location}><Switch location={location}>
    <Route path="/" component={HomeRedirect} /><Route path="/sign-in/*?" component={() => <AuthPage />} /><Route path="/sign-up/*?" component={() => <AuthPage signUp />} />
    <Route path="/onboarding" component={() => <Protected><Onboarding /></Protected>} /><Route path="/app" component={() => <Protected><Dashboard /></Protected>} /><Route path="/choose-time" component={() => <Protected><ChooseTime /></Protected>} /><Route path="/choose-mood" component={() => <Protected><ChooseMood /></Protected>} /><Route path="/recommendations" component={() => <Protected><Recommendations /></Protected>} /><Route path="/activity/:id" component={() => <Protected><ActivityPage /></Protected>} /><Route path="/browse" component={() => <Protected><Browse /></Protected>} /><Route path="/begin/:id" component={() => <Protected><BeginPage /></Protected>} /><Route path="/history" component={() => <Protected><HistoryPage /></Protected>} /><Route path="/weekly-summary" component={() => <Protected><WeeklySummary /></Protected>} /><Route path="/pricing" component={() => <Protected><Pricing /></Protected>} /><Route path="/settings" component={() => <Protected><Settings /></Protected>} />
    <Route component={() => <div className="p-10">Not found</div>} />
  </Switch></ErrorBoundary></motion.div></AnimatePresence>;
}
function SessionRoutes() { return <AuthProvider><QueryClientProvider client={queryClient}><Router /></QueryClientProvider></AuthProvider>; }
function App() { useEffect(() => { const saved = localStorage.getItem('reclaim-theme'); if (saved === 'dark') document.documentElement.classList.add('dark'); }, []); return <TooltipProvider><MotionRoot><WouterRouter base={basePath}><SessionRoutes /></WouterRouter><Toaster /></MotionRoot></TooltipProvider>; }
export default App;
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionConfig, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeIn({ children, delay = 0, y = 26, className }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  return <motion.div className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay, ease: 'easeOut' }}>{children}</motion.div>;
}

export function Rise({ children, delay = 0, className }: {
  children: ReactNode; delay?: number; className?: string;
}) {
  return <motion.div className={className} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function Pop({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 13 }}>{children}</motion.div>;
}

const BURST_COLORS = ['#DD765D', '#E9B979', '#D8E0CF', '#F0D5C7', '#163D3B'];

export function Burst({ testId }: { testId?: string }) {
  const parts = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 90 + ((i * 37) % 60);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      c: BURST_COLORS[i % BURST_COLORS.length],
      s: 6 + ((i * 13) % 6),
      d: (i % 5) * 0.05,
    };
  }), []);
  return <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid={testId} aria-hidden>{parts.map((p, i) => <motion.span key={i} className="absolute rounded-full" style={{ width: p.s, height: p.s, backgroundColor: p.c }} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: p.x, y: -Math.abs(p.y) - 20, opacity: 0, scale: 0.4 }} transition={{ duration: 1.1, delay: p.d, ease: 'easeOut' }} />)}</div>;
}

export function CountUp({ value, className, testId }: {
  value: number; className?: string; testId?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);
  return <span className={className} data-testid={testId}>{shown}</span>;
}

export function Particles({ count = 22, className }: { count?: number; className?: string }) {
  const reduce = useReducedMotion();
  const dots = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: (i * 37.7) % 100,
    top: (i * 53.3) % 100,
    s: 3 + ((i * 7) % 5),
    dur: 7 + ((i * 11) % 6),
    negDelay: -((i * 1.7) % 9),
    c: i % 3 === 0 ? '#DD765D' : i % 3 === 1 ? '#E9B979' : '#B3C5B8',
    dx: ((i * 29) % 40) - 20,
    dy: -20 - ((i * 17) % 30),
  })), [count]);
  if (reduce) return null;
  return <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ''}`}>{dots.map((p, i) => <span key={i} className="particle-dot absolute rounded-full" style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.s, height: p.s, backgroundColor: p.c, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`, animationDuration: `${p.dur}s`, animationDelay: `${p.negDelay}s` }} />)}</div>;
}

export function Tilt({ children, className, max = 7 }: {
  children: ReactNode; className?: string; max?: number;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(my, { stiffness: 200, damping: 20 });
  const ry = useSpring(mx, { stiffness: 200, damping: 20 });
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div
    className={className}
    style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
    onMouseMove={e => {
      const r = e.currentTarget.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
      my.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
    }}
    onMouseLeave={() => { mx.set(0); my.set(0); }}
  >{children}</motion.div>;
}

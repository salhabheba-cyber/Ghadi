"use client";
import {
  BarChart3,
  BookOpen,
  Camera,
  Flame,
  Globe,
  Home,
  Library,
  ListChecks,
  Settings,
  User,
  Paperclip,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GhadiMascot } from "@/components/mascot";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useLive } from "@/hooks/use-live";
import { getDb } from "@/lib/storage/db";
import { activityDays, currentStreak, cardStats } from "@/lib/stats";

/* ── Floating decorative shape ── */
function FloatOrb({
  color,
  size,
  top,
  left,
  delay,
  duration,
}: {
  color: string;
  size: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top,
        left,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity: 0.18,
        animation: `floatOrb ${duration} ease-in-out ${delay} infinite alternate`,
        willChange: "transform",
      }}
    />
  );
}

/* ── Action card ── */
function ActionCard({
  href,
  emoji,
  label,
  sublabel,
  gradient,
  delay,
}: {
  href: string;
  emoji: string;
  label: string;
  sublabel: string;
  gradient: string;
  delay: string;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Link
      href={href}
      className="action-card-root"
      style={{ animationDelay: delay, textDecoration: "none" }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <div
        className="action-card"
        style={{
          background: gradient,
          transform: pressed ? "scale(0.96)" : "scale(1)",
          transition: "transform 0.12s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.12s ease",
          boxShadow: pressed
            ? "0 2px 12px rgba(124,58,237,0.15)"
            : "0 8px 28px rgba(124,58,237,0.20)",
        }}
      >
        <span className="action-emoji" aria-hidden>
          {emoji}
        </span>
        <span className="action-label">{label}</span>
        <span className="action-sub">{sublabel}</span>
      </div>
    </Link>
  );
}

/* ── Bottom nav item ── */
function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className="bottom-nav-item" aria-current={active ? "page" : undefined}>
      <Icon
        className="bottom-nav-icon"
        style={{ color: active ? "var(--color-brand-600)" : "var(--muted)" }}
        aria-hidden
      />
      <span
        className="bottom-nav-label"
        style={{ color: active ? "var(--color-brand-600)" : "var(--muted)" }}
      >
        {label}
      </span>
      {active && <span className="bottom-nav-pip" aria-hidden />}
    </Link>
  );
}

/* ── Stat chip ── */
function StatChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string | number;
  label: string;
}) {
  return (
    <div className="stat-chip">
      <Icon className="stat-chip-icon" aria-hidden />
      <span className="stat-chip-val">{value}</span>
      <span className="stat-chip-label">{label}</span>
    </div>
  );
}

export default function HomePage() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data } = useLive(async () => {
    const db = getDb();
    const [cards, attempts, reviews] = await Promise.all([
      db.cards.toArray(),
      db.attempts.toArray(),
      db.reviews.toArray(),
    ]);
    return { cards, attempts, reviews };
  }, []);

  const now = new Date();
  const days = data ? activityDays(data.reviews, data.attempts) : new Set<string>();
  const streak = currentStreak(days, now);
  const cs = data ? cardStats(data.cards, now) : { due: 0, total: 0, new: 0, mature: 0 };

  const cards = [
    {
      href: "/documents",
      emoji: "📎",
      label: "Attach File",
      sublabel: "PDF, Word, PPT & more",
      gradient: "linear-gradient(135deg, #ede5ff 0%, #dcceff 100%)",
      delay: "0ms",
    },
    {
      href: "/documents",
      emoji: "🔗",
      label: "Paste URL",
      sublabel: "Import a web page",
      gradient: "linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)",
      delay: "60ms",
    },
    {
      href: "/documents",
      emoji: "📷",
      label: "Attach Photos",
      sublabel: "Scan & extract text",
      gradient: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
      delay: "120ms",
    },
    {
      href: "/quizzes",
      emoji: "⚡",
      label: "Quick Quiz",
      sublabel: "Test your knowledge",
      gradient: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
      delay: "180ms",
    },
  ];

  const bottomNav = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/library", icon: Library, label: "Library" },
    { href: "/dashboard", icon: BarChart3, label: "Progress" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <>
      {/* Inline keyframes & component styles */}
      <style>{`
        @keyframes floatOrb {
          from { transform: translateY(0px) scale(1); }
          to   { transform: translateY(-20px) scale(1.08); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mascotFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes statPop {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }

        .home-root {
          min-height: 100dvh;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          padding-bottom: 80px; /* space for bottom nav */
        }

        /* ── Top bar ── */
        .home-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 8px;
          position: relative;
          z-index: 10;
        }
        .home-wordmark {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text);
          text-decoration: none;
        }
        .home-logo {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          object-fit: cover;
          box-shadow: 0 2px 8px rgba(124,58,237,0.25);
        }
        .home-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--muted);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .icon-btn:hover { background: var(--surface-2); color: var(--text); }

        /* ── Stats row ── */
        .stats-row {
          display: flex;
          gap: 10px;
          padding: 8px 20px 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .stats-row::-webkit-scrollbar { display: none; }
        .stat-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 6px 14px;
          white-space: nowrap;
          animation: statPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .stat-chip-icon { width: 14px; height: 14px; color: var(--color-brand-500); }
        .stat-chip-val  { font-size: 0.875rem; font-weight: 700; color: var(--text); }
        .stat-chip-label { font-size: 0.75rem; color: var(--muted); }

        /* ── Mascot zone ── */
        .mascot-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 20px 0;
          position: relative;
          z-index: 2;
        }
        .mascot-wrap {
          animation: mascotFloat 4s ease-in-out infinite;
          will-change: transform;
        }
        .mascot-greeting {
          margin-top: 8px;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
        }
        .mascot-sub {
          margin-top: 2px;
          font-size: 0.82rem;
          color: var(--muted);
          text-align: center;
        }

        /* ── Action cards grid ── */
        .cards-section {
          padding: 20px 16px 0;
          position: relative;
          z-index: 2;
        }
        .cards-heading {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          margin-bottom: 12px;
          padding-left: 4px;
        }
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .action-card-root {
          animation: cardEntrance 0.45s cubic-bezier(0.34,1.2,0.64,1) both;
        }
        .action-card {
          border-radius: 20px;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          border: 1.5px solid rgba(255,255,255,0.6);
        }
        .dark .action-card {
          border-color: rgba(255,255,255,0.08);
          filter: brightness(0.85) saturate(0.9);
        }
        .action-emoji { font-size: 2rem; line-height: 1; margin-bottom: 4px; }
        .action-label {
          font-size: 0.95rem;
          font-weight: 700;
          color: #1e1030;
          line-height: 1.2;
        }
        .dark .action-label { color: var(--text); }
        .action-sub {
          font-size: 0.75rem;
          color: #6b5c8a;
          line-height: 1.3;
        }
        .dark .action-sub { color: var(--muted); }

        /* ── Quick access strip ── */
        .quick-strip {
          display: flex;
          gap: 10px;
          padding: 16px 16px 0;
          position: relative;
          z-index: 2;
        }
        .quick-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 11px 8px;
          border-radius: 14px;
          border: 1.5px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.13s, transform 0.13s;
          -webkit-tap-highlight-color: transparent;
        }
        .quick-btn:hover  { background: var(--surface-2); }
        .quick-btn:active { transform: scale(0.96); }
        .quick-btn-icon { width: 15px; height: 15px; color: var(--color-brand-500); }

        /* ── Bottom navigation ── */
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          padding: 8px 0 env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -4px 20px rgba(0,0,0,0.06);
        }
        .bottom-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 6px 4px;
          text-decoration: none;
          position: relative;
          transition: transform 0.12s;
          -webkit-tap-highlight-color: transparent;
        }
        .bottom-nav-item:active { transform: scale(0.9); }
        .bottom-nav-icon { width: 22px; height: 22px; transition: color 0.15s; }
        .bottom-nav-label {
          font-size: 0.68rem;
          font-weight: 600;
          transition: color 0.15s;
        }
        .bottom-nav-pip {
          position: absolute;
          bottom: -1px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 3px;
          border-radius: 2px;
          background: var(--color-brand-600);
        }

        /* Floating orb layer */
        .orb-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        /* Milestone celebration — hidden by default */
        @keyframes burstIn {
          from { opacity: 0; transform: scale(0.5) translateY(20px); }
          80%  { opacity: 1; transform: scale(1.05) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .milestone-badge {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: var(--color-brand-600);
          color: #fff;
          border-radius: 20px;
          padding: 8px 20px;
          font-size: 0.9rem;
          font-weight: 700;
          box-shadow: 0 4px 20px rgba(124,58,237,0.4);
          animation: burstIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
          pointer-events: none;
        }

        @media (min-width: 640px) {
          .home-root { max-width: 480px; margin: 0 auto; }
          .mascot-wrap svg { width: 160px; height: 200px; }
        }
      `}</style>

      <div className="home-root">
        {/* Floating background orbs */}
        <div className="orb-layer" aria-hidden>
          <FloatOrb color="#c4aafd" size={120} top="5%" left="-10%" delay="0s" duration="5s" />
          <FloatOrb color="#fde047" size={80} top="12%" left="75%" delay="1.2s" duration="6s" />
          <FloatOrb color="#f9a8d4" size={60} top="55%" left="80%" delay="0.6s" duration="4.5s" />
          <FloatOrb color="#86efac" size={70} top="70%" left="-8%" delay="2s" duration="5.5s" />
          <FloatOrb color="#a87df8" size={40} top="40%" left="85%" delay="3s" duration="7s" />
        </div>

        {/* ── Top bar ── */}
        <header className="home-topbar">
          <Link href="/" className="home-wordmark" aria-label="Ghadi home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ghadi-logo-128.webp" alt="" className="home-logo" width={36} height={36} />
            Ghadi
          </Link>
          <div className="home-topbar-right">
            <ThemeToggle />
            <Link href="/settings" className="icon-btn" aria-label="Settings">
              <Settings size={16} />
            </Link>
          </div>
        </header>

        {/* ── Stats strip ── */}
        {mounted && (
          <div className="stats-row" role="region" aria-label="Study statistics">
            <StatChip
              icon={Flame}
              value={streak}
              label={streak === 1 ? "day streak" : "day streak"}
            />
            <StatChip icon={ListChecks} value={cs.due} label="cards due" />
            <StatChip icon={BookOpen} value={cs.total} label="total cards" />
          </div>
        )}

        {/* ── Mascot + greeting ── */}
        <section className="mascot-zone" aria-label="Mascot">
          <div className="mascot-wrap">
            <GhadiMascot style={{ width: 140, height: 175 }} />
          </div>
          <p className="mascot-greeting">
            {streak > 0 ? `${streak}-day streak! 🔥 Keep it up!` : "Ready to learn something new?"}
          </p>
          <p className="mascot-sub">What would you like to study today?</p>
        </section>

        {/* ── 4 Action cards ── */}
        <section className="cards-section" aria-label="Start studying">
          <p className="cards-heading">Get started</p>
          <div className="cards-grid">
            {cards.map((c) => (
              <ActionCard key={c.label} {...c} />
            ))}
          </div>
        </section>

        {/* ── Quick-access strip ── */}
        <div className="quick-strip" role="navigation" aria-label="Quick access">
          <Link href="/notes" className="quick-btn">
            <BookOpen className="quick-btn-icon" aria-hidden />
            Study Notes
          </Link>
          <Link href="/review" className="quick-btn">
            <ListChecks className="quick-btn-icon" aria-hidden />
            Review Cards
          </Link>
          <Link href="/library" className="quick-btn">
            <Library className="quick-btn-icon" aria-hidden />
            My Library
          </Link>
        </div>
      </div>

      {/* ── Bottom navigation (fixed) ── */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {bottomNav.map(({ href, icon, label }) => (
          <NavItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            active={pathname === href}
          />
        ))}
      </nav>
    </>
  );
}

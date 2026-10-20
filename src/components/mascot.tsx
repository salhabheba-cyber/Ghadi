"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * Ghadi mascot – inline animated SVG.
 * The character has dark wavy hair, round glasses, and a daisy necklace.
 * Respects prefers-reduced-motion: no animations when reduced-motion is on.
 */
export function GhadiMascot({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [blink, setBlink] = useState(false);
  const [wave, setWave] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOk) return;

    // Random blink every 3-6 s
    function scheduleBlink() {
      timerRef.current = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => {
            setBlink(false);
            scheduleBlink();
          }, 150);
        },
        3000 + Math.random() * 3000,
      );
    }

    // Wave once after 1 s
    const waveTimer = setTimeout(() => {
      setWave(true);
      setTimeout(() => setWave(false), 800);
    }, 1000);

    scheduleBlink();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(waveTimer);
    };
  }, []);

  return (
    <svg
      viewBox="0 0 160 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Ghadi mascot — cartoon girl with dark wavy hair and round glasses"
      role="img"
    >
      {/* ── BODY ── */}
      {/* Torso / shirt — soft lavender */}
      <rect x="50" y="130" width="60" height="55" rx="12" fill="#c4aafd" />
      {/* Collar detail */}
      <path d="M72 130 Q80 142 88 130" stroke="#a87df8" strokeWidth="1.5" fill="none" />

      {/* Daisy necklace */}
      <circle cx="80" cy="128" r="4" fill="#fde047" />
      <circle cx="80" cy="121" r="1.5" fill="#fde047" />
      <circle cx="75" cy="123" r="1.5" fill="#fde047" />
      <circle cx="73" cy="128" r="1.5" fill="#fde047" />
      <circle cx="75" cy="133" r="1.5" fill="#fde047" />
      <circle cx="85" cy="123" r="1.5" fill="#fde047" />
      <circle cx="87" cy="128" r="1.5" fill="#fde047" />
      <circle cx="85" cy="133" r="1.5" fill="#fde047" />

      {/* Arms */}
      {/* Left arm — static */}
      <rect
        x="30"
        y="132"
        width="22"
        height="11"
        rx="5.5"
        fill="#c4aafd"
        style={{ transformOrigin: "52px 137px", transform: "rotate(10deg)" }}
      />
      {/* Right arm — waves */}
      <rect
        x="108"
        y="132"
        width="22"
        height="11"
        rx="5.5"
        fill="#c4aafd"
        style={{
          transformOrigin: "108px 137px",
          transform: wave ? "rotate(-40deg)" : "rotate(-10deg)",
          transition: wave ? "transform 0.15s ease-out" : "transform 0.4s ease-in-out",
        }}
      />

      {/* ── NECK ── */}
      <rect x="72" y="118" width="16" height="14" rx="6" fill="#f5c5a3" />

      {/* ── HEAD ── */}
      <ellipse cx="80" cy="92" rx="38" ry="40" fill="#f5c5a3" />

      {/* ── HAIR (dark brown, wavy) ── */}
      {/* Main hair mass */}
      <path
        d="M42 82 C36 60 44 38 60 28 C68 23 75 20 80 20 C88 18 96 21 104 27 C118 37 124 60 118 82"
        fill="#2d1a0e"
      />
      {/* Side tendrils */}
      <path d="M42 82 C38 96 40 108 44 118" stroke="#2d1a0e" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M118 82 C122 96 120 108 116 118" stroke="#2d1a0e" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Wave accents */}
      <path d="M50 54 C46 62 48 70 44 78" stroke="#3d2512" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M110 54 C114 62 112 70 116 78" stroke="#3d2512" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* ── GLASSES ── */}
      {/* Frames */}
      <circle cx="67" cy="93" r="12" stroke="#2d1a0e" strokeWidth="2.5" fill="white" fillOpacity="0.7" />
      <circle cx="93" cy="93" r="12" stroke="#2d1a0e" strokeWidth="2.5" fill="white" fillOpacity="0.7" />
      {/* Bridge */}
      <path d="M79 93 L81 93" stroke="#2d1a0e" strokeWidth="2.5" strokeLinecap="round" />
      {/* Temples */}
      <path d="M55 93 L48 90" stroke="#2d1a0e" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M105 93 L112 90" stroke="#2d1a0e" strokeWidth="2.5" strokeLinecap="round" />
      {/* Lens highlight */}
      <circle cx="63" cy="89" r="2.5" fill="white" fillOpacity="0.5" />
      <circle cx="89" cy="89" r="2.5" fill="white" fillOpacity="0.5" />

      {/* ── EYES (inside lenses) ── */}
      {blink ? (
        <>
          {/* Closed eyes — arcs */}
          <path d="M62 93 Q67 90 72 93" stroke="#2d1a0e" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M88 93 Q93 90 98 93" stroke="#2d1a0e" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Open eyes */}
          <circle cx="67" cy="93" r="4.5" fill="#2d1a0e" />
          <circle cx="93" cy="93" r="4.5" fill="#2d1a0e" />
          <circle cx="65" cy="91" r="1.2" fill="white" />
          <circle cx="91" cy="91" r="1.2" fill="white" />
        </>
      )}

      {/* ── NOSE + MOUTH ── */}
      <circle cx="80" cy="104" r="1.5" fill="#e8a882" />
      {/* Smile */}
      <path d="M72 110 Q80 117 88 110" stroke="#c0745a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Cheek blush */}
      <ellipse cx="55" cy="105" rx="7" ry="4" fill="#f9a8d4" fillOpacity="0.5" />
      <ellipse cx="105" cy="105" rx="7" ry="4" fill="#f9a8d4" fillOpacity="0.5" />

      {/* ── HAIR HIGHLIGHT ── */}
      <path d="M70 26 C66 30 62 36 60 44" stroke="#4a2a14" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

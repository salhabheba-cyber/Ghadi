"use client";
import { useEffect, useRef, useState } from "react";

export type AvatarState = "idle" | "speaking" | "listening";

/**
 * Teacher picture supplied by the product owner (public/teacher/teacher.jpg) with an "AI" badge.
 * - If short video clips exist (public/teacher/idle.mp4, speaking.mp4, listening.mp4) the matching one loops for the
 *   current state. The speaking clip is a generic talking loop: it is NOT lip-synced to the actual words.
 * - Otherwise the still photo is shown with gentle CSS motion (breathing, a small tilt when listening, a ring while speaking).
 * It is not a real-time or lip-synced avatar; no avatar provider is connected. The teacher is a computer program.
 */
export function Avatar({ speaking = false, listening = false, label, clipSrc = null, onClipEnd, onClipFail }: {
  speaking?: boolean; listening?: boolean; label: string;
  /** A pre-rendered lip-synced clip of THIS exact sentence (with its own audio). Plays once, then onClipEnd. */
  clipSrc?: string | null; onClipEnd?: () => void; onClipFail?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // Browsers may refuse unmuted autoplay without a recent tap; then we fall back to the photo + browser voice.
    if (clipSrc && ref.current) ref.current.play().catch(() => onClipFail?.());
  }, [clipSrc, onClipFail]);
  const state: AvatarState = speaking ? "speaking" : listening ? "listening" : "idle";
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  // Clips are only requested when the operator has added them and set NEXT_PUBLIC_TEACHER_CLIPS=1 (avoids 404 probes).
  const clip = process.env.NEXT_PUBLIC_TEACHER_CLIPS === "1" && !missing[state];
  return (
    <span className={`avatar-photo is-${clipSrc ? "clip" : state}`} role="img" aria-label={label}>
      {clipSrc ? (
        <video ref={ref} key={clipSrc} className="avatar-media" src={clipSrc} poster="/teacher/teacher.jpg" playsInline preload="auto" aria-hidden="true" onEnded={onClipEnd} onError={onClipFail} />
      ) : clip ? (
        <video key={state} className="avatar-media" src={`/teacher/${state}.mp4`} poster="/teacher/teacher.jpg" autoPlay loop muted playsInline preload="metadata" aria-hidden="true" onError={() => setMissing((m) => ({ ...m, [state]: true }))} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar-media" src="/teacher/teacher.jpg" width={320} height={320} alt="" decoding="async" />
      )}
      <span className="avatar-badge" aria-hidden="true">AI</span>
    </span>
  );
}

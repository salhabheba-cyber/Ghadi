"use client";

import { useEffect, useRef } from "react";
import "./home.css";
import { HOME_HTML } from "./home-markup";
import { mountHome } from "./home-client";


/* Ghadi home — the approved HTML artifact. Styles live in home.css (scoped to #ghadi-home),
   behaviour in home-client.ts, so everything is served from 'self' and passes the strict CSP. */
export default function HomePage() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? mountHome(ref.current) : undefined), []);
  return (
    <div
      id="ghadi-home"
      ref={ref}
     
      dangerouslySetInnerHTML={{ __html: HOME_HTML }}
    />
  );
}

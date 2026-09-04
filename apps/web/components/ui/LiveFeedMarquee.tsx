"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const RECENT_BOUNTIES = [
  { id: 1, title: "DeFi Yield Aggregator Contract", amount: "$12,500", role: "Smart Contract Dev" },
  { id: 2, title: "ZK-Rollup React Frontend", amount: "$8,200", role: "Frontend Eng" },
  { id: 3, title: "NFT Marketplace Audit", amount: "$4,500", role: "Security Auditor" },
  { id: 4, title: "Rust Substrate Node Setup", amount: "$15,000", role: "DevOps Eng" },
  { id: 5, title: "Cross-Chain Bridge SDK", amount: "$22,000", role: "Core Dev" },
  { id: 6, title: "Tokenomics Whitepaper Design", amount: "$3,000", role: "UI/UX Designer" },
];

// Tripled so the -33.333% keyframe loop is seamless.
const MARQUEE_ITEMS = [...RECENT_BOUNTIES, ...RECENT_BOUNTIES, ...RECENT_BOUNTIES];

export default function LiveFeedMarquee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-15%" });
  const [assembled, setAssembled] = useState(false);

  // The row slides in from the right exactly once, the first time it's seen,
  // then hands off to the perpetual loop for good — later opacity fades
  // (below) never touch its motion again, so the speed never changes.
  const [enterStarted, setEnterStarted] = useState(false);
  const [looping, setLooping] = useState(false);

  // Fade the cards in shortly after the heading has settled. A single state
  // flip — no per-frame React updates — keeps the section smooth.
  useEffect(() => {
    if (!isInView) {
      setAssembled(false);
      return;
    }
    const t = setTimeout(() => setAssembled(true), 650);
    return () => clearTimeout(t);
  }, [isInView]);

  // Latch true the first time `assembled` flips true, and never again —
  // React's "adjust state during render" pattern, no effect needed.
  if (assembled && !enterStarted) {
    setEnterStarted(true);
  }

  const letters = "LIVE FEED".split("");

  return (
    <section
      ref={containerRef}
      className="relative w-full py-36 md:py-44 overflow-hidden text-foreground flex flex-col justify-center"
    >
      {/* Background heading — dims once the cards are in. */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none z-0 transition-opacity duration-[1500ms] ease-out ${
          assembled ? "opacity-40" : "opacity-100"
        }`}
      >
        <div className="flex justify-center overflow-hidden">
          {letters.map((char, index) => (
            <motion.span
              key={index}
              initial={{ y: "110%", opacity: 0 }}
              animate={isInView ? { y: "0%", opacity: 1 } : { y: "110%", opacity: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 90, delay: index * 0.045 }}
              className={`w3-livefeed-letter text-[6rem] sm:text-[10rem] md:text-[15rem] leading-none font-black tracking-tighter uppercase ${
                char === " " ? "w-8 md:w-20" : ""
              }`}
              style={{ animationDelay: `${index * 0.16}s` }}
            >
              {char}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Foreground marquee — the CSS keyframe is the only moving transform;
          the entrance is a pure opacity fade so nothing compounds. */}
      <div
        className="relative z-10 flex flex-col justify-center transition-opacity duration-700 ease-out"
        style={{ opacity: assembled ? 1 : 0 }}
      >
        {/* Slides in from fully off-screen right exactly once (enterStarted),
            then hands off to the perpetual loop (looping) from the exact
            position it left off at — no jump, no restart, constant speed
            from that point on regardless of how often the section scrolls
            in and out of view afterward. */}
        <div
          className={`w3-marquee-row flex w-[300%] items-center ${
            looping
              ? "animate-[w3-marquee-left_44s_linear_infinite]"
              : enterStarted
              ? "animate-[w3-marquee-enter_1.1s_ease-out_forwards]"
              : ""
          }`}
          style={!enterStarted ? { transform: "translateX(33.3334%)" } : undefined}
          onAnimationEnd={() => {
            if (!looping) setLooping(true);
          }}
        >
          {MARQUEE_ITEMS.map((item, idx) => {
            const yOffset =
              idx % 3 === 0 ? "translate-y-10" : idx % 3 === 1 ? "-translate-y-8" : "translate-y-3";
            return (
              <div
                key={`r1-${idx}`}
                className={`shrink-0 w-[280px] md:w-[350px] mx-6 p-5 md:p-6 rounded-2xl border-2 border-surface-border bg-surface/80 backdrop-blur-xl hover:border-moss/50 transition-colors shadow-2xl ${yOffset}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs md:text-sm font-mono text-moss px-3 py-1 rounded-full bg-moss/10">
                    {item.role}
                  </span>
                  <span className="font-bold text-lg text-[#22C55E] font-mono">{item.amount}</span>
                </div>
                <h4 className="text-base md:text-lg font-bold text-foreground">{item.title}</h4>
                <div className="mt-4 flex items-center justify-between text-xs text-muted font-mono">
                  <span>Escrowed</span>
                  <span>Just now</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-6 md:bottom-8 z-20 flex justify-center w-full transition-opacity duration-700 ${
          assembled ? "opacity-100" : "opacity-0"
        }`}
      >
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="group flex items-center gap-2 px-8 py-4 bg-moss hover:bg-[#BEF264] text-background shadow-xl shadow-moss/20 font-bold rounded-full transition-colors"
        >
          Explore All Bounties
          <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
        </motion.button>
      </div>
    </section>
  );
}

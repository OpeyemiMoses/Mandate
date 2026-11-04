"use client";

import React, { useEffect } from "react";

/**
 * Universal Scroll Reveal Controller for Mandate
 * Automatically attaches an IntersectionObserver to sections, cards, and reveal targets
 * so animations trigger smoothly as the user scrolls them into view.
 */
export function ScrollRevealInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            // Optionally unobserve once revealed for performance
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const observeTargets = () => {
      const targets = document.querySelectorAll(
        ".reveal-on-scroll, section:not(#top), .glowing-card, .phone-3d, .node-3d-left, .node-3d-right"
      );
      targets.forEach((target) => {
        // If already in top viewport, reveal immediately
        const rect = target.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.95 && rect.bottom > 0) {
          target.classList.add("revealed");
        } else {
          observer.observe(target);
        }
      });
    };

    observeTargets();

    // Re-check on dynamic DOM mutations or route changes
    const timer = setTimeout(observeTargets, 400);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return null;
}

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  direction?: "up" | "down" | "left" | "right" | "pop";
}

export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
  direction = "up",
}: ScrollRevealProps) {
  const dirClass =
    direction === "pop"
      ? "reveal-pop"
      : direction === "left"
      ? "reveal-left"
      : direction === "right"
      ? "reveal-right"
      : "reveal-up";

  return (
    <div
      className={`reveal-on-scroll ${dirClass} ${className}`}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

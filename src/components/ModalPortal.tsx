"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ModalPortalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  maxWidth?: string; // e.g. "max-w-md", "max-w-lg", "max-w-xl", "max-w-2xl", "max-w-3xl"
  className?: string;
  closeOnBackdropClick?: boolean;
  /** When true, renders children directly inside the centered viewport without the default card styling */
  customCard?: boolean;
}

export function ModalPortal({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-lg",
  className = "",
  closeOnBackdropClick = true,
  customCard = false,
}: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6 text-center">
        {customCard ? (
          <div
            className={`relative w-full ${maxWidth} max-w-[calc(100vw-1.5rem)] text-left ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        ) : (
          <div
            className={`relative w-full ${maxWidth} max-w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto text-left rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#23232A] p-5 sm:p-6 shadow-2xl text-slate-900 dark:text-[#E5E7EB] space-y-5 animate-pop ${className}`}
            style={{
              boxShadow:
                "0 20px 60px -15px rgba(255, 59, 48, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}


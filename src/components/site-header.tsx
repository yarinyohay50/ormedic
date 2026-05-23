import { Link } from "@tanstack/react-router";
import { Settings, HelpCircle } from "lucide-react";
import shieldEmblem from "@/assets/shield-emblem-normalized.png";
import idfEmblem from "@/assets/idf-emblem-normalized.png";

export function SiteHeader() {
  return (
    <header className="w-full pt-6 pb-2">
      <div className="container mx-auto px-4 flex items-start justify-between">
        {/* Right (in RTL = first) — guidance */}
        <div className="flex flex-col items-center gap-2">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-card/40 px-4 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            הדרכה
          </Link>
          <Link
            to="/about"
            aria-label="הדרכה"
            className="h-16 w-16 rounded-full bg-white shadow-[0_0_25px_rgba(212,175,55,0.35)] ring-1 ring-primary/40 overflow-hidden flex items-center justify-center"
          >
            <img
              src={idfEmblem}
              alt="סמל צה״ל"
              className="h-[3.15rem] w-[3.15rem] object-contain"
            />
          </Link>
        </div>

        {/* Left — admin */}
        <div className="flex flex-col items-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-card/40 px-4 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <Settings className="h-4 w-4" />
            ניהול
          </Link>
          <Link
            to="/admin"
            aria-label="ניהול"
            className="h-16 w-16 rounded-full bg-white shadow-[0_0_25px_rgba(212,175,55,0.35)] ring-1 ring-primary/40 overflow-hidden flex items-center justify-center"
          >
            <img
              src={shieldEmblem}
              alt="סמל מנהלים"
              className="h-[2.7rem] w-[2.7rem] object-contain"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
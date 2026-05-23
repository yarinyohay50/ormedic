import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HelpCircle, FileText, Phone, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "הדרכה - הזמנת הרצאות בטיחות" },
      { name: "description", content: "מדריך שימוש במערכת הזמנת הצגות והרצאות בטיחות." },
    ],
  }),
});

const STEPS = [
  {
    icon: FileText,
    title: "הגשת בקשה",
    desc: "מלאו את הטופס עם פרטי היחידה, תאריכים מבוקשים ומיקום. כמות משתתפים: 20-30.",
  },
  {
    icon: ShieldCheck,
    title: "אישור מהניהול",
    desc: "צוות הניהול בודק, מאשר את הבקשה ומשבץ מדריך ומספר השתלמות.",
  },
  {
    icon: Phone,
    title: "בדיקת סטטוס",
    desc: "השתמשו במספר ההזמנה (NM-XXXXX) שקיבלתם בעת ההגשה כדי לעקוב אחר הסטטוס.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-4 py-8 max-w-xl flex-1">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/30 mb-4">
            <HelpCircle className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-primary">הדרכה</h1>
          <p className="text-sm text-muted-foreground mt-2">
            איך מזמינים הצגה / הרצאת בטיחות
          </p>
        </div>
        <div className="space-y-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl bg-card/70 border border-border p-5 flex gap-4 items-start"
            >
              <div className="shrink-0 h-12 w-12 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center text-primary-foreground font-extrabold">
                {i + 1}
              </div>
              <div className="flex-1">
                <h3 className="font-bold mb-1 flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-primary" /> {s.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
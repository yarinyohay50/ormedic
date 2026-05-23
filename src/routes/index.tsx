import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useServerFn } from "@tanstack/react-start";
import { lookupBooking } from "@/server/bookings.functions";
import { STATUS_LABELS } from "@/lib/military";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "הזמנת כיתת נהיגה מונעת" },
      {
        name: "description",
        content:
          "מערכת הזמנת הצגות והרצאות בטיחות בנהיגה מונעת ליחידות צה״ל. הגשת בקשה ובדיקת סטטוס לפי מספר הזמנה.",
      },
    ],
  }),
});

type LookupResult = Awaited<ReturnType<typeof lookupBooking>>;

function Index() {
  const navigate = useNavigate();
  const lookup = useServerFn(lookupBooking);
  const [tab, setTab] = useState<"new" | "status">("new");
  const [reference, setReference] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!reference.trim()) {
      toast.error("נא להזין מספר הזמנה");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const res = await lookup({ data: { reference } });
      setResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 container mx-auto px-4 max-w-xl">
        {/* Logo hero */}
        <div className="flex flex-col items-center text-center pt-2 pb-6">
          <div className="relative mt-2 mb-6">
            <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-[image:var(--gradient-primary)] rounded-full" />
            <div className="rounded-2xl bg-black p-6 shadow-[var(--shadow-glow)]">
              <img
                src={logo}
                alt="לוגו דרך בטוחה"
                className="h-48 w-48 object-contain"
              />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
            הזמנת כיתת נהיגה מונעת
          </h1>
        </div>

        {/* Tabs */}
        <div className="rounded-full bg-card/60 border border-border p-1 grid grid-cols-2 mb-5">
          <button
            onClick={() => setTab("new")}
            className={`rounded-full py-3 text-sm font-semibold transition-all ${
              tab === "new"
                ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            הגשה חדשה
          </button>
          <button
            onClick={() => setTab("status")}
            className={`rounded-full py-3 text-sm font-semibold transition-all ${
              tab === "status"
                ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            בדיקת סטטוס
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card/70 border border-border p-6 shadow-[var(--shadow-card)] backdrop-blur-sm">
          {tab === "new" ? (
            <>
              <h2 className="text-xl font-bold text-primary text-center mb-3">
                פרטי המגיש
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                התחל הזמנה חדשה — מלא פרטי יחידה, תאריכים מבוקשים וכמות משתתפים.
              </p>
              <Button
                variant="cta"
                size="xl"
                className="w-full"
                onClick={() => navigate({ to: "/booking" })}
              >
                התחל הזמנה
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-primary text-center mb-3">
                בדיקת סטטוס הזמנה
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-5 leading-relaxed">
                הזן את מספר ההזמנה שקיבלת בעת ההגשה (לדוגמה 01001).
              </p>
              <form onSubmit={handleLookup} className="space-y-3">
                <Input
                  value={reference}
                  onChange={(e) =>
                    setReference(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="01001"
                  inputMode="numeric"
                  maxLength={10}
                  className="text-center text-lg font-bold tracking-wider"
                  dir="ltr"
                />
                <Button
                  type="submit"
                  variant="cta"
                  size="xl"
                  className="w-full"
                  disabled={searching}
                >
                  {searching ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-5 w-5" /> בדוק סטטוס
                    </>
                  )}
                </Button>
              </form>

              {result && (
                <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">מס׳ הזמנה</span>
                    <span className="font-bold text-primary" dir="ltr">
                      {result.reference_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">מגיש</span>
                    <span>{result.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">יחידה</span>
                    <span>{result.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">תאריכים</span>
                    <span dir="ltr">
                      {result.start_date} → {result.end_date}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">סטטוס</span>
                    <span className="font-bold text-primary">
                      {STATUS_LABELS[result.status]?.label ?? result.status}
                    </span>
                  </div>
                  {result.instructor_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">מדריך</span>
                      <span>{result.instructor_name}</span>
                    </div>
                  )}
                  {result.course_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">מס׳ השתלמות</span>
                      <span>{result.course_number}</span>
                    </div>
                  )}
                  {result.notes && (
                    <div className="border-t border-border/40 pt-2 mt-2">
                      <div className="text-muted-foreground mb-1">הערות מהמנהל</div>
                      <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm whitespace-pre-wrap">
                        {result.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </main>

      <SiteFooter />
      <Toaster />
    </div>
  );
}

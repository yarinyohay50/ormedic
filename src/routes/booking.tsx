import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { CheckCircle2, ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { submitBooking } from "@/server/bookings.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/booking")({
  component: BookingPage,
  head: () => ({
    meta: [
      { title: "הזמנת השתלמות נהיגה מונעת" },
      {
        name: "description",
        content: "טופס הזמנת השתלמות נהיגה מונעת ליחידות צה״ל.",
      },
    ],
  }),
});

const today = () => new Date().toISOString().split("T")[0];

// Last day of NEXT month — limits how far ahead a course can start.
// Since the course is 2 consecutive days, the start date itself must be
// no later than (last day of next month) - 1, so the second day still fits.
const maxStartDate = () => {
  const now = new Date();
  // Day 0 of (current month + 2) === last day of next month
  const lastDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  // Subtract one day so the 2-day course ends within next month
  lastDayNextMonth.setDate(lastDayNextMonth.getDate() - 1);
  return lastDayNextMonth.toISOString().split("T")[0];
};

const addDays = (isoDate: string, days: number) => {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

function BookingPage() {
  const navigate = useNavigate();
  const submit = useServerFn(submitBooking);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    id_number: "",
    phone: "",
    start_date: "",
    end_date: "",
    unit: "",
    command: "",
    participants_count: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateStartDate(value: string) {
    setForm((prev) => ({
      ...prev,
      start_date: value,
      end_date: value ? addDays(value, 1) : "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const required: Array<keyof typeof form> = [
      "full_name",
      "id_number",
      "phone",
      "start_date",
      "end_date",
      "unit",
      "command",
      "participants_count",
    ];
    for (const k of required) {
      if (!form[k]) {
        toast.error("אנא מלאו את כל השדות");
        return;
      }
    }
    if (form.end_date !== addDays(form.start_date, 1)) {
      toast.error("ההשתלמות היא יומיים רצופים — יום אחרי יום");
      return;
    }
    if (form.start_date > maxStartDate()) {
      toast.error("ניתן להזמין רק עד סוף החודש העוקב");
      return;
    }
    const count = Number(form.participants_count);
    if (!Number.isFinite(count) || count < 20 || count > 30) {
      toast.error("כמות המשתתפים חייבת להיות בין 20 ל-30");
      return;
    }
    setLoading(true);
    try {
      const res = await submit({
        data: { ...form, participants_count: count },
      });
      setRefNumber(res.reference_number);
      setSubmitted(true);
      toast.success("הבקשה התקבלה בהצלחה");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <section className="container mx-auto px-4 py-20 max-w-2xl flex-1">
          <Card className="p-10 text-center">
            <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h1 className="text-3xl font-extrabold mb-3">הבקשה התקבלה ✓</h1>
            <div className="mb-6 mx-auto inline-block rounded-xl border border-primary/40 bg-primary/5 px-6 py-3">
              <div className="text-xs text-muted-foreground mb-1">מספר הזמנה לבדיקת סטטוס</div>
              <div className="text-2xl font-extrabold text-primary tracking-wider" dir="ltr">
                {refNumber}
              </div>
            </div>
            <p className="text-muted-foreground mb-2">
              שלום {form.full_name}, בקשת ההזמנה שלך עבור יחידת{" "}
              <strong>{form.unit}</strong> התקבלה ועברה לאישור הניהול.
            </p>
            <p className="text-muted-foreground mb-8">
              שמור את מספר ההזמנה — באמצעותו תוכל לבדוק סטטוס בכל עת בדף הבית.
            </p>
            <Button variant="cta" size="lg" onClick={() => navigate({ to: "/" })}>
              חזרה לדף הבית <ArrowLeft className="h-4 w-4" />
            </Button>
          </Card>
        </section>
        <SiteFooter />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-4 py-12 max-w-3xl flex-1">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3">
            הזמנת השתלמות נהיגה מונעת
          </h1>
          <p className="text-lg text-muted-foreground">
            טופס הזמנה ליחידות צה״ל
          </p>
        </div>

        <Card className="p-4 mb-6 border-accent/40 bg-accent/10 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            <strong>סיווג: בלמ״ס בלבד.</strong> אין להזין פרטי יחידות מסווגות
            או מידע רגיש בטופס זה.
          </p>
        </Card>

        <Card className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">שם מלא *</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  placeholder="שם פרטי ומשפחה"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="id_number">מספר אישי / ת״ז *</Label>
                <Input
                  id="id_number"
                  value={form.id_number}
                  onChange={(e) =>
                    update("id_number", e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="1234567"
                  inputMode="numeric"
                  maxLength={9}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">טלפון ליצירת קשר *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="050-0000000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participants_count">כמות משתתפים (20-30) *</Label>
                <Input
                  id="participants_count"
                  type="number"
                  min={20}
                  max={30}
                  value={form.participants_count}
                  onChange={(e) =>
                    update("participants_count", e.target.value)
                  }
                  placeholder="בין 20 ל-30"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">תאריך תחילת ההשתלמות *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  min={today()}
                  max={maxStartDate()}
                  onChange={(e) => updateStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  ההשתלמות היא יומיים רצופים. ניתן להזמין עד סוף החודש העוקב.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">תאריך סיום (אוטומטי)</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">יחידה (בלמ״ס בלבד) *</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
                placeholder="שם היחידה"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="command">פיקוד *</Label>
              <Input
                id="command"
                value={form.command}
                onChange={(e) => update("command", e.target.value)}
                placeholder="לדוגמה: פיקוד צפון"
                maxLength={100}
              />
            </div>

            <Button
              type="submit"
              variant="cta"
              size="xl"
              className="w-full"
              disabled={loading}
            >
              {loading ? "שולח..." : "שליחת בקשה"}
            </Button>
          </form>
        </Card>
      </section>
      <SiteFooter />
      <Toaster />
    </div>
  );
}

// Hidden marker for form usage
void Textarea;
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useCallback } from "react";
import {
  Lock,
    RefreshCw,
  Search,
  Pencil,
  Trash2,
  ShieldCheck,
  KeyRound,
  LogOut,
  ArrowRight,
  Sheet as SheetIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListBookings,
  adminUpdateBooking,
  adminVerifyPassword,
  adminDeleteBooking,
  adminChangePassword,
  adminGetSheetUrl,
} from "@/server/bookings.functions";
import { STATUS_LABELS, type Booking, type BookingStatus } from "@/lib/military";


export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "ניהול הזמנות - דרך בטוחה" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

const STORAGE_KEY = "db_admin_pwd";
const LAST_SEEN_KEY = "db_admin_last_seen";

function AdminPage() {
  const verify = useServerFn(adminVerifyPassword);
  const list = useServerFn(adminListBookings);
  const update = useServerFn(adminUpdateBooking);
  const remove = useServerFn(adminDeleteBooking);
  const changePassword = useServerFn(adminChangePassword);
  const getSheetUrl = useServerFn(adminGetSheetUrl);

  const [password, setPassword] = useState("");
  const [pwdInput, setPwdInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);
  const [pwdDialogOpen, setPwdDialogOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const v = localStorage.getItem(LAST_SEEN_KEY);
    return v ? Number(v) : 0;
  });

  const newCount = bookings.filter(
    (b) => new Date(b.created_at).getTime() > lastSeen,
  ).length;

  function markAllSeen() {
    const now = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    setLastSeen(now);
  }

  const refresh = useCallback(
    async (pwd: string) => {
      setLoading(true);
      try {
        const res = await list({ data: { password: pwd } });
        const next = res.bookings as Booking[];
        setBookings((prev) => {
          // Detect newly arrived bookings (not in previous list) and notify
          if (prev.length > 0 && typeof window !== "undefined") {
            const prevIds = new Set(prev.map((b) => b.id));
            const fresh = next.filter((b) => !prevIds.has(b.id));
            if (fresh.length > 0 && "Notification" in window && Notification.permission === "granted") {
              for (const b of fresh.slice(0, 5)) {
                try {
                  new Notification("הגשה חדשה!", {
                    body: `${b.full_name} הגיש/ה טופס נהיגה מונעת`,
                    tag: `booking-${b.id}`,
                    icon: "/favicon.ico",
                  });
                } catch {
                  // ignore
                }
              }
            }
          }
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    },
    [list],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setPassword(saved);
      setAuthed(true);
      void refresh(saved);
    }
  }, [refresh]);

  // Auto-poll every 20 seconds while admin is logged in
  useEffect(() => {
    if (!authed || !password) return;
    const id = setInterval(() => {
      void refresh(password);
    }, 20000);
    return () => clearInterval(id);
  }, [authed, password, refresh]);

  // Request OS notification permission on login
  useEffect(() => {
    if (!authed) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [authed]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await verify({ data: { password: pwdInput } });
      sessionStorage.setItem(STORAGE_KEY, pwdInput);
      setPassword(pwdInput);
      setAuthed(true);
      await refresh(pwdInput);
      toast.success("התחברת בהצלחה");
    } catch {
      toast.error("סיסמה שגויה");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setPassword("");
    setPwdInput("");
    setBookings([]);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await update({
        data: {
          password,
          id: editing.id,
          status: editing.status,
          command: editing.command || "—",
          location: editing.location || "—",
          unit_location: editing.unit_location || "—",
          instructor_name: editing.instructor_name || null,
          course_number: editing.course_number || null,
          notes: editing.notes || null,
        },
      });
      toast.success("עודכן");
      setEditing(null);
      await refresh(password);
    } catch (err) {
      console.error("saveEdit error:", err);
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 4) {
      toast.error("הסיסמה החדשה חייבת להכיל לפחות 4 תווים");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword({
        data: { currentPassword: password, newPassword: newPwd },
      });
      sessionStorage.setItem(STORAGE_KEY, newPwd);
      setPassword(newPwd);
      setNewPwd("");
      setConfirmPwd("");
      setPwdDialogOpen(false);
      toast.success("הסיסמה שונתה בהצלחה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשינוי הסיסמה");
    } finally {
      setSavingPwd(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const b = deleting;
    try {
      await remove({ data: { password, id: b.id } });
      toast.success("נמחק");
      setDeleting(null);
      await refresh(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה במחיקה");
    }
  }

  const STATUS_LABEL_TO_KEY: Record<string, BookingStatus> = Object.fromEntries(
    Object.entries(STATUS_LABELS).map(([k, v]) => [v.label, k as BookingStatus]),
  );

  const filtered = bookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.full_name.toLowerCase().includes(q) ||
      b.unit.toLowerCase().includes(q) ||
      b.id_number.includes(q) ||
      b.command.toLowerCase().includes(q)
    );
  });

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <section className="flex-1 container mx-auto px-4 py-20 max-w-md">
          <Card className="p-8">
            <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-center mb-2">פאנל ניהול</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              נדרשת סיסמת מנהל לגישה
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pwd">סיסמה</Label>
                <Input
                  id="pwd"
                  type="password"
                  value={pwdInput}
                  onChange={(e) => setPwdInput(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" variant="cta" className="w-full" disabled={loading}>
                {loading ? "מאמת..." : "כניסה"}
              </Button>
              <Button type="button" variant="outline" className="w-full" asChild>
                <Link to="/">
                  <ArrowRight className="h-4 w-4 ml-2" />
                  חזור לדף הבית
                </Link>
              </Button>
            </form>
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
      <section className="flex-1 container mx-auto px-4 py-6">
        {/* Top utility bar — responsive grid so buttons never overlap on mobile */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-end gap-2 mb-5">
          <Button variant="outline" size="sm" onClick={() => refresh(password)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            רענן
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const { url } = await getSheetUrl({ data: { password } });
                if (url) {
                  window.open(url, "_blank", "noopener,noreferrer");
                } else {
                  toast.info("הגיליון ייווצר אוטומטית עם ההזמנה הראשונה");
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "שגיאה");
              }
            }}
          >
            <SheetIcon className="h-4 w-4" />
            גיליון Google
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!("Notification" in window)) {
                toast.error("הדפדפן לא תומך בהתראות");
                return;
              }
              const p = await Notification.requestPermission();
              if (p === "granted") {
                new Notification("ההתראות הופעלו ✓", { body: "תקבלו התראה כשתגיע בקשה חדשה" });
                toast.success("התראות הופעלו");
              } else {
                toast.error("ההתראות חסומות בדפדפן");
              }
            }}
          >
            🔔 התראות
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPwdDialogOpen(true)}>
            <KeyRound className="h-4 w-4" />
            סיסמה
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
            יציאה
          </Button>
        </div>

        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-[image:var(--gradient-primary)]/10 p-6 mb-6 shadow-[var(--shadow-elegant)]">
          <div className="absolute inset-0 -z-10 opacity-20 bg-[image:var(--gradient-primary)]" />
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-14 w-14 rounded-full bg-primary/15 ring-1 ring-primary/40 items-center justify-center shrink-0">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-extrabold bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
                פאנל ניהול הזמנות
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                ניהול בקשות הצגות והרצאות בטיחות · עדכון סטטוס, שיבוץ מדריכים וייצוא נתונים
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-xs font-semibold px-3 py-1 border border-primary/30">
                  סה״כ {bookings.length} בקשות
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary text-foreground text-xs font-semibold px-3 py-1 border border-border">
                  מציג {filtered.length}
                </span>
                {newCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllSeen}
                    className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white text-xs font-bold px-3 py-1 border border-red-600 animate-pulse hover:bg-red-600"
                    title="לחצו לסימון הכל כנקרא"
                  >
                    🔔 {newCount} בקשות חדשות
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label htmlFor="search" className="text-xs">חיפוש</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="שם, יחידה, מ.א, פיקוד..."
                className="pr-9"
              />
            </div>
          </div>
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs">סטטוס</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">אין בקשות להצגה</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((b) => {
              const s = STATUS_LABELS[b.status];
              const isNew = new Date(b.created_at).getTime() > lastSeen;
              return (
                <Card
                  key={b.id}
                  className={`p-4 hover:shadow-md transition-shadow ${
                    isNew ? "ring-2 ring-red-500/60 bg-red-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-primary font-bold flex items-center gap-1">
                        #{b.reference_number}
                        {isNew && (
                          <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5">
                            חדש
                          </span>
                        )}
                      </div>
                      <div className="font-semibold truncate">{b.full_name}</div>
                      <div className="text-xs text-muted-foreground">{b.phone}</div>
                    </div>
                    <Badge variant="outline" className={`${s.color} shrink-0`}>{s.label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-t border-border/40 pt-2 mt-2">
                    <div>
                      <div className="text-muted-foreground">יחידה</div>
                      <div className="truncate">{b.unit}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">פיקוד</div>
                      <div className="truncate">{b.command}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">תאריכים</div>
                      <div className="whitespace-nowrap">{b.start_date} → {b.end_date}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">משתתפים</div>
                      <div>{b.participants_count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">מיקום השתלמות</div>
                      <div className="truncate">{b.location || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">מיקום יחידה</div>
                      <div className="truncate">{b.unit_location || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">מדריך</div>
                      <div className="truncate">{b.instructor_name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">מס׳ השתלמות</div>
                      <div className="truncate">{b.course_number || "—"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-10 w-full"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="h-4 w-4" />
                      עריכה
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-10 w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                      מחיקה
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>עדכון הזמנה — {editing?.full_name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-secondary/40 p-3 rounded-lg">
                <div><span className="text-muted-foreground">יחידה:</span> {editing.unit}</div>
                <div><span className="text-muted-foreground">תאריכים:</span> {editing.start_date} → {editing.end_date}</div>
                <div><span className="text-muted-foreground">משתתפים:</span> {editing.participants_count}</div>
                <div><span className="text-muted-foreground">טלפון:</span> {editing.phone}</div>
              </div>
              <div className="space-y-2">
                <Label>פיקוד</Label>
                <Input
                  value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  placeholder="לדוגמה: פיקוד צפון"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>מיקום ההשתלמות</Label>
                  <Input
                    value={editing.location ?? ""}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    placeholder="לדוגמה: בה״ד 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>מיקום היחידה</Label>
                  <Input
                    value={editing.unit_location ?? ""}
                    onChange={(e) => setEditing({ ...editing, unit_location: e.target.value })}
                    placeholder="לדוגמה: צריפין"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as BookingStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>שם מדריך</Label>
                  <Input
                    value={editing.instructor_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, instructor_name: e.target.value })}
                    placeholder="שם המדריך"
                  />
                </div>
                <div className="space-y-2">
                  <Label>מספר השתלמות</Label>
                  <Input
                    value={editing.course_number ?? ""}
                    onChange={(e) => setEditing({ ...editing, course_number: e.target.value })}
                    placeholder="לדוגמה: 2025-014"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>הערות פנימיות</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button variant="cta" onClick={saveEdit}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwdDialogOpen} onOpenChange={setPwdDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              שינוי סיסמת מנהל
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pwd">סיסמה חדשה</Label>
              <Input
                id="new-pwd"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoFocus
                minLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">אימות סיסמה</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                minLength={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              הסיסמה החדשה תחליף את הסיסמה הנוכחית עבור כל המנהלים.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwdDialogOpen(false)}
                disabled={savingPwd}
              >
                ביטול
              </Button>
              <Button type="submit" variant="cta" disabled={savingPwd}>
                {savingPwd ? "שומר..." : "שמירה"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SiteFooter />
      <Toaster />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              אישור מחיקה
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            למחוק את הבקשה של{" "}
            <span className="font-semibold">{deleting?.full_name}</span>{" "}
            (#{deleting?.reference_number})? פעולה זו אינה הפיכה.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              מחק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
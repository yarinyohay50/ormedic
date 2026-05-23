import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Search, Phone, MapPin, Calendar, Package, Bell, X, IdCard,
  ChevronLeft, LayoutGrid, Users, Settings as SettingsIcon, MessageCircle, Wallet,
  Plus, Pencil, Loader2, Download, Upload, SlidersHorizontal, RefreshCw, Lock, LogOut, Check, UserX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CustomerRow } from "@/lib/customerSchema";
import { CustomerForm } from "@/components/CustomerForm";
import { getStoredPassword, setStoredPassword, logout } from "@/components/PasswordGate";
import logo from "@/assets/logo.jpeg"
import logo2 from "@/assets/logo2.jpeg";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Index });

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date | null) { return d ? d.toLocaleDateString("he-IL") : "—"; }
function nextFollowUpDate(c: CustomerRow): Date | null {
  const customerFollowUp = rollYearlyForward(parseDate(c.customer_follow_up));
  if (customerFollowUp) return customerFollowUp;
  const deviceFollowUp = rollYearlyForward(parseDate(c.device_follow_up));
  if (deviceFollowUp) return deviceFollowUp;
  return nextYearlyAnniversary(c.purchase_date);
}
function rollYearlyForward(d: Date | null): Date | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = new Date(d); out.setHours(0, 0, 0, 0);
  while (out.getTime() <= today.getTime()) {
    out.setFullYear(out.getFullYear() + 1);
  }
  return out;
}
function nextYearlyAnniversary(purchase: string | null | undefined): Date | null {
  const p = parseDate(purchase);
  if (!p) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(p); d.setHours(0, 0, 0, 0);
  // advance year-by-year until the date is strictly after today
  while (d.getTime() <= today.getTime()) {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}
function daysUntil(d: Date | null): number {
  if (!d) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function normalizedId(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function customerKey(c: Pick<CustomerRow, "id_number" | "name" | "phone">) {
  return normalizedId(c.id_number) || `${(c.name ?? "").trim()}|${(c.phone ?? "").trim()}`;
}

type Tab = "home" | "customers" | "lapsed" | "settings";
type EnrichedCustomer = CustomerRow & { nextFollowUp: Date | null; daysLeft: number; handled: boolean; purchaseCount?: number; allItems?: string[] };

function isHandled(c: CustomerRow): boolean {
  const t = parseDate(c.last_contacted_at);
  if (!t) return false;
  // נחשב כטופל אם הסימון בוצע ב-60 הימים האחרונים (המחזור השנתי מאפס אוטומטית)
  const diff = (Date.now() - t.getTime()) / 86400000;
  return diff <= 60;
}

function groupCustomers(list: EnrichedCustomer[]): EnrichedCustomer[] {
  const map = new Map<string, EnrichedCustomer[]>();
  for (const c of list) {
    const key = customerKey(c);
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  const result: EnrichedCustomer[] = [];
  for (const arr of map.values()) {
    if (arr.length === 1) { result.push(arr[0]); continue; }
    // Pick representative: prefer the one with the soonest upcoming follow-up,
    // otherwise the most recent purchase.
    const withFollow = arr.filter((x) => x.nextFollowUp);
    const sortedFollow = withFollow.sort((a, b) => a.daysLeft - b.daysLeft);
    const byPurchase = [...arr].sort((a, b) => {
      const da = a.purchase_date ? new Date(a.purchase_date).getTime() : 0;
      const db = b.purchase_date ? new Date(b.purchase_date).getTime() : 0;
      return db - da;
    });
    const rep = sortedFollow[0] ?? byPurchase[0];
    const items = Array.from(new Set(arr.map((x) => (x.item ?? "").trim()).filter(Boolean)));
    result.push({ ...rep, purchaseCount: arr.length, allItems: items });
  }
  return result;
}

function Index() {
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [itemFilter, setItemFilter] = useState<"all" | "device" | "consumable">("all");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [lapsedYear, setLapsedYear] = useState<string>("");
  const [lapsedMonth, setLapsedMonth] = useState<string>("");
  const [lapsedCity, setLapsedCity] = useState<string>("");
  const [lapsedHideContacted, setLapsedHideContacted] = useState<boolean>(true);
  const [lapsedSort, setLapsedSort] = useState<"oldest" | "newest" | "">("");
  const [lapsedContactTarget, setLapsedContactTarget] = useState<EnrichedCustomer | null>(null);
  const [lapsedContactDate, setLapsedContactDate] = useState<string>("");
  const [alertDays, _setAlertDays] = useState<number>(5);
  const setAlertDays = (_: number) => _setAlertDays(5); // קבוע 5 ימים
  const [notifPermission, setNotifPermission] = useState<string>("default");
    const excelInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const pageSize = 1000;
      const rows: CustomerRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .order("name", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data ?? []) as CustomerRow[];
        rows.push(...chunk);
        if (chunk.length < pageSize) break;
      }
      setCustomers(rows);
      if (isRefresh) toast.success("הנתונים עודכנו");
    } catch (e: any) {
      toast.error("שגיאה בטעינת לקוחות: " + (e?.message ?? ""));
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
  }, []);
  useEffect(() => { localStorage.setItem("alertDays", String(alertDays)); }, [alertDays]);

  // Compute latest purchase_date per customer group (by id_number or name|phone)
  const latestPurchaseByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      if (!c.purchase_date) continue;
      const key = customerKey(c);
      const prev = map.get(key);
      if (!prev || new Date(c.purchase_date).getTime() > new Date(prev).getTime()) {
        map.set(key, c.purchase_date);
      }
    }
    return map;
  }, [customers]);

  const enriched: EnrichedCustomer[] = useMemo(
    () => customers.map((c) => {
      const key = customerKey(c);
      const latest = latestPurchaseByKey.get(key) ?? c.purchase_date;
      const next = nextFollowUpDate({ ...c, purchase_date: latest });
      return { ...c, nextFollowUp: next, daysLeft: daysUntil(next), handled: isHandled(c) };
    }),
    [customers, latestPurchaseByKey]
  );

  const upcoming = useMemo(
    () => groupCustomers(enriched.filter((c) => c.nextFollowUp !== null && c.daysLeft <= alertDays && c.daysLeft >= -3))
      .sort((a, b) => a.daysLeft - b.daysLeft),
    [enriched, alertDays]
  );

  const [handledFilter, setHandledFilter] = useState<"all" | "pending" | "done">("pending");
  const upcomingFiltered = useMemo(() => {
    if (handledFilter === "all") return upcoming;
    if (handledFilter === "done") return upcoming.filter((c) => c.handled);
    return upcoming.filter((c) => !c.handled);
  }, [upcoming, handledFilter]);

  const toggleHandled = useCallback(async (c: EnrichedCustomer) => {
    const newVal = c.handled ? null : new Date().toISOString();
    setCustomers((prev) => prev.map((x) => x.id === c.id ? { ...x, last_contacted_at: newVal } : x));
    const { error } = await supabase.from("customers").update({ last_contacted_at: newVal }).eq("id", c.id);
    if (error) {
      toast.error("שגיאה בעדכון: " + error.message);
      load();
    } else {
      toast.success(newVal ? "סומן כטופל" : "בוטל הסימון");
    }
  }, [load]);

  const openLapsedContact = useCallback((c: EnrichedCustomer) => {
    // ביטול סימון — מחזיר את הלקוח לרשימה
    if (c.handled) {
      toggleHandled(c);
      return;
    }
    // ברירת מחדל: שנה מהיום
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    const iso = d.toISOString().slice(0, 10);
    setLapsedContactDate(c.customer_follow_up ?? iso);
    setLapsedContactTarget(c);
  }, [toggleHandled]);

  const confirmLapsedContact = useCallback(async () => {
    if (!lapsedContactTarget || !lapsedContactDate) return;
    const c = lapsedContactTarget;
    const nowIso = new Date().toISOString();
    const followUp = lapsedContactDate;
    // מזהה את כל ההזמנות של אותו לקוח (לפי ת.ז מנורמלית, או שם+טלפון)
    const targetKey = customerKey(c);
    const sameCustomerIds = customers
      .filter((x) => customerKey(x) === targetKey)
      .map((x) => x.id);
    setCustomers((prev) => prev.map((x) =>
      sameCustomerIds.includes(x.id)
        ? { ...x, last_contacted_at: nowIso, customer_follow_up: followUp }
        : x
    ));
    setLapsedContactTarget(null);
    const { error } = await supabase.from("customers")
      .update({ last_contacted_at: nowIso, customer_follow_up: followUp })
      .in("id", sameCustomerIds);
    if (error) { toast.error("שגיאה בעדכון: " + error.message); load(); }
    else {
      toast.success("נקבעה חזרה ל-" + new Date(followUp).toLocaleDateString("he-IL"));
      load();
    }
  }, [lapsedContactTarget, lapsedContactDate, customers, load]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    customers.forEach((c) => {
      if (c.purchase_date) {
        const y = new Date(c.purchase_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [customers]);

  // Known Israeli cities + common abbreviations. Used to detect the city
  // suffix inside a free-form address string.
  const KNOWN_CITIES: { match: string; label: string }[] = [
    // Abbreviations first (longer/specific) — order matters for matching
    { match: 'ת"א', label: "תל אביב" },
    { match: "ת\"א", label: "תל אביב" },
    { match: 'פ"ת', label: "פתח תקווה" },
    { match: 'ב"ש', label: "באר שבע" },
    { match: 'ר"ג', label: "רמת גן" },
    { match: 'ר"ל', label: "ראשון לציון" },
    { match: 'ק"ש', label: "קריית שמונה" },
    { match: 'ק"א', label: "קריית אתא" },
    { match: 'ק"ב', label: "קריית ביאליק" },
    { match: 'ק"מ', label: "קריית מוצקין" },
    { match: "תל אביב יפו", label: "תל אביב" },
    { match: "תל אביב", label: "תל אביב" },
    { match: "ירושלים", label: "ירושלים" },
    { match: "חיפה", label: "חיפה" },
    { match: "ראשון לציון", label: "ראשון לציון" },
    { match: "פתח תקווה", label: "פתח תקווה" },
    { match: "פתח תקוה", label: "פתח תקווה" },
    { match: "אשדוד", label: "אשדוד" },
    { match: "נתניה", label: "נתניה" },
    { match: "באר שבע", label: "באר שבע" },
    { match: "בני ברק", label: "בני ברק" },
    { match: "חולון", label: "חולון" },
    { match: "רמת גן", label: "רמת גן" },
    { match: "אשקלון", label: "אשקלון" },
    { match: "רחובות", label: "רחובות" },
    { match: "בת ים", label: "בת ים" },
    { match: "כפר סבא", label: "כפר סבא" },
    { match: "הרצליה", label: "הרצליה" },
    { match: "חדרה", label: "חדרה" },
    { match: "מודיעין", label: "מודיעין" },
    { match: "נצרת עילית", label: "נוף הגליל" },
    { match: "נוף הגליל", label: "נוף הגליל" },
    { match: "נצרת", label: "נצרת" },
    { match: "רעננה", label: "רעננה" },
    { match: "רהט", label: "רהט" },
    { match: "לוד", label: "לוד" },
    { match: "רמלה", label: "רמלה" },
    { match: "קריית גת", label: "קריית גת" },
    { match: "קרית גת", label: "קריית גת" },
    { match: "קריית מלאכי", label: "קריית מלאכי" },
    { match: "קריית אונו", label: "קריית אונו" },
    { match: "קרית אונו", label: "קריית אונו" },
    { match: "קריית ים", label: "קריית ים" },
    { match: "קרית ים", label: "קריית ים" },
    { match: "קריית ביאליק", label: "קריית ביאליק" },
    { match: "קרית ביאליק", label: "קריית ביאליק" },
    { match: "קריית מוצקין", label: "קריית מוצקין" },
    { match: "קרית מוצקין", label: "קריית מוצקין" },
    { match: "קריית אתא", label: "קריית אתא" },
    { match: "קרית אתא", label: "קריית אתא" },
    { match: "קריית שמונה", label: "קריית שמונה" },
    { match: "קרית שמונה", label: "קריית שמונה" },
    { match: "אילת", label: "אילת" },
    { match: "טבריה", label: "טבריה" },
    { match: "עפולה", label: "עפולה" },
    { match: "נהריה", label: "נהריה" },
    { match: "עכו", label: "עכו" },
    { match: "צפת", label: "צפת" },
    { match: "דימונה", label: "דימונה" },
    { match: "אום אל פחם", label: "אום אל פחם" },
    { match: "טייבה", label: "טייבה" },
    { match: "טירה", label: "טירה" },
    { match: "כפר קאסם", label: "כפר קאסם" },
    { match: "יבנה", label: "יבנה" },
    { match: "גבעתיים", label: "גבעתיים" },
    { match: "ראש העין", label: "ראש העין" },
    { match: "אור יהודה", label: "אור יהודה" },
    { match: "אור עקיבא", label: "אור עקיבא" },
    { match: "יהוד", label: "יהוד" },
    { match: "אריאל", label: "אריאל" },
    { match: "מעלה אדומים", label: "מעלה אדומים" },
    { match: "ביתר עילית", label: "ביתר עילית" },
    { match: "אלעד", label: "אלעד" },
    { match: "גני תקווה", label: "גני תקווה" },
    { match: "כרמיאל", label: "כרמיאל" },
    { match: "מגדל העמק", label: "מגדל העמק" },
    { match: "שדרות", label: "שדרות" },
    { match: "נתיבות", label: "נתיבות" },
    { match: "אופקים", label: "אופקים" },
    { match: "ערד", label: "ערד" },
    { match: "מצפה רמון", label: "מצפה רמון" },
    { match: "זכרון יעקב", label: "זכרון יעקב" },
    { match: "פרדס חנה", label: "פרדס חנה" },
    { match: "כרכור", label: "כרכור" },
    { match: "טירת כרמל", label: "טירת כרמל" },
    { match: "נשר", label: "נשר" },
    { match: "יקנעם", label: "יקנעם" },
    { match: "בית שמש", label: "בית שמש" },
    { match: "מודיעין עילית", label: "מודיעין עילית" },
    { match: "ג'סר א-זרקא", label: "ג'סר א-זרקא" },
    { match: "בקה אל גרבייה", label: "בקה אל גרבייה" },
    { match: "מעלות תרשיחא", label: "מעלות תרשיחא" },
    { match: "סחנין", label: "סחנין" },
    { match: "שפרעם", label: "שפרעם" },
    { match: "טמרה", label: "טמרה" },
    { match: "תמרה", label: "טמרה" },
    { match: "כפר קרע", label: "כפר קרע" },
    { match: "ראש פינה", label: "ראש פינה" },
    { match: "מטולה", label: "מטולה" },
    { match: "חצור הגלילית", label: "חצור הגלילית" },
    { match: "קצרין", label: "קצרין" },
    { match: "בית שאן", label: "בית שאן" },
    { match: "מבשרת ציון", label: "מבשרת ציון" },
    { match: "אבן יהודה", label: "אבן יהודה" },
    { match: "כפר יונה", label: "כפר יונה" },
    { match: "תל מונד", label: "תל מונד" },
    { match: "קדימה צורן", label: "קדימה צורן" },
    { match: "הוד השרון", label: "הוד השרון" },
    { match: "רמת השרון", label: "רמת השרון" },
    { match: "שוהם", label: "שוהם" },
    { match: "גדרה", label: "גדרה" },
    { match: "מזכרת בתיה", label: "מזכרת בתיה" },
    { match: "קריית עקרון", label: "קריית עקרון" },
    { match: "קרית עקרון", label: "קריית עקרון" },
    { match: "נס ציונה", label: "נס ציונה" },
    { match: "גן יבנה", label: "גן יבנה" },
    { match: "ניר עוז", label: "ניר עוז" },
  ];

  const extractCity = (addr: string): string => {
    const trimmed = (addr ?? "").trim();
    if (!trimmed) return "";
    // Try to find the longest matching known city anywhere in the address,
    // preferring matches at/near the end.
    let best: { label: string; pos: number; len: number } | null = null;
    for (const { match, label } of KNOWN_CITIES) {
      const pos = trimmed.lastIndexOf(match);
      if (pos === -1) continue;
      if (!best || pos > best.pos || (pos === best.pos && match.length > best.len)) {
        best = { label, pos, len: match.length };
      }
    }
    return best?.label ?? "";
  };

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    customers.forEach((c) => {
      const city = extractCity(c.address ?? "");
      if (city) cities.add(city);
    });
    return Array.from(cities).sort((a, b) => a.localeCompare(b, "he"));
  }, [customers]);

  const monthOptions = [
    { value: "1", label: "ינואר" },
    { value: "2", label: "פברואר" },
    { value: "3", label: "מרץ" },
    { value: "4", label: "אפריל" },
    { value: "5", label: "מאי" },
    { value: "6", label: "יוני" },
    { value: "7", label: "יולי" },
    { value: "8", label: "אוגוסט" },
    { value: "9", label: "ספטמבר" },
    { value: "10", label: "אוקטובר" },
    { value: "11", label: "נובמבר" },
    { value: "12", label: "דצמבר" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = q
      ? enriched.filter((c) =>
          (c.name ?? "").includes(q) ||
          (c.phone ?? "").includes(q) ||
          (c.id_number ?? "").includes(q) ||
          (c.address ?? "").includes(q) ||
          (c.item ?? "").includes(q))
      : enriched;
    if (itemFilter === "device") list = list.filter((c) => (c.item ?? "").includes("מכשיר"));
    else if (itemFilter === "consumable") list = list.filter((c) => (c.item ?? "").includes("מתכלים"));
    if (yearFilter) {
      list = list.filter((c) => {
        if (!c.purchase_date) return false;
        return String(new Date(c.purchase_date).getFullYear()) === yearFilter;
      });
    }
    if (monthFilter) {
      list = list.filter((c) => {
        if (!c.purchase_date) return false;
        return String(new Date(c.purchase_date).getMonth() + 1) === monthFilter;
      });
    }
    const grouped = groupCustomers(list);
    const finalList = repeatOnly
      ? grouped.filter((c) => (c.purchaseCount ?? 1) > 1)
      : grouped;
    return finalList.sort((a, b) => {
      if (repeatOnly) return (b.purchaseCount ?? 1) - (a.purchaseCount ?? 1);
      return a.name.localeCompare(b.name, "he");
    });
  }, [query, enriched, itemFilter, yearFilter, monthFilter, repeatOnly]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sentKey = `notifSent-${today}`;
    const sent = new Set<string>(JSON.parse(localStorage.getItem(sentKey) ?? "[]"));
    upcoming.forEach((c) => {
      if (sent.has(c.id) || c.daysLeft < 0 || c.daysLeft > alertDays) return;
      const title = `חזרה ללקוח: ${c.name}`;
      const body = c.daysLeft === 0
        ? `היום! ${c.item || ""} ${c.phone || ""}`
        : `בעוד ${c.daysLeft} ימים — ${c.item || ""} ${c.phone || ""}`;
      toast(title, { description: body, duration: 8000 });
      if (notifPermission === "granted") {
        try { new Notification(title, { body }); } catch {}
      }
      sent.add(c.id);
    });
    localStorage.setItem(sentKey, JSON.stringify(Array.from(sent)));
  }, [upcoming, notifPermission, alertDays]);

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    setNotifPermission(await Notification.requestPermission());
  };

  const onSaved = () => { setAdding(false); setEditing(null); load(); };

  const importExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (!rows.length) { toast.error("הקובץ ריק"); return; }
      const MAX = 5000;
      const remaining = MAX - customers.length;
      if (remaining <= 0) {
        toast.error(`הגעת למגבלה של ${MAX} לקוחות`);
        return;
      }

      const pick = (r: Record<string, any>, keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(r).find((x) => x.trim() === k);
          if (found && r[found] !== "" && r[found] != null) return r[found];
        }
        return "";
      };
      const toISO = (v: any): string | null => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        const s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
        if (m) {
          const y = m[3].length === 2 ? "20" + m[3] : m[3];
          return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      };
      const toNum = (v: any): number | null => {
        if (v === "" || v == null) return null;
        const n = Number(String(v).replace(/[^\d.-]/g, ""));
        return isNaN(n) ? null : n;
      };

      const payload = rows
        .map((r) => {
          const name = String(pick(r, ["שם", "שם הלקוח", "name"]) ?? "").trim();
          if (!name) return null;
          return {
            name,
            phone: String(pick(r, ["טלפון", "phone"]) ?? ""),
            id_number: String(pick(r, ["ת.ז", "תז", "ת\"ז", "id_number"]) ?? ""),
            item: String(pick(r, ["ציוד", "ציוד שנרכש", "item"]) ?? ""),
            amount: toNum(pick(r, ["סכום", "amount"])),
            purchase_date: toISO(pick(r, ["תאריך רכישה", "purchase_date"])),
            customer_follow_up: toISO(pick(r, ["חזרה ללקוח", "customer_follow_up"])),
            device_follow_up: toISO(pick(r, ["חזרה למכשיר", "device_follow_up"])),
            address: String(pick(r, ["כתובת", "address"]) ?? ""),
            notes: String(pick(r, ["הערות", "notes"]) ?? ""),
          };
        })
        .filter(Boolean) as any[];

      if (!payload.length) { toast.error("לא נמצאו רשומות עם שם"); return; }
      if (payload.length > remaining) {
        toast.error(`ניתן לייבא רק ${remaining} לקוחות נוספים (מגבלה ${MAX})`);
        return;
      }
      const batchSize = 500;
      for (let i = 0; i < payload.length; i += batchSize) {
        const { error } = await supabase.from("customers").insert(payload.slice(i, i + batchSize));
        if (error) { toast.error("שגיאת ייבוא: " + error.message); return; }
      }
      toast.success(`יובאו ${payload.length} לקוחות בהצלחה`);
      load();
    } catch (e: any) {
      toast.error("שגיאה בקריאת הקובץ: " + (e?.message ?? ""));
    }
  };

  const exportExcel = () => {
    const pass = window.prompt("הזן סיסמה לייצוא Excel");
    if (pass === null) return;
    if (pass !== getStoredPassword()) {
      toast.error("סיסמה שגויה");
      return;
    }
    const rows = customers.map((c) => ({
      "שם": c.name,
      "טלפון": c.phone ?? "",
      "ת.ז": c.id_number ?? "",
      "ציוד": c.item ?? "",
      "סכום": c.amount ?? "",
      "תאריך רכישה": c.purchase_date ?? "",
      "חזרה ללקוח": c.customer_follow_up ?? "",
      "חזרה למכשיר": c.device_follow_up ?? "",
      "כתובת": c.address ?? "",
      "הערות": c.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "לקוחות");
    XLSX.writeFile(wb, `לקוחות-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success(`יוצאו ${customers.length} לקוחות לקובץ Excel`);
  };

  const stats = {
    total: customers.length,
    devices: customers.filter((c) => (c.item ?? "").includes("מכשיר")).length,
    upcoming: upcoming.length,
  };

  // ---- Lapsed customers (לקוחות שלא חזרו) ----
  // Grouped by id_number / name|phone, taking the latest purchase.
  // "Lapsed" = latest purchase is more than 1 year ago (anniversary already passed).
  const lapsed = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const c of customers) {
      if (!c.purchase_date) continue;
      const key = customerKey(c);
      const prev = map.get(key);
      if (!prev || new Date(c.purchase_date).getTime() > new Date(prev.purchase_date!).getTime()) {
        map.set(key, c);
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result: EnrichedCustomer[] = [];
    for (const c of map.values()) {
      const p = parseDate(c.purchase_date);
      if (!p) continue;
      // אם נבחר תאריך "פעם הבאה" — הוא קובע מתי הלקוח חוזר לרשימה.
      // אחרת: שנה מההזמנה האחרונה (או ממועד יצירת הקשר האחרון אם הוא מאוחר יותר).
      const followUp = parseDate(c.customer_follow_up);
      let anniv: Date;
      if (followUp) {
        anniv = new Date(followUp); anniv.setHours(0, 0, 0, 0);
      } else {
        const contacted = parseDate(c.last_contacted_at);
        const base = contacted && contacted.getTime() > p.getTime() ? contacted : p;
        anniv = new Date(base); anniv.setHours(0, 0, 0, 0);
        anniv.setFullYear(anniv.getFullYear() + 1);
      }
      if (anniv.getTime() > today.getTime()) continue;
      result.push({ ...c, nextFollowUp: anniv, daysLeft: daysUntil(anniv), handled: false });
    }
    return result;
  }, [customers]);

  const lapsedFiltered = useMemo(() => {
    let list = lapsed;
    if (lapsedYear) {
      list = list.filter((c) => c.purchase_date && String(new Date(c.purchase_date).getFullYear()) === lapsedYear);
    }
    if (lapsedMonth) {
      list = list.filter((c) => c.purchase_date && String(new Date(c.purchase_date).getMonth() + 1) === lapsedMonth);
    }
    if (lapsedCity) {
      list = list.filter((c) => {
        return extractCity(c.address ?? "") === lapsedCity;
      });
    }
    if (lapsedHideContacted) {
      list = list.filter((c) => !c.handled);
    }
    return [...list].sort((a, b) => {
      const da = a.purchase_date ? new Date(a.purchase_date).getTime() : 0;
      const db = b.purchase_date ? new Date(b.purchase_date).getTime() : 0;
      if (lapsedSort === "newest") return db - da;
      // default (oldest first / most overdue at the top)
      return da - db;
    });
  }, [lapsed, lapsedYear, lapsedMonth, lapsedCity, lapsedHideContacted, lapsedSort]);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--slate-100)" }}>
      <div className="max-w-[480px] md:max-w-[720px] lg:max-w-[960px] mx-auto px-3 md:px-6">
        {loading ? <div className="grid place-items-center py-32"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div> : (
          <>
            {tab === "home" && (
              <HomeTab
                query={query} setQuery={setQuery} stats={stats} upcoming={upcoming}
                alertDays={alertDays} setAlertDays={setAlertDays}
                onSelect={setSelected} notifPermission={notifPermission} requestNotif={requestNotif}
                filtered={filtered} onRefresh={() => load(true)} refreshing={refreshing}
                upcomingFiltered={upcomingFiltered}
                handledFilter={handledFilter} setHandledFilter={setHandledFilter}
                onToggleHandled={openLapsedContact}
              />
            )}
            {tab === "customers" && (
              <CustomersTab query={query} setQuery={setQuery} list={filtered} onSelect={setSelected} totalRecords={customers.length}
                itemFilter={itemFilter} setItemFilter={setItemFilter}
                yearFilter={yearFilter} setYearFilter={setYearFilter}
                monthFilter={monthFilter} setMonthFilter={setMonthFilter}
                yearOptions={yearOptions} monthOptions={monthOptions}
                repeatOnly={repeatOnly} setRepeatOnly={setRepeatOnly} />
            )}
            {tab === "lapsed" && (
              <LapsedTab
                list={lapsedFiltered}
                totalLapsed={lapsed.length}
                onSelect={setSelected}
                onToggleHandled={openLapsedContact}
                yearFilter={lapsedYear} setYearFilter={setLapsedYear}
                monthFilter={lapsedMonth} setMonthFilter={setLapsedMonth}
                cityFilter={lapsedCity} setCityFilter={setLapsedCity}
                yearOptions={yearOptions} monthOptions={monthOptions} cityOptions={cityOptions}
                hideContacted={lapsedHideContacted} setHideContacted={setLapsedHideContacted}
                sort={lapsedSort} setSort={setLapsedSort}
              />
            )}
            {tab === "settings" && (
              <SettingsTab
                alertDays={alertDays} setAlertDays={setAlertDays}
                notifPermission={notifPermission} requestNotif={requestNotif}
                exportExcel={exportExcel} importExcel={importExcel} totalCustomers={customers.length}
              />
            )}
          </>
        )}
      </div>

      <button onClick={() => {
        if (customers.length >= 5000) { toast.error("הגעת למגבלה של 5000 לקוחות"); return; }
        setAdding(true);
      }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 bg-primary text-white px-5 py-3 rounded-full shadow-xl shadow-primary/30 font-bold flex items-center gap-2 active:scale-95 transition-transform">
        <Plus className="w-5 h-5" /> לקוח חדש
      </button>

      <BottomNav tab={tab} setTab={setTab} badge={upcoming.length} />

      {selected && (
        <CustomerSheet
          customer={selected}
          allCustomers={customers}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
          onSelectOther={(c) => setSelected(c)}
        />
      )}
      {(adding || editing) && (
        <CustomerForm
          initial={editing}
          allCustomers={customers}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}
      {lapsedContactTarget && (
        <div className="fixed inset-0 z-40 bg-black/50 grid place-items-center p-4"
          onClick={() => setLapsedContactTarget(null)}>
          <div className="bg-white w-full max-w-[420px] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold mb-1" style={{ color: "var(--slate-900)" }}>
              מתי לחזור ל{lapsedContactTarget.name}?
            </h3>
            <p className="text-xs mb-4" style={{ color: "var(--slate-500)" }}>
              בחרו את התאריך הבא ליצירת קשר. במועד הזה הלקוח יחזור לרשימה אוטומטית.
            </p>
            <input
              type="date"
              value={lapsedContactDate}
              onChange={(e) => setLapsedContactDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-base font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40 mb-5"
              style={{ backgroundColor: "var(--slate-100)", color: "var(--slate-900)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setLapsedContactTarget(null)}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ backgroundColor: "var(--slate-100)", color: "var(--slate-500)" }}
              >
                ביטול
              </button>
              <button
                onClick={confirmLapsedContact}
                disabled={!lapsedContactDate}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-50"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Home Tab ---------- */
function HomeTab({
  query, setQuery, stats, upcoming, alertDays, setAlertDays, onSelect,
  notifPermission, requestNotif, filtered, onRefresh, refreshing,
  upcomingFiltered, handledFilter, setHandledFilter, onToggleHandled,
}: any) {
  return (
    <>
      <header className="bg-white px-5 pt-8 pb-8 rounded-b-[2rem] shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="UMEDIC" className="h-12 object-contain" />
            <img src={logo2} alt="לוגו" className="h-12 object-contain" />
            <div>
              <h1 className="text-base font-extrabold leading-tight" style={{ color: "var(--slate-900)" }}>ניהול לקוחות</h1>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>מעקב לפי תאריכי חזרה</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} disabled={refreshing}
              className="p-3 rounded-xl text-primary border border-slate-100 disabled:opacity-50"
              style={{ backgroundColor: "var(--slate-50)" }} aria-label="רענון">
              <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button onClick={requestNotif}
              className="p-3 rounded-xl text-primary border border-slate-100 relative"
              style={{ backgroundColor: "var(--slate-50)" }} aria-label="התראות">
              <Bell className="w-5 h-5" />
              {notifPermission !== "granted" && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[oklch(0.62_0.22_25)] border-2 border-white rounded-full" />
              )}
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון, ת.ז..."
            className="w-full border-none rounded-2xl py-4 pr-12 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ backgroundColor: "var(--slate-100)" }} />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 px-5 -mt-6 relative z-10">
        <StatCard value={stats.total} label='סה"כ לקוחות' color="text-primary" />
        <StatCard value={stats.devices} label="רכשו מכשיר" color="text-slate-900" />
        <StatCard value={stats.upcoming} label="חזרות קרובות" color="text-[oklch(0.65_0.18_60)]" />
      </div>

      {query ? (
        <main className="px-5 py-8">
          <SectionHeader title="תוצאות חיפוש" count={filtered.length} />
          {filtered.length === 0
            ? <EmptyState text="לא נמצאו תוצאות" />
            : <CardList list={filtered.slice(0, 30)} onSelect={onSelect} />}
        </main>
      ) : (
        <main className="px-5 py-8">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-6 bg-primary rounded-full" />
              <h2 className="text-lg font-bold" style={{ color: "var(--slate-900)" }}>חזרות קרובות</h2>
              <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">{upcomingFiltered.length}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--slate-500)" }}>
              <span>עד</span>
              <input type="number" min={1} max={365} value={alertDays}
                onChange={(e) => setAlertDays(Math.max(1, Number(e.target.value)))}
                className="w-14 bg-white border border-slate-200 rounded text-center py-0.5 font-bold text-slate-900" />
              <span>ימים</span>
            </div>
          </div>

          {upcomingFiltered.length === 0
            ? <EmptyState text={`אין חזרות ב-${alertDays} הימים הקרובים`} />
            : <CardList list={upcomingFiltered} onSelect={onSelect} onToggleHandled={onToggleHandled} />}
        </main>
      )}
    </>
  );
}

/* ---------- Customers Tab ---------- */
function CustomersTab({
  query, setQuery, list, onSelect, itemFilter, setItemFilter,
  yearFilter, setYearFilter, monthFilter, setMonthFilter, yearOptions, monthOptions, totalRecords,
  repeatOnly, setRepeatOnly,
}: any) {
  const tabs: { key: "all" | "device" | "consumable"; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "device", label: "מכשיר" },
    { key: "consumable", label: "מתכלים" },
  ];
  const hasFilters = yearFilter || monthFilter || repeatOnly;
  return (
    <>
      <header className="bg-white px-5 pt-8 pb-6 rounded-b-[2rem] shadow-sm">
        <h1 className="text-xl font-extrabold mb-1" style={{ color: "var(--slate-900)" }}>כל הלקוחות</h1>
        <p className="text-xs mb-5" style={{ color: "var(--slate-500)" }}>{list.length} מוצגות מתוך {totalRecords} רשומות</p>
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון, ת.ז..."
            className="w-full border-none rounded-2xl py-4 pr-12 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ backgroundColor: "var(--slate-100)" }} />
        </div>
        <div className="flex gap-2 mt-4">
          {tabs.map((t) => {
            const active = itemFilter === t.key;
            return (
              <button key={t.key} onClick={() => setItemFilter(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${active ? "bg-primary text-white shadow-md shadow-primary/20" : ""}`}
                style={!active ? { backgroundColor: "var(--slate-100)", color: "var(--slate-500)" } : undefined}>
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setRepeatOnly(!repeatOnly)}
            className="px-3 py-2.5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
            style={repeatOnly
              ? { backgroundColor: "var(--primary)", color: "white" }
              : { backgroundColor: "var(--slate-100)", color: "var(--slate-500)" }}
          >
            חוזרים בלבד
          </button>
          <div className="relative flex-1">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full appearance-none rounded-xl py-2.5 pr-8 pl-3 text-sm font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: "var(--slate-100)", color: yearFilter ? "var(--primary)" : "var(--slate-500)" }}
            >
              <option value="">כל השנים</option>
              {yearOptions.map((y: number) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full appearance-none rounded-xl py-2.5 pr-8 pl-3 text-sm font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: "var(--slate-100)", color: monthFilter ? "var(--primary)" : "var(--slate-500)" }}
            >
              <option value="">כל החודשים</option>
              {monthOptions.map((m: { value: string; label: string }) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setYearFilter(""); setMonthFilter(""); setRepeatOnly(false); }}
              className="px-3 py-2.5 rounded-xl text-sm font-bold text-[oklch(0.55_0.22_25)]"
              style={{ backgroundColor: "oklch(0.95_0.06_25)" }}
            >
              איפוס
            </button>
          )}
        </div>
      </header>
      <main className="px-5 py-6">
        {list.length === 0 ? <EmptyState text="אין עדיין לקוחות — הוסף את הראשון" /> :
          <CardList list={list} onSelect={onSelect} />}
      </main>
    </>
  );
}

/* ---------- Settings ---------- */
function SettingsTab({ alertDays, setAlertDays, notifPermission, requestNotif, exportExcel, importExcel, totalCustomers }: any) {
  return (
    <>
      <header className="bg-white px-5 pt-8 pb-6 rounded-b-[2rem] shadow-sm">
        <h1 className="text-xl font-extrabold" style={{ color: "var(--slate-900)" }}>הגדרות</h1>
        <p className="text-xs" style={{ color: "var(--slate-500)" }}>ניהול אישי</p>
      </header>
      <main className="px-5 py-6 space-y-4">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--slate-900)" }}>התראות מערכת</h3>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>קבל התראה לפני זמן החזרה</p>
            </div>
          </div>
          {notifPermission === "granted"
            ? <div className="text-sm text-[oklch(0.55_0.16_155)] font-medium">✓ ההתראות פעילות</div>
            : <button onClick={requestNotif}
                className="w-full bg-primary text-white py-3 rounded-xl font-medium shadow-lg shadow-primary/20">הפעל התראות</button>}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[oklch(0.95_0.06_60)] grid place-items-center">
              <Calendar className="w-5 h-5 text-[oklch(0.55_0.18_60)]" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--slate-900)" }}>זמן התראה מוקדם</h3>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>כמה ימים לפני להזכיר</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={365} value={alertDays}
              onChange={(e) => setAlertDays(Number(e.target.value))}
              className="flex-1 accent-[var(--primary)]" />
            <div className="bg-primary/10 text-primary font-bold rounded-xl px-4 py-2 min-w-16 text-center">{alertDays} ימים</div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[oklch(0.95_0.06_155)] grid place-items-center">
              <Download className="w-5 h-5 text-[oklch(0.5_0.16_155)]" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--slate-900)" }}>ייצוא לאקסל</h3>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>הורד את כל {totalCustomers} הלקוחות כקובץ Excel</p>
            </div>
          </div>
          <button onClick={exportExcel}
            className="w-full bg-[oklch(0.5_0.16_155)] text-white py-3 rounded-xl font-medium shadow-lg shadow-[oklch(0.5_0.16_155)]/20 flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> ייצא קובץ Excel
          </button>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[oklch(0.95_0.06_240)] grid place-items-center">
              <Upload className="w-5 h-5 text-[oklch(0.5_0.18_240)]" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--slate-900)" }}>העלאת קובץ Excel</h3>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>ייבא לקוחות מקובץ Excel למערכת</p>
            </div>
          </div>
          <>
          <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) importExcel(f);
                                        e.target.value = "";
                        }}
                      />
          <button
                        type="button"
                        onClick={() => excelInputRef.current?.click()}
                        className="w-full bg-[oklch(0.5_0.18_240)] text-white py-3 rounded-xl font-medium shadow-lg shadow-[oklch(0.5_0.18_240)]/20 flex items-center justify-center gap-2 cursor-pointer"
                      >
                      <Upload className="w-4 h-4" /> בחר קובץ Excel
          </button>
</>
        </Card>

        <PasswordCard />

        <Card>
          <button onClick={logout}
            className="w-full text-[oklch(0.55_0.18_25)] py-3 rounded-xl font-medium flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> התנתקות
          </button>
        </Card>

      </main>
    </>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);

  const save = async () => {
    if (current !== getStoredPassword()) { toast.error("הסיסמה הנוכחית שגויה"); return; }
    if (next.length < 4) { toast.error("הסיסמה חייבת להכיל לפחות 4 תווים"); return; }
    if (next !== confirm) { toast.error("הסיסמאות אינן תואמות"); return; }
    await setStoredPassword(next);
    setCurrent(""); setNext(""); setConfirm(""); setOpen(false);
    toast.success("הסיסמה עודכנה ומסונכרנת בכל המכשירים");
  };

  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 text-right">
        <div className="w-10 h-10 rounded-xl bg-[oklch(0.95_0.06_280)] grid place-items-center">
          <Lock className="w-5 h-5 text-[oklch(0.5_0.18_280)]" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold" style={{ color: "var(--slate-900)" }}>שינוי סיסמה</h3>
          <p className="text-xs" style={{ color: "var(--slate-500)" }}>עדכן את סיסמת הכניסה למערכת</p>
        </div>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
            placeholder="סיסמה נוכחית"
            className="w-full rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ backgroundColor: "var(--slate-100)" }} />
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
            placeholder="סיסמה חדשה"
            className="w-full rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ backgroundColor: "var(--slate-100)" }} />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="אימות סיסמה חדשה"
            className="w-full rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ backgroundColor: "var(--slate-100)" }} />
          <button onClick={save}
            className="w-full bg-primary text-white py-3 rounded-xl font-medium shadow-lg shadow-primary/20">
            שמור סיסמה חדשה
          </button>
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-3xl p-5 shadow-sm">{children}</div>;
}

/* ---------- Common ---------- */
function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-50 text-center">
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="text-[10px] font-medium mt-0.5" style={{ color: "var(--slate-500)" }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <div className="w-1.5 h-6 bg-primary rounded-full" />
      <h2 className="text-lg font-bold" style={{ color: "var(--slate-900)" }}>{title}</h2>
      <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">{count}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="bg-white rounded-3xl p-10 text-center text-sm text-slate-400 border border-dashed border-slate-200">{text}</div>;
}

function CardList({ list, onSelect, onToggleHandled }: {
  list: EnrichedCustomer[]; onSelect: (c: CustomerRow) => void;
  onToggleHandled?: (c: EnrichedCustomer) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((c) => (
        <CustomerCard key={c.id} c={c} onClick={() => onSelect(c)}
          onToggleHandled={onToggleHandled ? () => onToggleHandled(c) : undefined} />
      ))}
    </div>
  );
}

function CustomerCard({ c, onClick, onToggleHandled }: {
  c: EnrichedCustomer; onClick: () => void; onToggleHandled?: () => void;
}) {
  const days = c.daysLeft;
  const isUrgent = Number.isFinite(days) && days <= 3;
  const isOverdue = Number.isFinite(days) && days < 0;
  const isUpcoming = Number.isFinite(days) && days <= 30;

  let borderColor = "transparent";
  let badgeBg = "var(--slate-100)";
  let badgeText = "var(--slate-500)";
  let badgeLabel = "";
  if (c.handled) {
    borderColor = "oklch(0.62 0.17 155)";
    badgeBg = "oklch(0.95 0.06 155)"; badgeText = "oklch(0.45 0.16 155)";
    badgeLabel = "✓ טופל";
  } else if (isOverdue) {
    borderColor = "oklch(0.62 0.22 25)";
    badgeBg = "oklch(0.95 0.06 25)"; badgeText = "oklch(0.55 0.22 25)";
    badgeLabel = `באיחור ${Math.abs(days)} ימים`;
  } else if (days === 0) {
    borderColor = "oklch(0.74 0.17 60)";
    badgeBg = "oklch(0.95 0.08 60)"; badgeText = "oklch(0.5 0.18 60)";
    badgeLabel = "היום";
  } else if (isUrgent) {
    borderColor = "oklch(0.74 0.17 60)";
    badgeBg = "oklch(0.95 0.08 60)"; badgeText = "oklch(0.5 0.18 60)";
    badgeLabel = `בעוד ${days} ימים`;
  } else if (isUpcoming) {
    borderColor = "oklch(0.7 0.13 258)";
    badgeBg = "oklch(0.95 0.04 258)"; badgeText = "var(--primary)";
    badgeLabel = `בעוד ${days} ימים`;
  }

  return (
    <button onClick={onClick}
      className="w-full text-right bg-white rounded-[1.75rem] p-5 shadow-sm relative overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderRight: borderColor === "transparent" ? "none" : `8px solid ${borderColor}`,
        opacity: c.handled ? 0.75 : 1,
      }}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-base font-bold truncate" style={{ color: "var(--slate-900)" }}>{c.name}</h3>
            {c.purchaseCount && c.purchaseCount > 1 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "var(--slate-100)", color: "var(--slate-500)" }}>
                {c.purchaseCount} רכישות
              </span>
            ) : null}
          </div>
          {c.nextFollowUp && (
            <div className="flex items-center gap-1.5 mt-1" style={{ color: "var(--slate-500)" }}>
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs">חזרה: {fmt(c.nextFollowUp)}</span>
            </div>
          )}
        </div>
        {badgeLabel && (
          <span className="px-3 py-1 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0"
            style={{ background: badgeBg, color: badgeText }}>{badgeLabel}</span>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center gap-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 text-slate-600 min-w-0">
            <Package className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-medium truncate">{c.item || "—"}</span>
          </div>
          {c.phone && (
            <div className="flex items-center gap-2 text-primary">
              <Phone className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold tracking-wider" dir="ltr">{c.phone}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onToggleHandled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onToggleHandled(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onToggleHandled(); } }}
              className="w-10 h-10 rounded-full grid place-items-center cursor-pointer"
              style={{
                background: c.handled ? "oklch(0.62 0.17 155)" : "var(--slate-100)",
                color: c.handled ? "white" : "oklch(0.65 0.02 257)",
              }}
              aria-label={c.handled ? "בטל סימון" : "סמן כטופל"}
              title={c.handled ? "בטל סימון" : "סמן כטופל"}
            >
              <Check className="w-5 h-5" strokeWidth={c.handled ? 3 : 2} />
            </span>
          )}
          <div className="w-10 h-10 rounded-full grid place-items-center"
            style={{
              background: isUrgent || isOverdue ? "var(--slate-900)" : "var(--slate-100)",
              color: isUrgent || isOverdue ? "white" : "oklch(0.65 0.02 257)",
            }}>
            <ChevronLeft className="w-5 h-5" />
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------- Bottom Nav ---------- */
function BottomNav({ tab, setTab, badge }: { tab: Tab; setTab: (t: Tab) => void; badge: number }) {
  const items: { key: Tab; label: string; Icon: any; badge?: number }[] = [
    { key: "home", label: "ראשי", Icon: LayoutGrid, badge },
    { key: "customers", label: "לקוחות", Icon: Users },
    { key: "lapsed", label: "לא חזרו", Icon: UserX },
    { key: "settings", label: "הגדרות", Icon: SettingsIcon },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur border-t border-slate-100 px-6 py-3">
      <div className="max-w-[480px] md:max-w-[720px] lg:max-w-[960px] w-full mx-auto flex justify-around items-center">
        {items.map(({ key, label, Icon, badge }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex flex-col items-center gap-1 px-4 py-1 relative ${active ? "text-primary" : "text-slate-300"}`}>
              <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{label}</span>
              {badge ? (
                <span className="absolute top-0 left-2 min-w-4 h-4 px-1 rounded-full bg-[oklch(0.65_0.18_60)] text-white text-[9px] font-bold grid place-items-center">{badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- Lapsed Tab ---------- */
function LapsedTab({
  list, totalLapsed, onSelect, onToggleHandled,
  yearFilter, setYearFilter, monthFilter, setMonthFilter,
  cityFilter, setCityFilter,
  yearOptions, monthOptions, cityOptions,
  hideContacted, setHideContacted,
  sort, setSort,
}: {
  list: EnrichedCustomer[];
  totalLapsed: number;
  onSelect: (c: CustomerRow) => void;
  onToggleHandled: (c: EnrichedCustomer) => void;
  yearFilter: string; setYearFilter: (v: string) => void;
  monthFilter: string; setMonthFilter: (v: string) => void;
  cityFilter: string; setCityFilter: (v: string) => void;
  yearOptions: number[]; monthOptions: { value: string; label: string }[]; cityOptions: string[];
  hideContacted: boolean; setHideContacted: (v: boolean) => void;
  sort: "oldest" | "newest" | ""; setSort: (v: "oldest" | "newest" | "") => void;
}) {
  const hasFilters = yearFilter || monthFilter || cityFilter;
  return (
    <>
      <header className="bg-white px-5 pt-8 pb-6 rounded-b-[2rem] shadow-sm">
        <h1 className="text-xl font-extrabold mb-1" style={{ color: "var(--slate-900)" }}>לקוחות שלא חזרו</h1>
        <p className="text-xs mb-5" style={{ color: "var(--slate-500)" }}>
          {list.length} מוצגות מתוך {totalLapsed} שלא חזרו לאחר שנה
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full appearance-none rounded-xl py-2.5 pr-8 pl-3 text-sm font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: "var(--slate-100)", color: yearFilter ? "var(--primary)" : "var(--slate-500)" }}
            >
              <option value="">כל השנים</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full appearance-none rounded-xl py-2.5 pr-8 pl-3 text-sm font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: "var(--slate-100)", color: monthFilter ? "var(--primary)" : "var(--slate-500)" }}
            >
              <option value="">כל החודשים</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setYearFilter(""); setMonthFilter(""); setCityFilter(""); }}
              className="px-3 py-2.5 rounded-xl text-sm font-bold text-[oklch(0.55_0.22_25)]"
              style={{ backgroundColor: "oklch(0.95_0.06_25)" }}
            >
              איפוס
            </button>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full appearance-none rounded-xl py-2.5 pr-8 pl-3 text-sm font-bold border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: "var(--slate-100)", color: cityFilter ? "var(--primary)" : "var(--slate-500)" }}
            >
              <option value="">כל הערים</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setHideContacted(!hideContacted)}
            className="px-3 py-2.5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
            style={hideContacted
              ? { backgroundColor: "var(--primary)", color: "white" }
              : { backgroundColor: "var(--slate-100)", color: "var(--slate-500)" }}
          >
            {hideContacted ? "הסתר טופל" : "הצג הכל"}
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setSort(sort === "oldest" ? "" : "oldest")}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={sort === "oldest"
              ? { backgroundColor: "var(--primary)", color: "white" }
              : { backgroundColor: "var(--slate-100)", color: "var(--slate-500)" }}
          >
            תאריך ישן יותר
          </button>
          <button
            onClick={() => setSort(sort === "newest" ? "" : "newest")}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={sort === "newest"
              ? { backgroundColor: "var(--primary)", color: "white" }
              : { backgroundColor: "var(--slate-100)", color: "var(--slate-500)" }}
          >
            תאריך חדש יותר
          </button>
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--slate-500)" }}>
          הסינון לפי חודש/שנה של הרכישה האחרונה. בחר עיר כדי לסנן לקוחות לפי מיקום.
        </p>
      </header>
      <main className="px-5 py-6">
        {list.length === 0
          ? <EmptyState text="אין לקוחות שלא חזרו לפי הסינון" />
          : <CardList list={list} onSelect={onSelect} onToggleHandled={onToggleHandled} />}
      </main>
    </>
  );
}

/* ---------- Customer Sheet ---------- */
function CustomerSheet({ customer, allCustomers, onClose, onEdit, onSelectOther }: {
  customer: CustomerRow;
  allCustomers: CustomerRow[];
  onClose: () => void;
  onEdit: () => void;
  onSelectOther: (c: CustomerRow) => void;
}) {
  const phoneIntl = customer.phone ? `972${customer.phone.replace(/^0/, "").replace(/\D/g, "")}` : null;

  const orders = allCustomers
    .filter((c) => customerKey(c) === customerKey(customer))
    .sort((a, b) => {
      const da = a.purchase_date ? new Date(a.purchase_date).getTime() : 0;
      const db = b.purchase_date ? new Date(b.purchase_date).getTime() : 0;
      return db - da;
    });
  const latestOrder = orders[0] ?? customer;
  const next = nextFollowUpDate(latestOrder);

  return (
    <div className="fixed inset-0 z-30 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-[480px] rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-primary text-white grid place-items-center font-extrabold text-2xl shadow-lg shadow-primary/20 shrink-0">
              {customer.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-extrabold truncate" style={{ color: "var(--slate-900)" }}>{customer.name}</h3>
              <p className="text-xs" style={{ color: "var(--slate-500)" }}>
                נוצר {new Date(customer.created_at).toLocaleDateString("he-IL")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit} className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center text-primary">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-full grid place-items-center text-slate-500"
              style={{ backgroundColor: "var(--slate-100)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {next && (
          <div className="mb-5 p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1">
              <Bell className="w-3.5 h-3.5" /> חזרה ללקוח הבאה
            </div>
            <div className="text-lg font-extrabold" style={{ color: "var(--slate-900)" }}>{fmt(next)}</div>
            <div className="text-xs mt-1" style={{ color: "var(--slate-500)" }}>בעוד {daysUntil(next)} ימים</div>
          </div>
        )}

        <div className="space-y-2.5 mb-5">
          {customer.item && <DetailRow icon={<Package className="w-4 h-4" />} label="ציוד שנרכש" value={customer.item} highlight />}
          {customer.purchase_date && <DetailRow icon={<Calendar className="w-4 h-4" />} label="תאריך רכישה" value={fmt(parseDate(customer.purchase_date))} />}
          {customer.amount != null && <DetailRow icon={<Wallet className="w-4 h-4" />} label="סכום" value={`₪${Number(customer.amount).toLocaleString()}`} />}
          {customer.phone && (
            <DetailRow icon={<Phone className="w-4 h-4" />} label="טלפון"
              value={<a href={`tel:${customer.phone}`} className="text-primary font-bold tracking-wider" dir="ltr">{customer.phone}</a>} />
          )}
          {customer.id_number && <DetailRow icon={<IdCard className="w-4 h-4" />} label="ת.ז" value={customer.id_number} />}
          {customer.address && <DetailRow icon={<MapPin className="w-4 h-4" />} label="כתובת" value={customer.address} />}
          {customer.device_follow_up && <DetailRow icon={<Calendar className="w-4 h-4" />} label="חזרה למכשיר" value={fmt(parseDate(customer.device_follow_up))} />}
          {customer.notes && <DetailRow icon={<Pencil className="w-4 h-4" />} label="הערות" value={customer.notes} />}
        </div>

        {orders.length > 1 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-5 bg-primary rounded-full" />
              <h4 className="text-sm font-bold" style={{ color: "var(--slate-900)" }}>כל ההזמנות</h4>
              <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">{orders.length}</span>
            </div>
            <div className="space-y-2">
              {orders.map((o) => {
                const isCurrent = o.id === customer.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => !isCurrent && onSelectOther(o)}
                    className="w-full text-right rounded-2xl p-3 border transition-colors"
                    style={{
                      borderColor: isCurrent ? "var(--primary)" : "var(--slate-100)",
                      backgroundColor: isCurrent ? "color-mix(in oklab, var(--primary) 8%, white)" : "white",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs font-bold truncate" style={{ color: "var(--slate-900)" }}>
                          {o.item || "—"}
                        </span>
                      </div>
                      <span className="text-[11px] shrink-0" style={{ color: "var(--slate-500)" }}>
                        {fmt(parseDate(o.purchase_date))}
                      </span>
                    </div>
                    {(o.customer_follow_up || o.notes) && (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px]" style={{ color: "var(--slate-500)" }}>
                        {o.customer_follow_up && (
                          <span className="flex items-center gap-1">
                            <Bell className="w-3 h-3" /> חזרה: {fmt(parseDate(o.customer_follow_up))}
                          </span>
                        )}
                        {o.notes && <span className="truncate">{o.notes}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {phoneIntl && (
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${customer.phone}`}
              className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20">
              <Phone className="w-4 h-4" /> חיוג
            </a>
            <a href={`https://wa.me/${phoneIntl}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-[oklch(0.62_0.17_155)] text-white py-3 rounded-xl font-bold shadow-lg shadow-[oklch(0.62_0.17_155/0.2)]">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-2xl"
      style={{ background: highlight ? "var(--primary-soft)" : "var(--slate-50)" }}>
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] mb-0.5" style={{ color: "var(--slate-500)" }}>{label}</div>
        <div className={`font-semibold text-sm ${highlight ? "text-primary" : ""}`}
          style={!highlight ? { color: "var(--slate-900)" } : undefined}>{value}</div>
      </div>
    </div>
  );
}

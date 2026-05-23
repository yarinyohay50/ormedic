import { useState, useEffect, useRef } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { customerSchema, type CustomerInput, type CustomerRow } from "@/lib/customerSchema";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initial?: CustomerRow | null;
  allCustomers?: CustomerRow[];
  onClose: () => void;
  onSaved: () => void;
}

const today = new Date().toISOString().slice(0, 10);
const todayPlusYear = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
})();

const empty: CustomerInput = {
  name: "", phone: "", home_phone: "", id_number: "", purchase_date: today,
  item: "", device_type: "", mask_type: "",
  amount: "", customer_follow_up: todayPlusYear, device_follow_up: "",
  address: "", notes: "",
};

function normalizedId(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function customerKey(c: Pick<CustomerRow, "id_number" | "name" | "phone">) {
  return normalizedId(c.id_number) || `${(c.name ?? "").trim()}|${(c.phone ?? "").trim()}`;
}

export function CustomerForm({ initial, allCustomers = [], onClose, onSaved }: Props) {
  const [data, setData] = useState<CustomerInput>(() => {
    if (!initial) return empty;
    return {
      name: initial.name ?? "",
      phone: initial.phone ?? "",
      home_phone: initial.home_phone ?? "",
      id_number: initial.id_number ?? "",
      purchase_date: initial.purchase_date ?? "",
      item: initial.item ?? "",
      device_type: initial.device_type ?? "",
      mask_type: initial.mask_type ?? "",
      amount: initial.amount != null ? (initial.amount as any) : "",
      customer_follow_up: initial.customer_follow_up ?? "",
      device_follow_up: initial.device_follow_up ?? "",
      address: initial.address ?? "",
      notes: initial.notes ?? "",
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const lastLookup = useRef<string>("");

  function set<K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) {
    setData((d) => {
      const next = { ...d, [k]: v } as CustomerInput;
      // Auto-fill customer follow-up to one year from purchase date
      if (k === "purchase_date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const dt = new Date(v);
        if (!isNaN(dt.getTime())) {
          dt.setFullYear(dt.getFullYear() + 1);
          next.customer_follow_up = dt.toISOString().slice(0, 10);
        }
      }
      return next;
    });
  }

  // Auto-fill name/phone/address from an existing customer when ID matches
  useEffect(() => {
    if (initial) return; // only for new customers
    const idRaw = (data.id_number || "").trim();
    if (!idRaw || idRaw.length < 5) { setAutofilled(false); return; }
    if (lastLookup.current === idRaw) return;
    lastLookup.current = idRaw;
    const t = setTimeout(async () => {
      const { data: rows } = await supabase
        .from("customers")
        .select("name, phone, address")
        .eq("id_number", idRaw)
        .limit(1);
      const found = rows?.[0];
      if (!found) { setAutofilled(false); return; }
      setData((d) => ({
        ...d,
        name: d.name?.trim() ? d.name : (found.name ?? ""),
        phone: d.phone?.trim() ? d.phone : (found.phone ?? ""),
        address: d.address?.trim() ? d.address : (found.address ?? ""),
      }));
      setAutofilled(true);
    }, 350);
    return () => clearTimeout(t);
  }, [data.id_number, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = customerSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    const payload = {
      name: parsed.data.name,
      phone: parsed.data.phone || "",
      home_phone: parsed.data.home_phone || "",
      id_number: parsed.data.id_number || "",
      purchase_date: parsed.data.purchase_date || null,
      item: parsed.data.item || "",
      device_type: parsed.data.device_type || "",
      mask_type: parsed.data.mask_type || "",
      amount: parsed.data.amount === "" ? null : Number(parsed.data.amount),
      customer_follow_up: parsed.data.customer_follow_up || null,
      device_follow_up: parsed.data.device_follow_up || null,
      address: parsed.data.address || "",
      notes: parsed.data.notes || "",
    };

    setBusy(true);
    let err: { message: string } | null = null;
    if (initial) {
      const res = await supabase.from("customers").update(payload).eq("id", initial.id);
      err = res.error;
      const followUpChanged = (payload.customer_follow_up ?? "") !== (initial.customer_follow_up ?? "");
      if (!err && followUpChanged) {
        const key = customerKey(initial);
        const ids = allCustomers.filter((c) => customerKey(c) === key).map((c) => c.id);
        if (!ids.includes(initial.id)) ids.push(initial.id);
        const sync = await supabase.from("customers").update({ customer_follow_up: payload.customer_follow_up }).in("id", ids);
        err = sync.error;
      }
    } else {
      const res = await supabase.from("customers").insert(payload);
      err = res.error;
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`למחוק את "${initial.name}"?`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("customers").delete().eq("id", initial.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-[480px] rounded-t-[2rem] sm:rounded-[2rem] p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-extrabold" style={{ color: "var(--slate-900)" }}>
            {initial ? "עריכת לקוח" : "לקוח חדש"}
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 grid place-items-center text-slate-500"
            style={{ backgroundColor: "var(--slate-100)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="שם הלקוח *" required value={data.name} onChange={(v) => set("name", v)} maxLength={120} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="טלפון" value={data.phone} onChange={(v) => set("phone", v)} dir="ltr" maxLength={30} placeholder="0501234567" />
            <Field label="ת.ז" value={data.id_number} onChange={(v) => set("id_number", v)} dir="ltr" maxLength={40} />
          </div>
          <Field label="טלפון בית" value={data.home_phone} onChange={(v) => set("home_phone", v)} dir="ltr" maxLength={30} placeholder="0212345678" />
          <Field label="ציוד שנרכש" value={data.item} onChange={(v) => set("item", v)} maxLength={200} placeholder="מכשיר / מתכלים" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="סוג מכשיר" value={data.device_type} onChange={(v) => set("device_type", v)} maxLength={120} />
            <Field label="סוג מסיכה" value={data.mask_type} onChange={(v) => set("mask_type", v)} maxLength={120} />
          </div>
          {autofilled && !initial && (
            <div className="text-xs p-2.5 rounded-xl bg-primary/10 text-primary font-medium">
              ✓ נמצא לקוח קיים עם ת.ז זו — השם והטלפון הושלמו אוטומטית
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך רכישה" type="date" value={data.purchase_date} onChange={(v) => set("purchase_date", v)} />
            <Field label="סכום (₪)" type="number" value={String(data.amount)} onChange={(v) => set("amount", v as any)} placeholder="0" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="חזרה ללקוח" type="date" value={data.customer_follow_up} onChange={(v) => set("customer_follow_up", v)} />
            <Field label="חזרה למכשיר" type="date" value={data.device_follow_up} onChange={(v) => set("device_follow_up", v)} />
          </div>
          <Field label="כתובת" value={data.address} onChange={(v) => set("address", v)} maxLength={300} />
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block" style={{ color: "var(--slate-500)" }}>הערות</label>
            <textarea value={data.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm resize-none"
              style={{ backgroundColor: "var(--slate-50)" }} />
          </div>

          {error && (
            <div className="text-sm p-3 rounded-xl bg-[oklch(0.95_0.06_25)] text-[oklch(0.55_0.22_25)]">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            {initial && (
              <button type="button" onClick={handleDelete} disabled={busy}
                className="px-4 py-3 rounded-xl bg-[oklch(0.95_0.06_25)] text-[oklch(0.55_0.22_25)] font-bold disabled:opacity-60">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="submit" disabled={busy}
              className="flex-1 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial ? "שמור שינויים" : "הוסף לקוח"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, dir, maxLength, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; dir?: "rtl" | "ltr";
  maxLength?: number; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block" style={{ color: "var(--slate-500)" }}>{label}</label>
      <input
        type={type} required={required} value={value}
        onChange={(e) => onChange(e.target.value)} dir={dir}
        maxLength={maxLength} placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
        style={{ backgroundColor: "var(--slate-50)" }}
      />
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

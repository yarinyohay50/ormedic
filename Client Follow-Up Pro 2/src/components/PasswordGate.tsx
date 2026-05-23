import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpeg";
import logo2 from "@/assets/logo2.jpeg";

const KEY = "umedic_auth_v1";
const PASS_KEY = "umedic_password_v1";
const DEFAULT_PASSWORD = "1512";
const SETTING_KEY = "login_password";

let cachedPassword: string | null = null;

export function getStoredPassword(): string {
  if (typeof window === "undefined") return DEFAULT_PASSWORD;
  if (cachedPassword) return cachedPassword;
  return localStorage.getItem(PASS_KEY) ?? DEFAULT_PASSWORD;
}

export async function fetchPasswordFromCloud(): Promise<string> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (data?.value) {
      cachedPassword = data.value;
      localStorage.setItem(PASS_KEY, data.value);
      return data.value;
    }
  } catch {
    // offline fallback
  }
  return getStoredPassword();
}

export async function setStoredPassword(p: string): Promise<void> {
  cachedPassword = p;
  localStorage.setItem(PASS_KEY, p);
  await supabase
    .from("app_settings")
    .upsert({ key: SETTING_KEY, value: p, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
export function logout() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  location.reload();
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1") {
      setOk(true);
    }
    fetchPasswordFromCloud().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (ok) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const current = await fetchPasswordFromCloud();
    if (val.trim() === current) {
      sessionStorage.setItem(KEY, "1");
      setOk(true);
    } else {
      setErr(true);
      setVal("");
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-6" style={{ backgroundColor: "var(--slate-100)" }}>
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 space-y-6">
        <div className="flex items-center justify-center gap-3">
          <img src={logo} alt="UMEDIC" className="h-20 w-20 object-contain" />
          <img src={logo2} alt="לוגו" className="h-20 w-20 object-contain" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-extrabold" style={{ color: "var(--slate-900)" }}>כניסה למערכת</h1>
          <p className="text-xs mt-1" style={{ color: "var(--slate-500)" }}>הזן סיסמה כדי להמשיך</p>
        </div>
        <div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={val}
            onChange={(e) => { setVal(e.target.value); setErr(false); }}
            placeholder="סיסמה"
            className={`w-full rounded-2xl py-4 px-4 text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 ${err ? "ring-2 ring-red-400" : "focus:ring-primary/40"}`}
            style={{ backgroundColor: "var(--slate-100)" }}
          />
          {err && <p className="text-xs text-red-500 mt-2 text-center">סיסמה שגויה</p>}
        </div>
        <button type="submit" className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-transform">
          כניסה
        </button>
      </form>
    </div>
  );
}

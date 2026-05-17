import { useEffect, useState } from "react";
import logo from "@/assets/logo.jpeg";
import logo2 from "@/assets/logo2.jpeg";

const KEY = "umedic_auth_v1";
const PASS_KEY = "umedic_password_v1";
const DEFAULT_PASSWORD = "1512";

export function getStoredPassword(): string {
  if (typeof window === "undefined") return DEFAULT_PASSWORD;
  return localStorage.getItem(PASS_KEY) ?? DEFAULT_PASSWORD;
}
export function setStoredPassword(p: string) {
  localStorage.setItem(PASS_KEY, p);
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
    setReady(true);
  }, []);

  if (!ready) return null;
  if (ok) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (val.trim() === getStoredPassword()) {
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

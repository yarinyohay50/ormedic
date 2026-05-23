import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GW = "https://connector-gateway.lovable.dev/google_sheets/v4";

const HEADERS = [
  "מס׳ הזמנה",
  "סטטוס",
  "שם מלא",
  "מס׳ אישי",
  "טלפון",
  "יחידה",
  "פיקוד",
  "תאריך התחלה",
  "תאריך סיום",
  "כמות משתתפים",
  "מדריך",
  "מס׳ השתלמות",
  "הערות",
  "נוצר ב",
];

function authHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const sheets = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lov || !sheets) throw new Error("Google Sheets credentials missing");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": sheets,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function getOrCreateSheet(): Promise<{ id: string; tab: string }> {
  const { data: settings } = await supabaseAdmin
    .from("admin_settings")
    .select("google_sheet_id, google_sheet_tab")
    .eq("id", 1)
    .maybeSingle();

  const tab = settings?.google_sheet_tab || "הזמנות";
  if (settings?.google_sheet_id) {
    return { id: settings.google_sheet_id, tab };
  }

  // Create new spreadsheet
  const createRes = await fetch(`${GW}/spreadsheets`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      properties: { title: "הזמנות - דרך בטוחה", locale: "he_IL" },
      sheets: [{ properties: { title: tab, rightToLeft: true } }],
    }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Sheets create failed [${createRes.status}]: ${t}`);
  }
  const created = (await createRes.json()) as { spreadsheetId: string };
  const id = created.spreadsheetId;

  // Write header row
  const headerRange = `${encodeURIComponent(tab)}!A1`;
  await fetch(
    `${GW}/spreadsheets/${id}/values/${headerRange}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ values: [HEADERS] }),
    },
  );

  await supabaseAdmin
    .from("admin_settings")
    .upsert({ id: 1, google_sheet_id: id, google_sheet_tab: tab, updated_at: new Date().toISOString() });

  return { id, tab };
}

const STATUS_HE: Record<string, string> = {
  pending: "ממתין",
  approved: "מאושר",
  scheduled: "שובץ",
  completed: "הסתיים",
  cancelled: "בוטל",
};

export async function appendBookingToSheet(bookingId: string): Promise<void> {
  const { data: b } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return;

  const { id, tab } = await getOrCreateSheet();
  const row = [
    b.reference_number,
    STATUS_HE[b.status] ?? b.status,
    b.full_name,
    b.id_number,
    b.phone,
    b.unit,
    b.command,
    b.start_date,
    b.end_date,
    b.participants_count,
    b.instructor_name ?? "",
    b.course_number ?? "",
    b.notes ?? "",
    new Date(b.created_at).toLocaleString("he-IL"),
  ];

  const range = `${encodeURIComponent(tab)}!A:N`;
  const res = await fetch(
    `${GW}/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ values: [row] }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets append failed [${res.status}]: ${t}`);
  }
}

export async function getSheetUrl(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("admin_settings")
    .select("google_sheet_id")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.google_sheet_id) return null;
  return `https://docs.google.com/spreadsheets/d/${data.google_sheet_id}/edit`;
}
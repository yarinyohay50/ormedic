import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { appendBookingToSheet, getSheetUrl } from "./sheets-sync.server";

const BookingInput = z.object({
  full_name: z.string().trim().min(2).max(100),
  id_number: z.string().trim().regex(/^\d{5,9}$/u, "מספר אישי לא תקין"),
  phone: z.string().trim().min(7).max(20),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().trim().min(1).max(100),
  command: z.string().trim().min(1).max(100),
  participants_count: z.number().int().min(20).max(30),
});

export const submitBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BookingInput.parse(input))
  .handler(async ({ data }) => {
    const insertData = {
      ...data,
      location: "—",
      unit_location: "—",
    };
    const { error, data: row } = await supabaseAdmin
      .from("bookings")
      .insert(insertData)
      .select("id, reference_number")
      .single();
    if (error) {
      console.error("submitBooking error:", error);
      throw new Error("שגיאה בשליחת ההזמנה");
    }
    return { id: row.id, reference_number: row.reference_number };
  });

export const lookupBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ reference: z.string().trim().min(3).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const digits = data.reference.replace(/\D/g, "");
    if (!digits) throw new Error("מספר הזמנה לא תקין");
    const ref = digits.padStart(5, "0");
    const { data: row, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "reference_number, full_name, unit, start_date, end_date, status, instructor_name, course_number, notes, created_at",
      )
      .eq("reference_number", ref)
      .maybeSingle();
    if (error) {
      console.error("lookupBooking error:", error);
      throw new Error("שגיאה בחיפוש");
    }
    if (!row) throw new Error("מספר הזמנה לא נמצא");
    return row;
  });

async function checkPassword(password: string) {
  // Prefer DB-stored password if set; otherwise fall back to env secret.
  const { data: row } = await supabaseAdmin
    .from("admin_settings")
    .select("password_hash")
    .eq("id", 1)
    .maybeSingle();
  const stored = row?.password_hash;
  const expected = stored || process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Admin password not configured");
  if (password !== expected) throw new Error("סיסמה שגויה");
}

export const adminListBookings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: z.string() }).parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    const { data: rows, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("adminListBookings error:", error);
      throw new Error("שגיאה בטעינת הנתונים");
    }
    return { bookings: rows ?? [] };
  });

const UpdateInput = z.object({
  password: z.string(),
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "scheduled", "completed", "cancelled"]).optional(),
  instructor_name: z.string().trim().max(100).nullable().optional(),
  course_number: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  command: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  unit_location: z.string().trim().max(200).optional(),
});

export const adminUpdateBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    const { password, id, ...updates } = data;
    void password;
    const { error } = await supabaseAdmin.from("bookings").update(updates).eq("id", id);
    if (error) {
      console.error("adminUpdateBooking error:", error);
      throw new Error("שגיאה בעדכון");
    }
    // Sync to Google Sheets only when the booking is approved.
    if (updates.status === "approved") {
      try {
        await appendBookingToSheet(id);
      } catch (e) {
        console.error("sheets sync error:", e);
      }
    }
    return { ok: true };
  });

const DeleteInput = z.object({
  password: z.string(),
  id: z.string().uuid(),
});

export const adminDeleteBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    const { error } = await supabaseAdmin
      .from("bookings")
      .delete()
      .eq("id", data.id);
    if (error) {
      console.error("adminDeleteBooking error:", error);
      throw new Error("שגיאה במחיקה");
    }
    return { ok: true };
  });

export const adminVerifyPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: z.string() }).parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    return { ok: true };
  });

export const adminGetSheetUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: z.string() }).parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    const url = await getSheetUrl();
    return { url };
  });

const ChangePasswordInput = z.object({
  currentPassword: z.string(),
  newPassword: z.string().trim().min(4).max(100),
});

export const adminChangePassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChangePasswordInput.parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.currentPassword);
    const { error } = await supabaseAdmin
      .from("admin_settings")
      .upsert({
        id: 1,
        password_hash: data.newPassword,
        updated_at: new Date().toISOString(),
      });
    if (error) {
      console.error("adminChangePassword error:", error);
      throw new Error("שגיאה בשמירת הסיסמה");
    }
    return { ok: true };
  });

const ImportRow = z.object({
  reference_number: z.string().trim().min(1),
  status: z.enum(["pending", "approved", "scheduled", "completed", "cancelled"]).optional(),
  command: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().max(200).optional(),
  unit_location: z.string().trim().max(200).optional(),
  instructor_name: z.string().trim().max(100).nullable().optional(),
  course_number: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const ImportInput = z.object({
  password: z.string(),
  rows: z.array(ImportRow).min(1).max(1000),
});

export const adminImportBookings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data }) => {
    await checkPassword(data.password);
    let updated = 0;
    const errors: string[] = [];
    for (const row of data.rows) {
      const ref = row.reference_number.replace(/\D/g, "").padStart(5, "0");
      const { reference_number, ...rest } = row;
      void reference_number;
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined && v !== "") updates[k] = v;
      }
      if (Object.keys(updates).length === 0) continue;
      const { error, count } = await supabaseAdmin
        .from("bookings")
        .update(updates as never, { count: "exact" })
        .eq("reference_number", ref);
      if (error) {
        errors.push(`${ref}: ${error.message}`);
      } else if ((count ?? 0) === 0) {
        errors.push(`${ref}: לא נמצאה הזמנה`);
      } else {
        updated++;
      }
    }
    return { updated, errors };
  });


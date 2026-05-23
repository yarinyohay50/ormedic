import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "שם הוא שדה חובה").max(120),
  phone: z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, "טלפון לא תקין").default(""),
  home_phone: z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, "טלפון לא תקין").default(""),
  id_number: z.string().trim().max(40).default(""),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").or(z.literal("")).default(""),
  item: z.string().trim().max(200).default(""),
  device_type: z.string().trim().max(120).default(""),
  mask_type: z.string().trim().max(120).default(""),
  amount: z.union([z.coerce.number().min(0).max(1_000_000), z.literal("")]).default(""),
  customer_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").or(z.literal("")).default(""),
  device_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").or(z.literal("")).default(""),
  address: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export interface CustomerRow {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  home_phone: string | null;
  id_number: string | null;
  purchase_date: string | null;
  item: string | null;
  device_type: string | null;
  mask_type: string | null;
  amount: number | null;
  customer_follow_up: string | null;
  device_follow_up: string | null;
  address: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

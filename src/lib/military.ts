export const COMMANDS = [
  "פיקוד צפון",
  "פיקוד מרכז",
  "פיקוד דרום",
  "פיקוד העורף",
  "זרוע היבשה",
  "חיל האוויר",
  "חיל הים",
  "אגף המודיעין",
  "אגף התקשוב",
  "אגף הטכנולוגיה והלוגיסטיקה",
  "אכ״א",
  "מצ״ח",
  "מפקדת קצין חינוך",
  "אחר",
] as const;

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-amber-100 text-amber-900 border-amber-300" },
  approved: { label: "מאושר", color: "bg-blue-100 text-blue-900 border-blue-300" },
  scheduled: { label: "שובץ", color: "bg-purple-100 text-purple-900 border-purple-300" },
  completed: { label: "הסתיים", color: "bg-green-100 text-green-900 border-green-300" },
  cancelled: { label: "בוטל", color: "bg-red-100 text-red-900 border-red-300" },
};

export type BookingStatus = keyof typeof STATUS_LABELS;

export type Booking = {
  id: string;
  reference_number: string;
  full_name: string;
  id_number: string;
  phone: string;
  location: string;
  start_date: string;
  end_date: string;
  unit: string;
  unit_location: string;
  command: string;
  participants_count: number;
  status: BookingStatus;
  instructor_name: string | null;
  course_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
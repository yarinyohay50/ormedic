import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Phone, Mail, MapPin, Clock } from "lucide-react";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "צור קשר - דרך בטוחה" },
      { name: "description", content: "צרו קשר עם דרך בטוחה - קורסי נהיגה מונעת." },
    ],
  }),
});

function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-center">צור קשר</h1>
        <p className="text-lg text-muted-foreground text-center mb-12">
          אנחנו כאן לכל שאלה. דברו איתנו!
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            { icon: Phone, title: "טלפון", value: "03-1234567" },
            { icon: Mail, title: "אימייל", value: "info@derech-betucha.co.il" },
            { icon: MapPin, title: "כתובת", value: "רחוב הראשי 1, תל אביב" },
            { icon: Clock, title: "שעות פעילות", value: "א'-ה' 08:00-20:00" },
          ].map((i) => (
            <Card key={i.title} className="p-6 flex items-center gap-4 hover:shadow-[var(--shadow-card)] transition-all">
              <div className="h-12 w-12 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shrink-0">
                <i.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{i.title}</div>
                <div className="font-semibold">{i.value}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
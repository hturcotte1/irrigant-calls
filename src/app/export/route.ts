import { contactsToCsv } from "@/lib/export-csv";
import { getStore } from "@/lib/store";
import { HOME_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

// The call sheet with results filled in. Behind the dashboard password (see src/proxy.ts).
export async function GET() {
  const contacts = await getStore().allContacts();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TZ }).format(new Date());
  return new Response(contactsToCsv(contacts), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="irrigant-call-sheet-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import "server-only";

// Every setting the app reads, in one place. See .env.example for what each one is.
export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  retellApiKey: process.env.RETELL_API_KEY ?? "",
  retellWebhookKey: process.env.RETELL_WEBHOOK_KEY || process.env.RETELL_API_KEY || "",
  retellAgentId: process.env.RETELL_AGENT_ID ?? "",
  fromNumber: process.env.RETELL_FROM_NUMBER || "+12089283200",
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  demo: process.env.DEMO_MODE === "1",
};

export function readiness() {
  return [
    { label: "Database (Supabase URL and secret key)", ok: env.demo || Boolean(env.supabaseUrl && env.supabaseKey) },
    { label: "Dashboard password", ok: Boolean(env.dashboardPassword) },
    { label: "Retell API key", ok: Boolean(env.retellApiKey) },
    { label: "Retell agent for outbound calls", ok: Boolean(env.retellAgentId) },
    { label: "Scheduler secret (CRON_SECRET)", ok: Boolean(env.cronSecret) },
  ];
}

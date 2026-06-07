-- Daily schedule for the partial-issue-email Edge Function.
-- 30 3 * * * = 03:30 UTC = 09:00 IST (after the weekly PO/DC jobs).
-- Mirrors the existing weekly jobs' net.http_post command shape: the
-- Authorization bearer is read from the app.service_role_key GUC.
-- Requires pg_cron + pg_net (Supabase platform extensions).
select cron.schedule(
  'partial-issue-email-daily',
  '30 3 * * *',
  $$ select net.http_post(
       url     := 'https://mclskjvrkopowusevuyk.supabase.co/functions/v1/partial-issue-email',
       headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
                    'Content-Type', 'application/json'
                  ),
       body    := '{}'::jsonb
     ); $$
);

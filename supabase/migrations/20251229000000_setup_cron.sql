-- Migration: Setup pg_cron for flight updates
-- Description: Enables pg_cron and schedules the update-flights Edge Function.

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS net;

-- 2. Clear existing job if exists
SELECT cron.unschedule('update-flights-task');

-- 3. Schedule the Edge Function every 6 hours
-- Substitua 'SUA_REGION' e 'SEU_PROJECT_REF' se necessário, ou use a URL do projeto atual.
-- Nota: O corpo {} é necessário para o POST.
SELECT cron.schedule(
  'update-flights-task',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM (SELECT setting as value FROM pg_settings WHERE name = 'app.supabase_url') AS s) || '/functions/v1/update-flights',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || (SELECT value FROM (SELECT setting as value FROM pg_settings WHERE name = 'app.supabase_service_role_key') AS s) || '"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

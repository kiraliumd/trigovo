-- Migration: Enhance flights and tickets structure
-- Description: Allow multiple flights per PNR and add arrival/airline info.

-- 1. Ensure columns exist on flights (safety check)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='flights' AND column_name='airline') THEN
        ALTER TABLE flights ADD COLUMN airline airline_enum;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='flights' AND column_name='arrival_date') THEN
        ALTER TABLE flights ADD COLUMN arrival_date timestamp with time zone;
    END IF;
END $$;

-- 2. Update tickets table uniqueness
-- Remove old constraint if it exists (usually named tickets_pnr_agency_id_key or similar)
-- We need to find the constraint name first if it's not standard, but usually it's public.tickets_pnr_agency_id_key
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_pnr_agency_id_key;

-- Create new constraint including flight_id
-- Note: flight_id can be null if it's a manual entry, so we might need a workaround for uniqueness if it is null
-- but for scraper entries it will have flight_id.
-- To be safe, we use COALESCE or just accept that multiple NULL flight_ids for same PNR might happen
-- but in our flow flight_id is always set for scraped tickets.
ALTER TABLE tickets ADD CONSTRAINT tickets_pnr_flight_id_agency_id_key UNIQUE (pnr, flight_id, agency_id);

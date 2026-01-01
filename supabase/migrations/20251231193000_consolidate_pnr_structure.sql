-- Migration: Consolidate PNR structure
-- Description: Restore uniqueness (pnr, agency_id) and link multiple flights via ticket_flights table.

-- 1. Create associative table if not exists
CREATE TABLE IF NOT EXISTS ticket_flights (
    ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
    flight_id uuid REFERENCES flights(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, flight_id)
);

-- 2. Cleanup existing duplicate tickets for same PNR+Agency (keep only the first one)
-- This is necessary to restore the unique constraint
DELETE FROM tickets 
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY pnr, agency_id ORDER BY created_at ASC) as row_num
        FROM tickets
    ) t
    WHERE t.row_num > 1
);

-- 3. Restore original uniqueness on tickets
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_pnr_flight_id_agency_id_key;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_pnr_agency_unique;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_pnr_agency_id_key;

-- Ensure there are no duplicates again just in case before adding constraint
ALTER TABLE tickets ADD CONSTRAINT tickets_pnr_agency_id_key UNIQUE (pnr, agency_id);

-- 4. Enable RLS on ticket_flights
ALTER TABLE ticket_flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ticket associations" 
ON ticket_flights FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM tickets 
        WHERE tickets.id = ticket_flights.ticket_id 
        AND tickets.agency_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their own ticket associations" 
ON ticket_flights FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM tickets 
        WHERE tickets.id = ticket_flights.ticket_id 
        AND tickets.agency_id = auth.uid()
    )
);

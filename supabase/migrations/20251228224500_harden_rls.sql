-- Migration: Harden RLS for flights table
-- Description: Restricts SELECT on flights so agencies only see flights they are tracking.

-- 1. Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated users can view flights" ON flights;
DROP POLICY IF EXISTS "Authenticated users can insert flights" ON flights;

-- 2. New Hardened View Policy
-- An agency can only SELECT flights that are referenced by at least one of its tickets.
CREATE POLICY "Agencies can view flights they are tracking" ON flights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tickets 
      WHERE tickets.flight_id = flights.id 
      AND tickets.agency_id = auth.uid()
    )
  );

-- 3. New Hardened Insert Policy (with auth.uid check)
CREATE POLICY "Authenticated users can insert flights" ON flights
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

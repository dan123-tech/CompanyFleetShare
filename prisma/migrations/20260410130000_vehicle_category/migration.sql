-- Add vehicle category for cars (control + tenant DB schema parity)

DO $$ BEGIN
  CREATE TYPE "VehicleCategory" AS ENUM ('Sedan', 'Suv', 'Hatchback', 'Wagon', 'Coupe', 'Van', 'Truck', 'Other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Car"
  ADD COLUMN IF NOT EXISTS "vehicleCategory" "VehicleCategory" NOT NULL DEFAULT 'Other';


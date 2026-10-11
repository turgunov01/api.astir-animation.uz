-- Children are asked for a birth date: the age stays right as they grow.
ALTER TABLE children ADD COLUMN IF NOT EXISTS birth_date date;

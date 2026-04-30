-- Migration to add image_fit_mode to companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS image_fit_mode TEXT NOT NULL DEFAULT 'contain'
CHECK (image_fit_mode IN ('contain', 'cover', 'fill'));

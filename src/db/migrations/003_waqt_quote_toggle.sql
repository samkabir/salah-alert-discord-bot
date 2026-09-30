-- Extend waqt_settings to support Quranic ayah quote toggle per waqt.
-- show_quote defaults to 1 (enabled), so alerts automatically include verified ayahs
-- upon deployment without requiring manual reconfiguration.
ALTER TABLE waqt_settings ADD COLUMN show_quote INTEGER NOT NULL DEFAULT 1;

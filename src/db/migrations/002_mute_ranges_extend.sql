-- Extend mute_ranges to support enable/disable and optional time-window ("half day") mutes.
-- from_time / to_time are NULL for a whole-day mute; when both are set (HH:MM),
-- only alerts whose scheduled time falls within [from_time, to_time] on the covered
-- date(s) are muted.
ALTER TABLE mute_ranges ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mute_ranges ADD COLUMN from_time TEXT;
ALTER TABLE mute_ranges ADD COLUMN to_time TEXT;

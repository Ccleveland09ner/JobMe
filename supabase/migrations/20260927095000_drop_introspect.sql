-- Removes the temporary diagnostic function used to determine which schema
-- the application tables and the vector extension actually lived in.
-- Nothing in the application calls it.
drop function if exists public.__jobme_introspect();

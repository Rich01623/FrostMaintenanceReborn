# Frost Maintenance Reborn

Defect-request update (14 October 2026): “Check for Maintenance Requests” lists
vehicle defects explicitly sent to JCC from Fleet Maintenance → View Defects.
Requires operational database update 097. Reports remain private and visible only
to active mechanics in the same company or Office users with Maintenance access.
Existing upload and document-authorisation workflows are unchanged.

Frost Connect maintenance upload portal for Frost Transport Solutions in TMS Reborn.

Static assets only; uploaded documents stay in Frost’s private Supabase project. Anonymous visitors cannot read the fleet or upload documents.

Login names: Chris Frost, Richard Robinson, JCC. Passwords are set by Frost’s Main Administrator through Fleet Maintenance → Authorise Documents → Mechanic accounts in TMS Reborn. No passwords or privileged keys are stored here.

PMI and brake-test documents require office authorisation; one inspection submission resets the current due week by six weeks exactly once. Supporting files do not repeat the date reset.

Built from source.js and config.js using esbuild with @supabase/supabase-js installed from the normal package registry. The publishable key is public and grants no access without a signed-in, approved maintenance account.

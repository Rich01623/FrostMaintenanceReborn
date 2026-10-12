# Frost Maintenance Reborn

Frost Connect maintenance upload portal for Frost Transport Solutions in TMS Reborn.

Static assets only; uploaded documents stay in Frost’s private Supabase project. Anonymous visitors cannot read the fleet or upload documents.

Login names: Chris Frost, Richard Robinson, JCC. Passwords are set by Frost’s Main Administrator through Fleet Maintenance → Authorise Documents → Mechanic accounts in TMS Reborn. No passwords or privileged keys are stored here.

PMI and brake-test documents require office authorisation; one inspection submission resets the current due week by six weeks exactly once. Supporting files do not repeat the date reset.

Built from source.js and config.js using esbuild with @supabase/supabase-js installed from the normal package registry. The publishable key is public and grants no access without a signed-in, approved maintenance account.

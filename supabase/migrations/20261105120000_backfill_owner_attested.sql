-- =============================================================================
-- Reports read before the owner-attested rule no longer dead-end.
--
-- Documents recorded as 'no_identifiers' or 'unverifiable' (the report names no
-- one, or could not be matched) kept the old identity safeguard: the database
-- refused to Confirm or Correct their held results, so a person who tried to
-- clear them in the app saw the same "reports to verify" afterwards.
--
-- Under the current rule only a contradiction ('mismatch') stops a report. Those
-- two values mean exactly "nothing on the page contradicts it", so they are
-- recorded as 'owner_attested', the same as a report read today.
-- Results held for a legibility or ambiguity reason stay held (nothing here
-- touches facts); results held only because of the old identity rule are
-- replaced when the report is read again.
--
-- ROLLBACK (not exact; the original value is not kept):
--   update documents set identity_check = 'unverifiable' where identity_check = 'owner_attested';
-- =============================================================================
update public.documents
   set identity_check = 'owner_attested'
 where identity_check in ('no_identifiers', 'unverifiable');

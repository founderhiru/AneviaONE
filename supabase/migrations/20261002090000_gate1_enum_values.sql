-- =============================================================================
-- Gate 1 · migration 1/2 — enum values only
--
-- Kept in its own file because a newly added enum value cannot be used in the
-- same transaction that adds it (the next migration uses it).
--
-- needs_review: an EXTRACTED fact whose confidence, evidence strength or
-- ambiguity is below the trust threshold. It is stored (so a person can review
-- it) but it is NOT in any current_* view, so it can never feed trends, "what
-- changed" or Ask My Health until a person confirms it.
-- =============================================================================

alter type public.fact_review_status add value if not exists 'needs_review';

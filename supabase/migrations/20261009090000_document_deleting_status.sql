-- =============================================================================
-- Phase B · document deletion — lifecycle state (1/2)
--
-- `deleting`: the person asked to delete the document and the server has
-- started; the stored original and the document's records are being removed.
-- A document stays in this state (visible, retryable) until both the Storage
-- object and the database records are gone; then its row is removed.
--
-- Its own migration: a new enum value can't be used in the transaction that
-- adds it (20261009090100 uses it).
-- =============================================================================

alter type public.document_status add value if not exists 'deleting';

/**
 * EngineDb / EngineStorage / authentication on Supabase, using the
 * SERVICE-ROLE client. This file runs only inside the Edge Function; the
 * service-role key comes from the function's environment and never leaves it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountIdentity } from './identity.ts';
import type { ClaimedDocument, CompletionCounts, EngineDb, EngineStorage, FailureArgs } from './pipeline.ts';

function ensure<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  // Database messages can echo values — keep only the operation name.
  if (result.error) throw new Error(`database_error:${what}`);
  return result.data;
}

export function supabaseEngineDb(admin: SupabaseClient): EngineDb {
  return {
    async getOwnedDocument(documentId, userId) {
      return ensure(
        await admin.from('documents').select('id, status, failure_kind').eq('id', documentId).eq('user_id', userId).maybeSingle(),
        'get_document',
      );
    },
    async hasAiConsent(userId, policyVersion) {
      return Boolean(ensure(await admin.rpc('engine_has_ai_consent', { p_user_id: userId, p_policy_version: policyVersion }), 'consent'));
    },
    async claimDocument(documentId, userId, reprocess, maxAttempts) {
      const rows = ensure(
        await admin.rpc('engine_claim_document', {
          p_document_id: documentId,
          p_user_id: userId,
          p_reprocess: reprocess,
          p_max_attempts: maxAttempts,
        }),
        'claim',
      ) as ClaimedDocument[] | null;
      return rows?.[0] ?? null;
    },
    async recordOriginal(documentId, userId, sha256, pageCount) {
      ensure(
        await admin.rpc('engine_record_original', { p_document_id: documentId, p_user_id: userId, p_sha256: sha256, p_page_count: pageCount }),
        'record_original',
      );
    },
    async startRun(a) {
      return ensure(
        await admin.rpc('engine_start_run', {
          p_document_id: a.documentId,
          p_user_id: a.userId,
          p_pipeline_version: a.pipelineVersion,
          p_model_provider: a.provider,
          p_model_name: a.model,
          p_prompt_version: a.promptVersion,
          p_consent_version: a.consentVersion,
        }),
        'start_run',
      ) as string;
    },
    async completeDocument(runId, userId, payload) {
      return ensure(
        await admin.rpc('engine_complete_document', { p_run_id: runId, p_user_id: userId, p_payload: payload }),
        'complete',
      ) as CompletionCounts;
    },
    async failDocument(a: FailureArgs) {
      ensure(
        await admin.rpc('engine_fail_document', {
          p_document_id: a.documentId,
          p_user_id: a.userId,
          p_run_id: a.runId,
          p_failure_kind: a.failureKind,
          p_error_code: a.errorCode,
          p_user_message: a.userMessage,
          p_review_reason: a.reviewReason ?? null,
          p_identity_check: a.identityCheck ?? null,
          p_text_layer: a.textLayer ?? null,
        }),
        'fail',
      );
    },
    async getAccountIdentity(userId): Promise<AccountIdentity> {
      const profile = ensure(await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(), 'profile');
      const health = ensure(await admin.from('health_profiles').select('date_of_birth').eq('user_id', userId).maybeSingle(), 'health_profile');
      return { displayName: profile?.display_name ?? null, dateOfBirth: health?.date_of_birth ?? null };
    },
  };
}

export function supabaseEngineStorage(admin: SupabaseClient): EngineStorage {
  return {
    async downloadOriginal(storagePath) {
      const { data, error } = await admin.storage.from('medical-documents').download(storagePath);
      if (error || !data) throw new Error('storage_download_failed');
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function supabaseAuthenticate(admin: SupabaseClient) {
  return async (jwt: string): Promise<string | null> => {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  };
}

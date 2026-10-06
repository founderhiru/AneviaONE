/** Service-role database adapter. Server-side only; never imported by the mobile app. */
import type { ClaimResult, ConsentRow, DocumentRow, ProcessDb } from './handler.ts';

// deno-lint-ignore no-explicit-any
type Admin = any; // SupabaseClient — kept loose so this file type-checks without the package.

export function createSupabaseDb(admin: Admin): ProcessDb {
  return {
    async getDocument(userId, documentId) {
      const { data, error } = await admin
        .from('documents')
        .select('id,status,storage_bucket,storage_path,file_size_bytes,mime_type')
        .eq('id', documentId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('db_error');
      return (data as DocumentRow | null) ?? null;
    },
    async getLatestConsents(userId) {
      const { data, error } = await admin
        .from('consents')
        .select('consent_type,granted,policy_version,recorded_at')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
      if (error) throw new Error('db_error');
      const seen = new Set<string>();
      const latest: ConsentRow[] = [];
      for (const r of (data ?? []) as (ConsentRow & { recorded_at: string })[]) {
        if (seen.has(r.consent_type)) continue;
        seen.add(r.consent_type);
        latest.push({ consent_type: r.consent_type, granted: r.granted, policy_version: r.policy_version });
      }
      return latest;
    },
    async getProfile(userId) {
      const { data, error } = await admin.from('health_profiles').select('full_name,date_of_birth').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('db_error');
      return { fullName: data?.full_name ?? null, dateOfBirth: data?.date_of_birth ?? null };
    },
    async claim(documentId, userId, reprocess, maxAttempts) {
      const { data, error } = await admin.rpc('claim_document_processing', {
        p_document_id: documentId, p_user_id: userId, p_reprocess: reprocess, p_max_attempts: maxAttempts,
      });
      if (error) throw new Error('db_error');
      return data as ClaimResult;
    },
    async startRun(documentId, userId, meta) {
      const { data, error } = await admin
        .from('extraction_runs')
        .insert({
          document_id: documentId, user_id: userId, status: 'running', started_at: new Date().toISOString(),
          pipeline_version: meta.pipelineVersion, model_provider: 'anthropic', model_name: meta.model, prompt_version: meta.promptVersion,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('db_error');
      return data.id as string;
    },
    async fail({ documentId, runId, info, identity, stats }) {
      const { error } = await admin.rpc('fail_document_processing', {
        p_document_id: documentId, p_run_id: runId, p_failure_code: info.code, p_retryable: info.retryable,
        p_error_kind: info.kind, p_user_message: info.userMessage, p_identity_check: identity, p_stats: stats,
      });
      if (error) throw new Error('db_error');
    },
    async commit(documentId, runId, payload) {
      const { data, error } = await admin.rpc('commit_document_extraction', { p_document_id: documentId, p_run_id: runId, p_result: payload });
      if (error) throw new Error('db_error');
      return data;
    },
  };
}

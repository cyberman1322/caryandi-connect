import { getSupabase } from '@/lib/supabase/client';
import type { Enums, Views } from '@/lib/supabase/database.types';
import { compressPhoto, checkDocumentFile, extensionFor, storagePath } from '@/lib/storage/images';
import { ServiceError } from '@/lib/vehicles/vehicle-service';

/**
 * Verification is optional and never blocks listing.
 *   - Vehicle: any car (private or dealer) is verified on its own with its DOCUMENTS
 *     (registration book, import papers …). No selfie. Earns "Verified vehicle".
 *   - Business: a dealer / provider verifies the business once (live selfie + papers).
 *     Earns "Verified dealer/business". It no longer marks every car verified.
 * Ownership, one-open-request and "already verified" rules are enforced by the
 * database (migrations 0004, 0016); only administrators can decide.
 */

export type VerificationRequest = Views<'verification_request_details'>;
export type VerificationStatus = Enums<'verification_status'>;
export type VerificationDocumentType = Enums<'admin_document_type'>;

export const VERIFICATION_DOCUMENT_LABELS: Record<VerificationDocumentType, string> = {
  national_id: 'National registration card (NRC)',
  passport: 'Passport',
  business_registration: 'Business registration (PACRA)',
  tax_certificate: 'Tax clearance / TPIN certificate',
  other: 'Other supporting document',
  registration_book: 'Registration book (white book)',
  import_papers: 'Import papers (bill of lading / export certificate)',
  customs_clearance: 'ZRA customs clearance certificate',
  police_clearance: 'Police (Interpol) clearance',
};

/** What a seller can attach when verifying a car. */
export const VEHICLE_DOCUMENT_TYPES: VerificationDocumentType[] = [
  'registration_book', 'import_papers', 'customs_clearance', 'police_clearance', 'other',
];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Not verified',
  pending: 'Under review',
  approved: 'Verified',
  rejected: 'Not approved',
};

/** The verification bucket's own limit (migration 0007). */
export const MAX_VERIFICATION_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_VERIFICATION_DOCUMENTS = 4;
/** A selfie older than this is refused — it should have just been taken. */
const MAX_SELFIE_AGE_MS = 30 * 60 * 1000;

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) fail('Please sign in to continue.');
  return id;
}

/** Friendlier text for the database's own rule violations. */
function submitErrorText(error: { code?: string; message?: string }): string {
  const msg = error.message ?? '';
  if (error.code === '23505') return 'A verification request for this is already under review.';
  if (/already verified/i.test(msg)) return msg;
  if (/only verify|must belong|at least one document|at most|upload is missing|18 or older/i.test(msg)) return msg;
  return 'We couldn’t submit your verification. Please try again.';
}

/* ------------------------------------------------------------------ seller side */

export async function listMyVerificationRequests(): Promise<VerificationRequest[]> {
  const uid = await currentUserId();
  const { data, error } = await getSupabase()
    .from('verification_request_details')
    .select('*')
    .eq('requester_id', uid)
    .order('created_at', { ascending: false });
  if (error) fail('We couldn’t load your verification requests.', error);
  return data ?? [];
}

export type VerificationDocumentInput = { type: VerificationDocumentType; file: File };

export type SubmitVerificationInput = { subject: 'business'; businessId: string; vehicleId: string | null };

export function checkVerificationDocument(file: File): string | null {
  const check = checkDocumentFile(file);
  if (!check.ok) return check.error;
  if (file.type === 'application/pdf' && file.size > MAX_VERIFICATION_FILE_BYTES) {
    return `${file.name}: PDFs must be 8 MB or smaller.`;
  }
  return null;
}

/**
 * Uploads the live selfie (and any documents) to the private bucket, then
 * creates the request. Files are write-once for users, so everything is
 * validated before the first upload.
 */
export async function submitVerification(
  target: SubmitVerificationInput,
  selfie: { blob: Blob; capturedAt: Date },
  documents: VerificationDocumentInput[],
  notes: string,
): Promise<string> {
  if (Date.now() - selfie.capturedAt.getTime() > MAX_SELFIE_AGE_MS) {
    fail('Your selfie is more than 30 minutes old. Please retake it.');
  }
  if (selfie.blob.size > MAX_VERIFICATION_FILE_BYTES) fail('The selfie is too large. Please retake it.');
  if (documents.length > MAX_VERIFICATION_DOCUMENTS) fail(`Attach at most ${MAX_VERIFICATION_DOCUMENTS} documents.`);
  for (const d of documents) {
    const problem = checkVerificationDocument(d.file);
    if (problem) fail(problem);
  }
  const trimmedNotes = notes.trim().slice(0, 1000);

  const uid = await currentUserId();
  const supabase = getSupabase();
  const bucket = supabase.storage.from('verification');

  // Photos are re-encoded (strips EXIF/GPS and keeps them under the bucket limit).
  const prepared: Array<{ type: VerificationDocumentType; body: Blob; contentType: string }> = [];
  for (const d of documents) {
    const body: Blob = d.file.type === 'application/pdf' ? d.file : await compressPhoto(d.file, 2400, 0.85);
    if (body.size > MAX_VERIFICATION_FILE_BYTES) fail(`${d.file.name}: this file is too large (max 8 MB).`);
    prepared.push({ type: d.type, body, contentType: body.type || d.file.type });
  }

  const selfiePath = storagePath(uid, 'selfie', 'jpg');
  const up = await bucket.upload(selfiePath, selfie.blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) fail('Your selfie could not be uploaded. Check your connection and try again.', up.error);

  const row = {
    requester_id: uid,
    subject: target.subject,
    business_id: target.businessId,
    vehicle_id: target.vehicleId,
    selfie_path: selfiePath,
    selfie_captured_at: selfie.capturedAt.toISOString(),
    requester_notes: trimmedNotes || null,
  };
  const { data, error } = await supabase.from('verification_requests').insert(row).select('id').single();
  if (error || !data) fail(error ? submitErrorText(error) : 'We couldn’t submit your verification.', error);

  const failed: string[] = [];
  for (const d of prepared) {
    const path = storagePath(uid, `request-${data.id}`, extensionFor(d.contentType));
    const docUpload = await bucket.upload(path, d.body, { contentType: d.contentType, upsert: false });
    const docRow = docUpload.error
      ? { error: docUpload.error }
      : await supabase.from('verification_documents').insert({ request_id: data.id, document_type: d.type, storage_path: path });
    if (docRow.error) {
      console.error('verification document failed', docRow.error);
      failed.push(VERIFICATION_DOCUMENT_LABELS[d.type]);
    }
  }
  if (failed.length) {
    fail(`Your request was submitted, but these documents didn’t upload: ${failed.join(', ')}. Our team may ask you for them.`);
  }
  return data.id;
}

/** Re-encodes photos (strips EXIF/GPS) and uploads documents to the private bucket. */
async function uploadDocuments(uid: string, documents: VerificationDocumentInput[]): Promise<Array<{ type: VerificationDocumentType; path: string }>> {
  const bucket = getSupabase().storage.from('verification');
  const prepared: Array<{ type: VerificationDocumentType; body: Blob; contentType: string }> = [];
  for (const d of documents) {
    const body: Blob = d.file.type === 'application/pdf' ? d.file : await compressPhoto(d.file, 2400, 0.85);
    if (body.size > MAX_VERIFICATION_FILE_BYTES) fail(`${d.file.name}: this file is too large (max 8 MB).`);
    prepared.push({ type: d.type, body, contentType: body.type || d.file.type });
  }
  const uploaded: Array<{ type: VerificationDocumentType; path: string }> = [];
  for (const d of prepared) {
    const path = storagePath(uid, 'request-docs', extensionFor(d.contentType));
    const { error } = await bucket.upload(path, d.body, { contentType: d.contentType, upsert: false });
    if (error) fail(`${VERIFICATION_DOCUMENT_LABELS[d.type]} couldn’t be uploaded. Check your connection and try again.`, error);
    uploaded.push({ type: d.type, path });
  }
  return uploaded;
}

/** Verify one car with its documents (1–4). No selfie. Works for private and dealer cars. */
export async function submitVehicleVerification(vehicleId: string, documents: VerificationDocumentInput[], notes: string): Promise<string> {
  if (!documents.length) fail('Add at least one document, such as the registration book or import papers.');
  if (documents.length > MAX_VERIFICATION_DOCUMENTS) fail(`Attach at most ${MAX_VERIFICATION_DOCUMENTS} documents.`);
  for (const d of documents) {
    const problem = checkVerificationDocument(d.file);
    if (problem) fail(problem);
  }
  const uid = await currentUserId();
  const uploaded = await uploadDocuments(uid, documents);
  const { data, error } = await getSupabase().rpc('submit_vehicle_verification', {
    p_vehicle_id: vehicleId,
    p_documents: uploaded,
    ...(notes.trim() ? { p_notes: notes.trim().slice(0, 1000) } : {}),
  });
  if (error || !data) fail(error ? submitErrorText(error) : 'We couldn’t submit your verification.', error);
  return data;
}

export type MyVehicleVerification = { canVerify: boolean; status: VerificationStatus };

/** The signed-in seller's view of one car's verification (null if it isn't theirs). */
export async function getMyVehicleVerification(vehicleId: string): Promise<MyVehicleVerification | null> {
  const { data, error } = await getSupabase().rpc('my_vehicle_verification', { p_vehicle_id: vehicleId });
  if (error) fail('We couldn’t check this car’s verification.', error);
  const row = data?.[0];
  return row ? { canVerify: Boolean(row.can_verify), status: (row.status ?? 'unverified') as VerificationStatus } : null;
}

/* ------------------------------------------------------------------ admin side */

export async function listVerificationQueue(status: 'pending' | 'approved' | 'rejected', limit = 50): Promise<VerificationRequest[]> {
  const { data, error } = await getSupabase()
    .from('verification_request_details')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(limit);
  if (error) fail('We couldn’t load verification requests.', error);
  return data ?? [];
}

export type VerificationFiles = {
  selfieUrl: string | null;
  documents: Array<{ id: string; type: VerificationDocumentType; url: string | null }>;
};

/** Short-lived signed links (5 minutes) — the bucket is private. */
export async function getVerificationFiles(request: VerificationRequest): Promise<VerificationFiles> {
  const supabase = getSupabase();
  const bucket = supabase.storage.from('verification');
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data, error } = await bucket.createSignedUrl(path, 300);
    if (error) console.error('signed url failed', error);
    return data?.signedUrl ?? null;
  };
  const { data: docs, error } = await supabase
    .from('verification_documents')
    .select('id, document_type, storage_path')
    .eq('request_id', request.id ?? '')
    .order('created_at');
  if (error) fail('We couldn’t load the attached documents.', error);
  return {
    selfieUrl: await sign(request.selfie_path),
    documents: await Promise.all((docs ?? []).map(async (d) => ({ id: d.id, type: d.document_type, url: await sign(d.storage_path) }))),
  };
}

export async function reviewVerification(requestId: string, decision: 'approved' | 'rejected', notes: string): Promise<void> {
  const trimmed = notes.trim().slice(0, 2000);
  if (decision === 'rejected' && !trimmed) fail('Tell the seller why, so they can fix it and try again.');
  const { error } = await getSupabase().rpc('admin_review_verification', {
    p_request_id: requestId,
    p_decision: decision,
    ...(trimmed ? { p_notes: trimmed } : {}),
  });
  if (error) fail(/already been decided|own verification/i.test(error.message) ? error.message : 'We couldn’t save that decision.', error);
}

export function verificationSubjectLabel(r: VerificationRequest): string {
  const car = [r.vehicle_year, r.vehicle_make, r.vehicle_model, r.vehicle_variant].filter(Boolean).join(' ');
  if (r.subject === 'business') return r.business_name ?? 'Business';
  return (car || 'Vehicle') + (r.vehicle_business_name ? ` · ${r.vehicle_business_name}` : '');
}

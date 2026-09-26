/**
 * Legal settings shared by the Terms, Privacy and Cookie pages, sign-up and the
 * consent prompt.
 *
 * TERMS_VERSION must match private.current_terms_version() in the database
 * (migration 0016). Changing both asks every user to accept the new terms again.
 */
export const TERMS_VERSION = '2026-09-26';
export const TERMS_EFFECTIVE_DATE = '26 September 2026';

export const LEGAL_NAME = 'Caryandi';

/**
 * Where people send privacy requests and legal notices. Until it is set, the
 * pages point people to the Help page instead. Set it before launch.
 */
export const LEGAL_CONTACT_EMAIL: string | null = null;

/** The minimum age to use Caryandi. */
export const MINIMUM_AGE = 18;

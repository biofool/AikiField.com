<?php
declare(strict_types=1);

/**
 * Shared per-contact record writer (issue #91).
 *
 * Every enquiry route (coaching, security, community/studio) appends one
 * JSON line to data/contacts/submissions.jsonl holding source, lawful
 * basis, permission status and date — the fields the Pass 3 outreach
 * system needs. The directory is created at runtime (gitignored, same
 * convention as data/ratelimit/) and web access is denied via .htaccess.
 *
 * Recording must never break a submission: any failure is logged at
 * WARNING and swallowed.
 */

function af_record_contact(array $rec): void
{
    try {
        $dir = dirname(__DIR__) . '/data/contacts';
        if (!is_dir($dir)) {
            if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
                error_log('contact-record: cannot create data/contacts — contact record NOT written');
                return;
            }
            @file_put_contents($dir . '/.htaccess', "Require all denied\n");
        }
        $rec['recorded_at'] = gmdate('c');
        $line = json_encode($rec, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($line === false) {
            error_log('contact-record: json_encode failed — contact record NOT written');
            return;
        }
        $fh = @fopen($dir . '/submissions.jsonl', 'ab');
        if ($fh === false) {
            error_log('contact-record: cannot open submissions.jsonl — contact record NOT written');
            return;
        }
        flock($fh, LOCK_EX);
        fwrite($fh, $line . "\n");
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
        @chmod($dir . '/submissions.jsonl', 0600);
    } catch (Throwable $e) {
        error_log('contact-record: ' . $e->getMessage() . ' — contact record NOT written');
    }
}

/**
 * Build the standard record shape for an enquiry route.
 * permission_status: 'marketing-opt-in' | 'service-only' | 'none-recorded'
 * (legacy posts predating the consent checkboxes).
 */
function af_contact_record(string $source, string $name, string $email, string $organization,
                           bool $consentService, bool $consentMarketing,
                           array $extra = [], bool $legacy = false): array
{
    $permission = $legacy ? 'none-recorded'
        : ($consentMarketing ? 'marketing-opt-in' : 'service-only');
    return array_merge([
        'source'            => $source,
        'form_version'      => 'v2-per-audience-routes',
        'name'              => $name,
        'email'             => $email,
        'organization'      => $organization,
        'consent_service'   => $consentService,
        'consent_marketing' => $consentMarketing,
        'lawful_basis'      => [
            'service'   => $legacy ? 'legacy-form-no-consent-captured' : 'pre-contractual-enquiry',
            'marketing' => $consentMarketing ? 'consent' : 'not-given',
        ],
        'permission_status' => $permission,
    ], $extra);
}

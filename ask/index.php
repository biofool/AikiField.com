<?php
/**
 * Ask AikiField — public AEO knowledge layer router (issue #65).
 *
 * .htaccess maps /ask/* to this file; the path under /ask selects the
 * record or index hub to render. Public and indexable — sign-in is only
 * required for the /AEO/ review index.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/ask-lib.php';

ask_render_document(ask_parse_path());

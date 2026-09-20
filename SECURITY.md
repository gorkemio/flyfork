# Security reporting

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/gorkemio/flyfork/security/advisories/new), not a public issue. Görkem İnanç Özdemir / [gorkemio](https://github.com/gorkemio) monitors this project. Response and maintenance are best effort; there is no guaranteed response time or SLA. Do not send passwords, tokens, private keys or private experiment files.

Use [Issues](https://github.com/gorkemio/flyfork/issues) for ordinary bugs and suggestions. Check attachments for personal names, paths and experiment metadata; browser traces may include storage content.

FlyFork stores experiments in browser-local IndexedDB and exports. Imports have size/schema/buffer/integrity checks; hashes are not authentication. Library belongs to one browser/profile/origin. There is no account, cloud sync or remote record backup. The hosting platform/CDN may process normal connection and operational metadata; no promise of zero infrastructure logging is made.

This is an experimental preview with the [documented limits](docs/verification.md). Advisory checks cover known metadata at a stated date, not all possible vulnerabilities. PVR's actual enabled status is verified as part of publication and is recorded in the release validation summary.

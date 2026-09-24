# Security review and account reset — 2026-09-22

Scope: source review, npm dependency audit, isolated PostgreSQL/API/WebSocket integration tests, existing regression tests, and a browser UI check with mocked API responses. This is not an independent penetration test or a compliance certification.

## Findings addressed

- Guest identity previously depended on browser JWTs, without mandatory durable account records. Registration now atomically creates `accounts`, `account_profiles`, a session and an audit event. Account/profile names stay in sync; balances and admin flags cannot be written through profile APIs.
- Browser tokens previously lived in localStorage. New sessions use random 256-bit secrets in HttpOnly, Secure, SameSite=Lax cookies in production; the database stores only SHA-256 session-token hashes. Browser storage is cleared on application startup.
- Legacy JWTs are no longer accepted for API or Socket.IO authentication. Old account tables are retained as an archive, not reused for new registrations. Restart disconnects old sockets. Old audio tickets cannot be used with the new session-bound stream route.
- Logout revokes its database session and socket; password changes revoke all old sessions, issue a fresh cookie to the current browser, and disconnect old sockets. Password changes require the current password.
- Passwords use Node scrypt with a random salt, N=32768/r=8/p=3; hashing concurrency is capped at two. At the user's request, passwords only need to be nonempty; there is no minimum length, character-composition rule or password-specific maximum. The HTTP request body size limit still applies. This permits weak passwords and does not satisfy a strong-password policy. No password or raw session secret is returned or logged.
- CSRF checks require a custom request header and reject cross-origin mutations; allowed origins are explicit. WebSocket origin/session checks run before use and sessions are checked on events.
- Resetting listening data now requires an authenticated admin as well as the existing reset password. No account receives admin privileges automatically from its chosen name.
- Added CSP, HSTS in production, nosniff, frame protection and no-referrer headers. Database TLS certificate verification is enabled; startup fails if initialization fails.
- Updated dependencies. Both client and server npm audits reported zero advisories after updates, including development dependencies.

## Validation

- 74 backend regression tests passed; the database integration test is skipped locally when TEST_DATABASE_URL is absent.
- The integration test ran successfully against real PostgreSQL in a disposable schema: registration/profile creation, cookie flags, rejection of old JWTs, duplicate names, profile persistence, isolation, disallowed balance/admin writes, CSRF, logout, password/session revocation, Socket.IO authentication and admin enforcement.
- 7 client unit tests passed; production build passed.
- Headless Edge UI check passed using mocked APIs: registration, profile navigation, no announcement, admin button hidden for ordinary users, password dialog and desktop/mobile layout.
- Private backups of legacy account data and affected production files were created before deployment. Listening/catalog records were not reset.

## Remaining work / limits

- No independent penetration test or exhaustive OWASP ASVS assessment; do not describe the site as fully secure or certified.
- No MFA, breached-password screening or self-service account recovery yet. There is no email collection or email verification.
- Hosting-level DDoS controls, recurring backup retention and restoration drills need operational verification.
- Image uploads have size/type restrictions and are converted in the browser; server-side full decoding/re-encoding is a future hardening task.
- Login/session behavior on the public host still needs verification after the requested alwaysdata restart. No claim of completed production activation should be made before that.
- Ryuk and emgaimua register ordinary accounts first. Special public IDs and admin privileges must be assigned only after the owner confirms the corresponding new account IDs.

References: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

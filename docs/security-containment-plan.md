# Emergency RPC containment — review draft

Not executed or deployed. Live anon/authenticated execution is confirmed by the
user's inspection, not independently rechecked in this session. Exact live
signatures and function bodies were not supplied. No production connection made.

## Migration scope and exact signatures

Migration: `supabase/migrations/20261031090000_contain_privileged_rpc_execution.sql`.
Read-only pre/post inspection: `OMNINET_CONTAINMENT_VERIFY.sql`.

The migration resolves schema-qualified identity signatures from `pg_proc` using
`pg_get_function_identity_arguments`, then issues a separate GRANT/REVOKE for
each exact signature. This covers both reported create_block_autopause overloads
and additional overloads of the ten named functions in public. No argument types
are invented. Review the verification output before execution; literal live
signature approval is still outstanding. Functions in other schemas are reported
by verification but not changed by the migration.

It grants service_role EXECUTE, revokes PUBLIC/anon/authenticated EXECUTE, and
asserts effective denial for both untrusted roles. Missing functions/roles,
fewer than two create_block_autopause overloads, non-definer targets, missing
service schema access, or remaining inherited access abort the transaction.
Execution owners retain inherent privileges. This is not a claim that only
service_role and no administrative role can execute the functions.

No function bodies, RLS, schemas, role memberships, default privileges or public
claim function ACLs change. Future overloads are not automatically protected.

## Complete runtime call inventory

All paths below are relative to the repository root. Browser authentication
describes current UI behaviour, not an authorisation guarantee inside an RPC.

| Function | Calling file | Context and caller authentication | Service role | Effect of containment |
| --- | --- | --- | --- | --- |
| admin_delete_tag_cascade_by_uuid | src/app/api/admin/delete-tag/route.ts:130 | Server; verifies session and admin allowlist | Yes | Existing route continues |
| delete_tag_cascade | src/app/my/_client.tsx:72 | Browser; screen requires signin; no secure server wrapper | No | My Tags deletion stops working |
| create_block_autopause (overload selected by named arguments) | src/app/api/blocks/create/route.ts:204 | Server; no caller authentication/ownership check | Yes | RPC continues; unsafe HTTP route remains exposed |
| transition_payment_confirmed | src/app/api/stripe-webhook/route.ts:78 | Server; raw-body Stripe signature verified, no user session needed | Yes | Existing route continues |
| transition_checkout_created | src/app/api/create-checkout-session/route.ts:283 | Server; public checkout; checks claim/block/tag linkage and server price | Yes | Existing route continues |
| transition_checkout_created | src/app/api/checkout/create/route.ts:263 | Server; public checkout; checks block/tag and live status | Yes | Existing route continues |
| transition_action_claimed | src/app/api/availability/claim/route.ts:208 | Server; public guest claim, no user authentication | Yes | Existing route continues |
| transition_action_claimed | src/app/api/checkout/create/route.ts:175 | Server; public checkout, no user authentication | Yes | Existing route continues |
| transition_owner_acknowledged | src/app/api/availability/action-workflow/route.ts:124-129 | Server; verifies user and block ownership | Yes | Existing route continues |
| transition_owner_contacted | src/app/api/availability/action-workflow/route.ts:126-129 | Server; verifies user and block ownership | Yes | Existing route continues |
| transition_owner_closed | src/app/api/availability/action-workflow/route.ts:127-129 | Server; verifies user and block ownership | Yes | Existing route continues |
| confirm_availability_action | supabase/migrations/20260517124500_add_payment_confirmed_transition.sql:61 | Database nested call from SECURITY DEFINER transition_payment_confirmed; webhook is upstream caller | Effective function owner | Verify owner retains helper execution |

No other runtime source calls to the affected names were found, including Edge
Function sources. `api-blocks-create-route.txt:204` duplicates the block API call
as a text snapshot and is not an application entry point. Migration definitions
and inspection SQL mention names without invoking them. PL/pgSQL helpers and
triggers existing only in the live database remain outside repository coverage;
inspect their bodies manually before approval. Which create overload the HTTP
request selects cannot be proven without the live argument lists.

## Required application replacements (not implemented)

1. Owner deletion: add a dedicated authenticated server POST endpoint. Validate
   the tag ID, verify the session with getUser, load canonical messages ownership,
   require owner/business membership, then call delete_tag_cascade using a separate
   service client. Use the existing text messages ID, not the admin endpoint's
   unrelated tags UUID. Enforce same-origin/CSRF protection for cookie sessions,
   audit the action, return minimal errors, and update the My Tags button to call
   that endpoint. Check authorisation and deletion atomically in the eventual
   database hardening stage. Do not route ordinary owners through admin deletion.
2. Block creation: authenticate and authorise the target business before invoking
   the service RPC; add transactional database ownership enforcement separately.
   Until corrected, close the HTTP route using a separately reviewed containment
   action or keep external access disabled. RPC revocation alone cannot contain it.

## Public claim dependency review

claim_availability_block is deliberately excluded. Its body and any live wrappers
may call affected functions. Check SECURITY DEFINER owner privileges for nested
calls, or invoker privileges if SECURITY INVOKER. A public invoker wrapper calling
a revoked helper can break despite its own ACL being unchanged. If found, design
and review a constrained replacement first; do not apply this migration blindly.
The repository's main claim API uses a service client, but that does not establish
the dependencies of every live public RPC path.

## Verification and operational acceptance

Run the verification file manually before approval, review exact signatures and
inventory, then after execution expect each public target: anon_execute=false,
authenticated_execute=false, service_execute=true, public_execute_grant=false,
service_schema_usage=true. Schema USAGE for anon/authenticated can remain true;
it does not grant function EXECUTE. Investigate every FAIL or unexpected schema.

Static review targets PostgreSQL 14+ catalogs and PL/pgSQL. SQL has not been
executed, parsed by a live PostgreSQL server, or tested against production.
No application build is needed for new SQL/docs only.

In staging with synthetic records, verify authorised admin deletion, denial for
ordinary users, owner follow-up, guest claims, both checkout paths and signed
payment completion. Verify public direct calls fail, service paths work, nested
helpers work, and unrelated public claim ACLs are unchanged. My Tags deletion is
an intentional outage until its replacement is implemented. Review the live
deletion function's ownership checks before exposing its server wrapper.

Do not apply all earlier pending migrations as part of this emergency operation:
the local migration history is incomplete. Reconcile deployment history and
review an isolated application procedure first. Do not apply via an unreviewed
db push. Timeouts or permission assertions fail the entire transaction; correct
the cause and retry only after review. New concurrent function definitions must
be excluded operationally during the change, then all overloads rechecked.

## Rollback without reopening vulnerabilities

Capture pre-change signatures, owners and ACL metadata in restricted storage.
If the transaction fails, roll it back and review; no partial ACL change commits.
After commit, do not restore PUBLIC/anon/authenticated execution automatically.
Keep affected workflows unavailable if necessary; repair the server wrapper or
grant only the exact trusted execution role justified by reviewed dependencies.
Any permission adjustment is a separate approved migration. Do not restore the
whole database for an ACL-only incident, since that risks losing legitimate data.
If the migration fails, the original unsafe permissions remain: keep external
access restricted and treat containment as unsuccessful.

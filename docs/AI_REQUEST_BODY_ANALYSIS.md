# AI API Request Body – Alignment with Prompt

This document maps the **prompt input specification** (SECTION 2 in `prompt/CALL_TAGGING_SYSTEM_PROMPT_V5.md`) to the **request body** built in `src/services/openRouterClient.js` (`buildCallData`) and sent to the OpenRouter AI API.

---

## Prompt input spec (what the AI expects)

| Field | Type | Notes |
|-------|------|--------|
| **ringbaCallerId** | string | **REQUIRED** – copy exactly to output |
| **callerId** | string \| null | Consumer phone number |
| **transcript** | string | Timestamped transcript (`\n` = newlines); format `00:00 A - Text` or cleaned `Agent:` / `Customer:` |
| **hung_up** | "Caller" \| "Target" | Who ended the call |
| **duplicate** | boolean | System-detected duplicate (30-day window) |
| **billed** | boolean | Currently billed? |
| **revenue** | number | Current revenue amount |
| **callLengthInSeconds** | number | Call duration |
| **firstName** … **g_zip** | string \| null | Customer info (may be null/missing) |
| **targetName** | string \| null | Buyer/service provider name |
| **publisherName** | string \| null | Traffic source |

---

## Request body (what we send)

| Prompt field | Source in code | Status |
|--------------|----------------|--------|
| ringbaCallerId | `row.ringba_caller_id \|\| row.inboundCallId \|\| 'ROW_' + row.id` | ✅ Sent |
| callerId | `row.caller_phone ?? row.callerId ?? null` | ✅ Sent |
| transcript | `row.transcription \|\| row.transcript \|\| ''` | ✅ Sent |
| callLengthInSeconds | `row.duration \|\| row.callLengthInSeconds` (parsed as int) | ✅ Sent |
| revenue | `row.revenue` (parsed as float) | ✅ Sent |
| billed | `row.billed` if present, else inferred from `revenue > 0` | ✅ Sent |
| hung_up | `row.hung_up \|\| 'Unknown'` | ✅ Sent |
| duplicate | `row.isDuplicate === true` | ✅ Sent |
| firstName, lastName, address, street_*, city, state, g_zip | `row.* ?? null` | ✅ Sent |
| targetName | `row.targetName ?? null` | ✅ Sent |
| publisherName | `row.publisherName ?? null` | ✅ Sent |

All fields required by the prompt for a fully operational AI API are present in the request body.

---

## Data source (processor flow)

When using the **processor** (e.g. `manual-trigger.js` or scheduled job), rows come from **`fetchUnprocessedRows`** in `src/services/processor.js`, which selects from:

- **ringba_call_data** (r)
- **elocal_call_data** (e) – revenue as `elocal_payout`
- **campaigns** (c) – `ai_enabled = TRUE`

Selected columns include: `id`, `ringba_id` (as inboundCallId, ringba_caller_id), `transcript`, cleaned `transcription`, `duration`, `caller_id` (as caller_phone), `revenue`, `g_zip`, `hung_up`, `firstName`, `lastName`, address fields, **targetName**, **publisherName**, **billed**, `call_date`, etc.

So the row passed to `buildCallData(row)` has all of the above; `buildCallData` maps them into the prompt’s expected field names (including **callerId**, **targetName**, **publisherName**).

---

## Optional / edge cases

- **Transcript format:** Prompt examples use `00:00 A - Text`. We can send either raw timestamped transcript or the cleaned `Agent:` / `Customer:` version; both are valid. `fetchUnprocessedRows` sends the cleaned `transcription`; if raw `transcript` is preferred, the query can be changed to pass `row.transcript` instead of (or in addition to) `row.transcription`.
- **Missing row fields:** Any field not present on `row` is sent as `null` (or default), so the API still receives a complete payload and the prompt’s “may be null/missing” is respected.

# Lushin Engagement Pricing — Coach Intake App
## Design specification (for the design pass)

This is a brief for designing the **coach-facing intake app** only. It describes
what to design, the screens, every field, the rules, and the look. Pricing math,
the PDF report, and the emailing are handled by a separate backend and are
explicitly **out of scope for design** (see §9). Design should never surface any
price, rate, tier, or total anywhere.

---

## 1. What this app is

A single-purpose web app. A Lushin coach opens it, names a deal, fills in the
engagement details, and submits. On submit, the system emails a PDF pricing
summary to the coach and copies the Lushin leadership team. The coach sees only
a confirmation that the email is on its way — **never a price on screen.**

The point of the tool: leadership is automatically notified whenever a coach is
pricing a deal, so they can have the conversation, and the coach gets a clean
breakdown to use in a proposal.

## 2. Core principles (do not violate)

1. **No pricing is ever shown to the coach.** No totals, no per-line costs, no
   hourly rates, no tier tables, no "estimated price," no live preview, no
   running subtotal, no "cost so far" hints on any field. The coach enters facts
   and submits. Numbers exist only in the emailed PDF.
   - *Why:* if the coach can see the price forming, they may tweak inputs to hit
     a target number. Inputs must reflect the real engagement, not be reverse-
     engineered from a desired price.
2. **The tool is an intake form, not a calculator.** Design it like a clean form
   / request flow, not a dashboard with results.
3. **Submitting is the only way to get output.** There is no "calculate" or
   "preview" button — only "Send pricing summary."
4. **Low friction, professional, on-brand.** A coach should be able to complete
   it in a couple of minutes and trust it.

## 3. User and context

- **User:** a Lushin coach, on a laptop most often, sometimes a tablet. Not
  highly technical. May be filling this in right after or during a prospect
  conversation.
- **Frequency:** occasional, per deal. Not a daily tool.
- **Tone:** confident, clear, Lushin-professional.

## 4. Screens to design

Design these states:

1. **Intake form** — the main screen (see §5 for all fields).
2. **Submitting** — a brief in-progress state after the coach hits send (button
   shows progress / disabled).
3. **Confirmation ("Check your email")** — success screen after submit.
4. **Validation / error** — inline field errors, plus a general error state if
   the send fails.

## 5. Field inventory

Group the form into the four sections below, in this order. Optional sections
should be clearly marked optional and visually lighter so the coach knows they
can skip them.

### Section A — Deal (required)
| Field | Type | Required | Notes / helper text |
|---|---|---|---|
| Deal name | text | **Yes** | The headline field. e.g. "Acme Manufacturing — Q3 team training." |
| Prospect / client company | text | No | If different from the deal name. |
| Your name | text | **Yes** | The coach. |
| Your email | email | **Yes** | Where the summary is sent; leadership is copied. Validate format. |
| Context / notes | multiline text | No | Anything leadership should know going in. |

### Section B — Engagement (required)
1 session = 1 hour. These are the engagement structure.
| Field | Type | Range / default | Notes |
|---|---|---|---|
| Learners | number | 1–200, default 10 | Total participants in the cohort. |
| Team sessions / year | number | 0–48, default 12 | Total team meetings per year. |
| …of which AOR-led | number | 0 – (team sessions) | Led by the AOR instead of the trainer; rest are trainer-led. Must not exceed team sessions. |
| Leader sessions / year | number | 0–24, default 12 | AOR-led leadership meetings. |
| Leadership coaching sessions / year | number | 0–24, default 0 | Leadership coaching. |
| Trainer experience | number (years) | 1–20, default 2 | Years of experience. Do **not** show a rate. |
| Associate of Record experience | number (years) | 1–20, default 10 | Years of experience. Do **not** show a rate. |
| Travel hours / year | number | 0–80, default 0 | Billable travel time, door-to-door. |
| Travel rate ($/hr) | number | default 500 | The one dollar figure the coach sets (an input, not a result). |

### Section C — Prospect economics (optional)
Used to add an investment-framing section to the PDF. If left blank, that
section is simply omitted. Make this section visibly optional.
| Field | Type | Notes |
|---|---|---|
| Current annual revenue ($) | number | |
| Gross profit margin (%) | number | 0–100 |
| Dollarized impact of problems / year ($) | number | |
| Avg lifetime value of one client ($) | number | |
| Avg sales cycle (months) | number | |

### Section D — OMG assessment (optional)
| Field | Type | Notes |
|---|---|---|
| Number of overviews | number | default 0 |
| Number of participants | number | default 0 |

## 6. Validation rules

- Required fields: Deal name, Your name, Your email (must be a valid email).
- "…of which AOR-led" cannot exceed "Team sessions / year" — show a clear inline
  message if it does.
- All numbers are non-negative and within the ranges above.
- Optional sections (C, D) may be left entirely blank.
- Validate on submit; highlight the first problem and scroll/focus to it.

## 7. Behavior and flow

1. Coach fills in the form. **Nothing calculates or previews.**
2. Coach clicks **Send pricing summary** (primary button).
3. Show the submitting state (button disabled + progress label).
4. On success → **Confirmation** screen: tell the coach the summary for
   "[Deal name]" is on its way to their email, and that leadership has been
   copied. Offer a "Price another deal" action that resets the form.
5. On failure → a friendly error with a retry, without losing entered data.

Suggested copy (adjust to brand voice):
- Page title: "Engagement pricing request"
- Primary button: "Send pricing summary"
- Confirmation headline: "Check your email"
- Confirmation body: "Your pricing summary for [Deal name] is on its way to
  [email]. The Lushin leadership team has been copied so we can review it with
  you."

## 8. Visual direction

Brand standards (colors, type, logos, buttons) are already loaded in Design —
apply them. The only layout notes specific to this tool:
- Treat it as a clean, form-first intake, not a dashboard.
- Header bar with the tool title; white form area below; clear section dividers.
- Comfortable on laptop; two-column field grid on wide screens, collapsing to
  single column on tablet/narrow.
- Mark the optional sections (C, D) as visually lighter than the required ones.

## 9. Out of scope for design (handled by the backend — do not build or show)

- The pricing engine: hourly floor, per-learner tiers, the "greater of floor vs.
  per-learner fee" logic, the 100+ flat rate, Yoodli/materials, the 5% Sandler
  online add-on. **None of this is visible in the UI.**
- Internal metrics (leverage index, trainer $/hour). Internal only; never in the
  coach app.
- Generating the PDF report.
- Sending email and copying leadership (the leadership recipient list lives
  server-side).

The design only needs the intake form + the confirmation/error states. The
form's job is to collect the inputs in §5 and POST them; everything numeric
happens after submit, off-screen.

## 10. Accessibility & responsive

- Every field has a visible label and a clear required indicator.
- Visible keyboard focus states (use Fresh cyan).
- Sufficient color contrast (brand navy/white pass; keep helper text legible).
- Works from ~360px wide up to desktop; no horizontal scrolling.

---

### One-paragraph brief (paste into the design tool)

> Design a clean, Lushin-branded web intake form called "Engagement pricing
> request." A coach names a deal and fills in engagement details, then submits;
> on submit they see only a "Check your email" confirmation — the app must never
> display any price, rate, tier, or total (so inputs can't be gamed toward a
> number). Four sections: Deal (deal name, client company, coach name, coach
> email, notes), Engagement (learners, team sessions, AOR-led sessions, leader
> sessions, coaching sessions, trainer years, AOR years, travel hours, travel
> rate), optional Prospect economics (revenue, GP margin, problem impact, client
> LTV, sales cycle), and optional OMG (overviews, participants). Apply the
> loaded Lushin brand standards; form-first layout, responsive to tablet. Also
> design the submitting, confirmation, and inline-error states.

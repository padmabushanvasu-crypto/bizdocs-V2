# Business Discovery Questionnaire

Record every answer with who said it and when. Unanswered = `Q-###` in REQUIREMENTS-REGISTER. **★ = must be answered before development (G-01).**

## A. Company and organisation
1. Legal entities, plants, warehouses, stores; which share stock?
2. Departments, heads, number of users per department; shifts.
3. ★ Who decides process disputes between departments?
4. Existing software (accounting, spreadsheets, legacy ERP); what must integrate?

## B. Products and items
1. ★ Item classes (raw material, bought-out, component, sub-assembly, finished good, consumable, tool, asset, service).
2. ★ Item codes: format, who creates, duplicates today? Drawing numbers and revisions?
3. ★ Units: primary unit per class; alternate units; is conversion fixed, variable per lot, or recorded after the fact?
4. ★ Batch/lot/serial: which items, at which stage, why (customer, warranty, regulation)?
5. BOMs: levels, alternates, revisions, who maintains?
6. Routes: operations, internal vs subcontracted, order fixed or variable?

## C. Procurement
1. PO approval: who, thresholds, re-approval on edit?
2. Partial deliveries, over-delivery tolerance, short-closing.
3. ★ Receiving: inward check, quality inspection, store placement — separate people/steps? When is material usable?
4. ★ Rejections: hold, return to vendor, rework at our cost, scrap — who decides, when written off?
5. Vendor invoices vs receipts (3-way match?).

## D. Subcontracting / job work
1. ★ What goes out, to whom, for which operations; one or many operations per trip?
2. ★ Does the item change identity at the processor (A out, B back; 3 parts out, 1 assembly back)?
3. Partial returns, rejects at return, rework loops, tools/jigs sent along.
4. Processor charges: estimate vs invoice.

## E. Production
1. ★ Make-to-stock / make-to-order / assemble-to-order?
2. ★ Work orders: who raises, how material is issued (full kit, partial, backflush), can stock go negative?
3. Output recording, scrap, rework, by-products.
4. ★ When is a part "finished" and allowed into assembly?
5. Capacity/planning needs (now vs later).

## F. Inventory
1. ★ Locations/bins; physical count practice (annual, cycle); who approves adjustments?
2. ★ Opening balances: source, date, who counts?
3. Reservations / allocation to orders?
4. Valuation method and who uses it.

## G. Sales and dispatch
1. ★ Which event takes goods out of stock: dispatch, invoice, delivery?
2. Customer orders, partial dispatch, returns, replacements.
3. Documents required (invoice, delivery note, test certificates, e-way bill).

## H. Finance
1. ★ Accounting boundary: which system is the book of record?
2. Taxes, rounding rules, currencies, payment terms.
3. Period close: monthly? who closes? backdating allowed how far?

## I. Quality
Inspection plans, measurements, certificates, NC handling, customer complaints.

## J. Users, roles, approvals
1. ★ Roles and what each may see (prices/costs?) and do.
2. ★ Separation of duties required?
3. Mobile/shop-floor devices; languages; literacy and training constraints.

## K. Exceptions (ask for real recent examples of each)
Edit after issue · cancel after partial receipt · wrong item received · wrong unit · duplicate entry · backdated entry · material moved without paperwork · urgent dispatch before QC.

## L. Reporting
Top 10 reports used today, who reads them, how often, decisions they drive.

## M. Data and volumes
Items, parties, documents per month per type, lines per document, history to migrate, growth.

## N. Non-functional
Working hours, acceptable downtime, internet reliability, RPO/RTO, backup expectations, data residency, audit needs.

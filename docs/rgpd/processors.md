# Third-party and processor registry — softn.io

> Maintained by the `security` agent and updated whenever a third party is added. "To verify" cells must be filled in from each vendor's official documents (DPA, privacy policy, compliance page). This registry is not legal advice.

**Why**: every recipient of personal data must appear in the privacy policy, wherever it is hosted. Hosting outside the EU/EEA adds the obligation to mention the transfer and the safeguard covering it (adequacy decision, including the Data Privacy Framework for certified companies, or standard contractual clauses).

| Third party                                     | Role                           | Data concerned                                                   | Loaded when                                                               | Hosting                                                                        | DPA signed or accepted                              | Transfer safeguard outside EU         | Mentioned in privacy policy |
| ----------------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------- | --------------------------- |
| Baserow (Baserow B.V., Amsterdam, KvK 81129254) | Lead storage                   | Name, email, message, slot, consent; coming-soon waitlist e-mail | Server-side send, after consent; server-side send on waitlist form submit | Baserow Cloud, Germany (EU); company in the Netherlands                        | DPA Offered, incorporated by reference in the terms | None needed (EU processor, EU hosting | To do                       |
| Mistral AI                                      | LLM answer generation          | Visitor questions and current conversation history; no account   | Server-side on each assistant question, before any personal data is requested | EU regional API (`api.eu.mistral.ai`); inference in data centres in EU and EFTA countries | To verify                                           | To verify                             | Yes                         |
| Fillout/Zite                                    | Booking (embed + webhook)      | Name, email, slot                                                | Chatbot booking step, after consent                                       | To verify (US by default per the API docs; EU region tied to Enterprise plans) | To verify                                           | To verify                             | To do                       |
| Google Calendar                                 | Booking calendar (via Fillout) | Slot, invitee email                                              | Via Fillout                                                               | To verify                                                                      | To verify                                           | To verify                             | To do                       |
| Vercel                                          | Site hosting, logs             | IP address, technical logs                                       | Every visit                                                               | To verify                                                                      | To verify                                           | To verify                             | To do                       |
| Umami                                           | Audience measurement           | Browsing statistics (cookieless by default)                      | After consent                                                             | To verify (Cloud or self-hosted)                                               | To verify                                           | To verify                             | To do                       |

## Retention periods (to decide)

| Data | Proposed period | Decided |
|---|---|---|
| Lead without follow-up | To define | No |
| Lead who became a client | To define | No |
| Hosting logs | To define | No |

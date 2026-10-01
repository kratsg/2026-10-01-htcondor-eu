# Agents Need Context, Not Just Models

*UH Physics & Astronomy AI "rap session" on AI agents for HEP data analysis · 2026-09-24 ·
Giordon Stark (University of Chicago) · three slides, informal discussion*

Event page: <https://indico.phys.hawaii.edu/event/2985/>

LLM agents are already useful for HEP analysis, but the limiting factor is rarely the model.
The model and the harness are interchangeable and churn monthly; what makes an agent useful,
and safe to trust, is reliable, secure access to the tools, data, and domain knowledge a
facility already has. Using the MCP Platform and MCP servers running in production on the
UChicago ATLAS Analysis Facility, these slides cover three things: where the durable work is
(facility context, not models), how one gateway fronts many MCP servers, and how to think
about security (structural, not behavioral) alongside the tool design that makes agents
actually work. Interoperable tool interfaces are likely to matter more than model-specific
integrations.

Drawn from: the Nikhef colloquium (2026-07-01) and "Model Context Protocol for Scientific
Software" (PyHEP.dev 2026, 2026-09-07).

# The Facility Is the Context: Building an MCP Platform for Scientific Computing

*HTCondor Workshop Autumn 2026 · CC-IN2P3, Lyon · session "Condor and AI" · 2026-10-01 09:45 ·
20 min (incl. live demo) · Giordon Stark (University of Chicago)*

Contribution page: <https://indico.cern.ch/event/1659396/contributions/7273024/>

Large language model agents are becoming useful for software development and scientific
analysis, but making them useful on shared computing infrastructure requires more than the
model itself. Agents need reliable access to the software, data, workflows, and identities
that researchers already use.

This talk introduces the Model Context Protocol (MCP) as a practical interface between AI
agents and scientific software. I will briefly discuss how MCP can expose existing Python
libraries, databases, experiment services, Jupyter environments, and batch systems, and then
show how these pieces come together in an MCP platform developed for the UChicago Analysis
Facility.

The platform provides a common gateway for MCP services while handling authentication,
authorization, and credential brokering separately from the individual services. This allows
agents to work with resources such as Rucio, Jupyter, filesystems, and HTCondor without
directly handling users' long-lived credentials.

Using examples from the ATLAS Analysis Facility and work extending this approach across
experiments, I will discuss what works today, the infrastructure challenges that remain, and
what an MCP-based approach could mean for making agentic computing portable across scientific
facilities.

Drawn from: the Nikhef colloquium (2026-07-01), "Model Context Protocol for Scientific
Software" (PyHEP.dev 2026, 2026-09-07), and the UH AI rap session (2026-09-24).

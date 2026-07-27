# AikiField Project Portfolio — Technical Marketing Summary

> **One-line positioning:** A portfolio of 29 active projects spanning NGO
> field-data collection, multi-cloud cost control, cloud-based OSInt,
> media processing, wellness websites, security tooling, system
> administration, and content processing — built and operated by
> a single developer across the `biofool` GitHub account and the
> `DaanMatch` organization.

<!-- exec-summary: begin -->
This document categorizes and summarizes the 29 active (non-placeholder)
repositories in the biofool / DaanMatch project portfolio. Each category
groups repos by domain, with a one-line description of what each project
does. This serves as a technical marketing overview of the entire portfolio
for stakeholders, collaborators, and self-reference.
<!-- exec-summary: end -->

---

## 1. DaanMatch / NGO Field Platform

Field-data-collection platform for NGO workers in rural India — offline-first
mobile capture, geo-tagged media, biometric auth, and a Flask backend.

| Repo | What it does |
|------|-------------|
| **DaanMatch/FieldWorker** | Flask backend for NGO field updates with GPS, biometric auth, admin panel |
| **DaanMatch/FieldAppAndroid** | Offline-first Android client that syncs to FieldWorker |
| **PHP_DL** | PHP/SQLite DataLogger for NGO field worker registration & login |

**Portfolio value:** Replaces paper-based field workflows with durable
digital data collection in disconnected environments, giving program
managers verifiable, location-stamped evidence of field activity.

---

## 2. Cloud Cost & Infrastructure Management

Centralized cost control, resource inventory, and secrets management across
a multi-cloud portfolio (GCP, OpenStack, Cloudflare).

| Repo | What it does |
|------|-------------|
| **CloudManagement** | Central cloud inventory + kill switch across the biofool portfolio |
| **MultiCloud-MultiPass** (open source version of CloudManagement 2026-07) | Multi-cloud cost kill switch with intent/actual reporting (GCP, OpenStack, Cloudflare) |
| **VaultsshCA** | Vault SSH Certificate Authority initialization scripts |

**Portfolio value:** Maximizes free-tier usage across multiple cloud
providers, stops runaway spend in seconds (not days), and manages SSH
certificate-based access — keeping a small team's cloud costs minimal
without sacrificing control.

---

## 3. Cloud Based OSInt

Automated discovery and verification of business contact information for
outreach campaigns, using Google Places API, Playwright browser automation,
and multi-source API routing.

| Repo | What it does |
|------|-------------|
| **WorldStudioFinder** | Studio finder with multi-source API routing (Google Places, OpenCage) |

**Portfolio value:** Builds comprehensive, verified contact lists for
movement-arts studio outreach across multiple countries — with free-tier
optimization, multi-language support, and Google Sheets as the
collaborative source of truth.

---

## 4. Media & Video Processing

Tools for downloading, converting, tracking, and managing video and media
content.

| Repo | What it does |
|------|-------------|
| **MotionTracker** | OpenCV frame-differencing + YOLO motion tracking; YouTube download & clip extraction |
| **VidConverter** | ffmpeg-based video crop/scale/encode for martial arts technique videos |
| **PlayListDownloader** | YouTube playlist bulk downloader (Data API + pytube) |
| **Pano2Movie** | Converts panoramic photos into panning movies (ffmpeg + ImageMagick) |
| **ClipQuotes** | Quote extraction and processing pipeline |

**Portfolio value:** Automates video content production workflows — from
raw footage cropping and motion tracking to playlist archiving and YouTube
channel management.

---

## 5. Quantum Aikido / Wellness Websites

Web properties for the Quantum Aikido ecosystem — book promotion, coaching
platform, and wellness consulting.

| Repo | What it does |
|------|-------------|
| **AIRichardMoon** | FastAPI backend for Quantum Aikido coaching system (auth, invitations, mail) |
| **quantumaikido.com** | Quantum Aikido website (PHP, members portal, coach dashboard) |
| **AikiField.com** | Presence-based leadership consulting website |
| **neurowellnessdojo.com** | Neuro wellness dojo website |

**Portfolio value:** A complete digital presence for the Quantum Aikido
brand — book marketing, coaching platform with auth and email, and
leadership consulting — with a shared auth flow spanning frontend and
backend repos.

---

## 6. Security & Threat Intelligence

Tools for password hygiene, domain reputation, SSH key management, and
allowlist-based validation.

| Repo | What it does |
|------|-------------|
| **PasswordFilter** | Flask password hygiene service checking against 1M compromised credentials |
| **vtapi** | VirusTotal API client for domain reputation & file scan reports |
| **1password** | Bash script to sync SSH keys from 1Password to ~/.ssh |
| **OARTAL** | Allowlist-based username/password validation concept with chaff privacy |

**Portfolio value:** Defensive security tooling — password compromise
checking, domain threat intelligence, SSH key synchronization, and
privacy-preserving credential validation.

---

## 7. System Administration & OS Analysis

Linux system analysis, bloat detection, networking scripts, and ffmpeg
processing utilities.

| Repo | What it does |
|------|-------------|
| **UnUsedOS** | Identifies unused files/packages on SCS Linux appliances via access timestamps |

**Portfolio value:** Reduces OS image bloat and attack surface through
data-driven file/package usage analysis, plus practical networking and
media processing scripts for daily operations.

---

## 8. Text & Content Processing

Tools for spell-checking captions, converting documents, generating word
clouds, and extracting quotes.

| Repo | What it does |
|------|-------------|
| **closedcaption_spellchecker** | Bulk-corrects YouTube auto-captions with specialized terminology dictionary |

**Portfolio value:** Automates content transformation workflows — from
caption correction to document conversion to quote extraction — reducing
manual text processing effort.

---

## 9. Web Apps & Legacy Projects

Standalone web apps and earlier versions of projects that have since
evolved.

| Repo | What it does |
|------|-------------|
| **GPS-PWA** | Footfall tracking PWA (geolocation + Leaflet.js + service worker) |
| **PHP** | React Native app scaffold with Vagrant |
| **BeBold** | Browser-based bold-text extractor → Slick Carousel slide show |
| **Egbert** | Roll smoothness analyzer (device sensors) + Tetris + mind map |

**Portfolio value:** Experimental and legacy projects that informed later
work — from PWA prototypes to content extraction tools that evolved into
the current scraping pipeline.

---

## 10. Templates & Concepts

Project templates and conceptual projects that define conventions or
explore ideas.

| Repo | What it does |
|------|-------------|
| **starter** | biofool project template with Claude Code + Devin CLI config |
| **biofool.github.io** | GitHub Pages site: QR Code Generator (8 languages) + TDN concept |
| **TDN** | Truthiness Discovery Network — media provenance ledger concept (C) |

**Portfolio value:** The `starter` template enforces cross-project
conventions (AGENTS.md, CLAUDE.md, skills, cloud-strategy coordination)
across the entire portfolio, while TDN explores decentralized media
provenance.

---

## Summary

| Category | Repos | Primary Domain |
|----------|-------|----------------|
| DaanMatch / NGO Field Platform | 3 | Field data collection for rural India |
| Cloud Cost & Infrastructure Management | 3 | Multi-cloud cost control & secrets |
| Cloud Based OSInt | 1 | Studio discovery & contact verification |
| Media & Video Processing | 5 | Video download, conversion, tracking |
| Quantum Aikido / Wellness Websites | 4 | Book marketing, coaching, consulting |
| Security & Threat Intelligence | 4 | Defensive security tooling |
| System Administration & OS Analysis | 1 | Linux bloat detection & networking |
| Text & Content Processing | 1 | Caption correction, document conversion |
| Web Apps & Legacy Projects | 4 | Experimental & predecessor projects |
| Templates & Concepts | 3 | Project template & conceptual work |
| **Total** | **29** | |

*Placeholder/empty repos and dropped repos are excluded from this summary.*

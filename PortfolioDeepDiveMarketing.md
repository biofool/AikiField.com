# biofool Project Portfolio — Deep Dive Marketing Briefs

> Detailed, jargon-free marketing briefs for each of the 29 active
> repositories in the biofool / DaanMatch portfolio. Written for
> non-technical business audiences — stakeholders, collaborators,
> investors, and clients.

<!-- exec-summary: begin -->
This document provides a detailed marketing brief for every active project
in the biofool portfolio. Each brief explains what the project is, who it
serves, the problem it solves, how it works in plain English, its key
benefits, and why it matters strategically. Together, these briefs tell the
story of a versatile technologist who builds practical tools across NGO
field work, cloud cost management, security, media production, wellness
websites, and more — all optimized for a small team operating on free-tier
cloud budgets.
<!-- exec-summary: end -->

---

## Table of Contents

1. [DaanMatch / NGO Field Platform](#1-daanmatch--ngo-field-platform)
2. [Cloud Cost & Infrastructure Management](#2-cloud-cost--infrastructure-management)
3. [Cloud Based OSInt](#3-cloud-based-osint)
4. [Media & Video Processing](#4-media--video-processing)
5. [Quantum Aikido / Wellness Websites](#5-quantum-aikido--wellness-websites)
6. [Security & Threat Intelligence](#6-security--threat-intelligence)
7. [System Administration & OS Analysis](#7-system-administration--os-analysis)
8. [Text & Content Processing](#8-text--content-processing)
9. [Web Apps & Legacy Projects](#9-web-apps--legacy-projects)
10. [Templates & Concepts](#10-templates--concepts)

---

## 1. DaanMatch / NGO Field Platform

*Field-data-collection platform for NGO workers in rural India — offline-first mobile capture, geo-tagged media, biometric auth, and a web backend.*

### DaanMatch/FieldWorker

**What it is**
A web-based server system that lets nonprofit field workers in rural India record their work with photos and location information, then upload it to a central database where managers can review and verify the activity.

**Who it's for**
- Nonprofit field workers who visit villages and need to document their work
- Field supervisors and program managers who need to verify that work actually happened
- Nonprofit administrators who manage user accounts and oversee the system
- Technology staff who operate the server infrastructure

**The problem it solves**
Field workers in rural India often rely on paper forms and handwritten notes to record their activities. This leads to lost paperwork, transcription errors, and no way to verify that workers actually visited the locations they claim to have visited. Managers have no reliable way to prove to donors or auditors that field work occurred.

**How it works**
Field workers log into a website (or use a companion Android app) to create activity reports. They write a description, attach photos as evidence, and submit the report. The system automatically extracts location data from the photos to prove where the worker was. Managers can log into an admin panel to review all submissions, see the location stamps, and manage user accounts. The system runs on a single computer server, keeping costs low for resource-constrained nonprofits.

**Key benefits**
- **Verifiable proof of work**: Every report includes location data from photos, giving managers evidence that field visits actually happened
- **Affordable to operate**: Runs on a single inexpensive server instead of expensive cloud services, making it viable for nonprofits with limited budgets
- **Works in rural areas**: The companion Android app can work without internet connection and syncs automatically when connectivity returns
- **Secure access**: Only authorized workers can register using special codes, and the system includes photo and voice verification to prevent unauthorized use
- **Easy to manage**: Administrators have a simple panel to add users, review reports, and moderate content
- **Supports multiple languages**: Field workers can use the system in 11 different Indian languages

**Why it matters**
This system replaces unreliable paper-based workflows with digital documentation that nonprofits can trust. It gives donors and auditors verifiable evidence that programs are actually delivering services in the field. The low-cost design makes it accessible to small nonprofits that couldn't afford expensive enterprise software, extending the benefits of digital accountability to organizations serving rural communities.

---

### DaanMatch/FieldAppAndroid

**What it is**
A mobile phone application for nonprofit field workers that lets them record their work with photos, audio, and location tracking even when they have no internet connection, then automatically sends the data to a central system when connectivity returns.

**Who it's for**
- Field workers who travel to rural villages and need to document their visits
- Field supervisors who need to track where their teams go and verify work completion
- Nonprofit technology staff who deploy and manage mobile applications
- Field workers who speak regional Indian languages and need an app in their native tongue

**The problem it solves**
Rural areas in India often have poor or no cellular internet coverage. Field workers using web-based systems can't submit reports while in the field, leading to delays, forgotten data, and lost information. Additionally, many field workers use low-cost smartphones and speak regional languages, so apps must work on basic devices and support multiple languages.

**How it works**
Workers install the app on their Android phone. They can create activity reports, take photos, record audio notes, and track their location throughout the day — all without needing internet. The app stores everything on the phone. When the worker returns to an area with internet coverage, the app automatically sends all the stored data to the central server. The app also runs in the background to track the worker's route, providing a complete record of their movements. Workers can switch the app to any of 11 Indian languages.

**Key benefits**
- **Works offline**: Field workers can record data all day without internet, eliminating gaps in documentation
- **Automatic syncing**: No need to remember to upload data — the app handles it automatically when connectivity returns
- **Location tracking**: Records the worker's route throughout the day, giving supervisors proof of field visits
- **Runs on basic phones**: Designed to work on affordable smartphones common in rural areas
- **Multi-language support**: Available in 11 Indian languages, reducing training barriers
- **Secure**: Uses photo and voice verification to ensure the registered worker is the one using the device
- **Battery-efficient**: Designed to minimize battery drain during all-day location tracking

**Why it matters**
This app enables reliable data collection in the most remote areas where internet is unreliable or unavailable. By working offline and syncing automatically, it ensures that no field data is ever lost due to connectivity issues. The multi-language support and low-device requirements make it accessible to field workers across diverse regions of India, democratizing access to professional-grade data collection tools for grassroots nonprofits.

---

### PHP_DL

**What it is**
A simple web-based registration and login system for nonprofit field workers, capturing their name, contact details, organization, and local government area — the predecessor to the FieldWorker platform.

**Who it's for**
- Nonprofit field workers who need to register with the DaanMatch platform
- Field coordinators who need a lightweight system to track who is enrolled
- Small nonprofits that need a no-cost, no-setup user registration system

**The problem it solves**
Before building a full-featured field data collection platform, nonprofits need a basic way to register and authenticate field workers. Setting up a complex database server is expensive and requires technical expertise. Small nonprofits need something that works immediately with zero configuration — just upload the files and start registering users.

**How it works**
A field worker visits a web page and fills out a registration form with their username, email, phone number, NGO name, local government area (gram panchayat), and an optional registration code. The system stores this information in a lightweight database file that requires no separate database server. When the worker returns, they log in with their username and password. The system verifies the password securely and shows them a welcome page. Administrators can view all registered users in a simple table.

**Key benefits**
- **Zero setup database**: Uses a file-based database that requires no separate server software — just upload and run
- **Captures NGO-specific information**: Records the worker's organization and local government area, not just name and email
- **Secure password handling**: Passwords are scrambled before storage, protecting user credentials even if the database is compromised
- **Responsive design**: Works on phones, tablets, and desktops using a standard design framework
- **Development environment included**: Comes with a pre-configured virtual machine for easy development and testing

**Why it matters**
This project represents the foundational layer of the DaanMatch platform — the first step in moving from paper-based to digital field worker management. It demonstrates an understanding that nonprofits need to start simple: before you can collect field data, you need to know who your field workers are. The zero-cost, zero-setup approach makes it accessible to the smallest organizations, and it evolved into the full FieldWorker system as needs grew.

---

## 2. Cloud Cost & Infrastructure Management

*Centralized cost control, resource inventory, and secrets management across a multi-cloud portfolio (GCP, OpenStack, Cloudflare).*

### CloudManagement

**What it is**
A central control center that keeps track of all cloud computing resources across an entire portfolio of projects and automatically stops unexpected spending before it becomes a problem.

**Who it's for**
- Small teams of developers who manage multiple cloud accounts across different providers
- Project portfolio operators who need visibility across many different cloud projects
- Cost-conscious developers who rely on free service tiers and need guardrails against surprise charges

**The problem it solves**
When a team manages many cloud projects across different providers (Google Cloud, OpenStack, Cloudflare, etc.), it's easy to lose track of where money is being spent. A single runaway program can generate a large bill before anyone notices. Cloud billing reports often lag by 24-48 hours, so by the time you see a problem, you've already paid for it. Additionally, free service tiers are valuable but complex — each provider has different limits that reset on different schedules, making it hard to maximize free usage without accidentally going over.

**How it works**
CloudManagement acts as a central hub that watches every cloud account in a portfolio. It maintains a master list of all projects, services, and jobs. The system has three ways to detect and stop problems:

1. **Per-job monitoring**: Before any program makes calls to paid services, it tells CloudManagement what it expects to do. Afterward, it reports what actually happened. If the actual usage exceeds what was promised, CloudManagement can stop just that specific job within seconds.
2. **Per-project monitoring**: Every few minutes, CloudManagement checks each project's usage rates. If it sees a sudden spike or a quota being exceeded, it can stop all services in that project.
3. **Per-billing-account monitoring**: As a last resort, if spending crosses a budget threshold, CloudManagement can completely disconnect billing from a project to prevent any further charges.

The system also tracks free-tier limits across all providers in real-time, showing a dashboard of how much free capacity remains for each service. This helps teams route workloads to the provider with available free capacity.

**Key benefits**
- **One dashboard for everything**: See all cloud resources across all providers in one place instead of logging into multiple consoles
- **Stop spending in minutes, not days**: Real-time monitoring catches runaway programs before billing reports would show the problem
- **Accountability per job**: Every program must declare what it will do before it does it, making cost overruns visible immediately
- **Maximize free tiers**: Know exactly how much free capacity remains per service per account, and route workloads accordingly
- **Audit trail**: Every action, declaration, and cost report is logged for review later
- **Works across providers**: Handles Google Cloud, OpenStack, Cloudflare, and third-party APIs through a unified system

**Why it matters**
CloudManagement is the strategic foundation for the entire biofool portfolio. It defines where data should be stored and where jobs should run based on cost and free-tier optimization. Every other project in the portfolio references CloudManagement's inventory and policies. This prevents the portfolio from fragmenting into disconnected cloud silos with uncontrolled costs. It enables a small team to operate like a larger organization with centralized cloud governance, while still allowing individual developers to work independently.

---

### MultiCloud-MultiPass

**What it is**
The open-source version of CloudManagement, released in July 2026 — a multi-cloud cost control system that monitors spending across Google Cloud, OpenStack, and Cloudflare, with an emergency shut-off that stops runaway costs in seconds.

**Who it's for**
- Independent developers and small teams who use multiple cloud providers and want to keep costs near zero
- Open-source contributors who want to build on or adapt a multi-cloud cost management system
- DevOps teams who need a provider-agnostic way to monitor and control cloud spending

**The problem it solves**
Most cloud cost management tools work with only one provider (usually AWS) and rely on billing reports that are 24-48 hours old. A small team using free tiers across Google Cloud, OpenStack, and Cloudflare has no single view of spending, no way to catch runaway programs in real time, and no unified emergency shut-off. Commercial tools are expensive and designed for large enterprises, not solo developers trying to stay within free-tier limits.

**How it works**
Each project in the portfolio registers with MultiCloud-MultiPass and declares what it expects to do before making any paid API calls. After the calls, it reports what actually happened. If actual usage exceeds the declared expectation by more than 20%, the system can stop that specific job within seconds — before any charges accrue. Every 5 minutes, the system also polls each project's quota usage directly. If a quota is exceeded or usage spikes unexpectedly, it can pause all services in that project. As a last resort, if spending crosses a budget threshold, it can disconnect billing entirely. The system maintains a real-time dashboard showing free-tier consumption across all providers and accounts.

**Key benefits**
- **Provider-agnostic**: Works with Google Cloud, OpenStack, Cloudflare, and any third-party API — not locked to one provider
- **Real-time cost control**: Catches runaway programs in seconds, not the 24-48 hours that billing reports lag
- **Free-tier optimization**: Tracks how much free capacity remains per API per account, and automatically routes work to providers with available free capacity
- **Three-tier escalation**: Per-job (seconds), per-project (minutes), per-billing-account (hours) — stops problems at the right level
- **Open source**: Freely available for adaptation, contribution, and community improvement
- **Near-zero operating cost**: Runs entirely within free-tier limits — costs $0–$0.02/month regardless of team size

**Why it matters**
MultiCloud-MultiPass is the public, open-source face of the CloudManagement system. By releasing it openly, the portfolio contributes a genuinely useful tool to the developer community — one that solves a real problem (multi-cloud cost control for small teams) that commercial tools don't address well. It demonstrates the portfolio's philosophy: build practical, cost-conscious tools that work within free-tier constraints, and share them so others benefit too.

---

### VaultsshCA

**What it is**
A set of scripts that set up HashiCorp Vault as an SSH Certificate Authority — a system that issues temporary, expiring access passes for logging into servers, replacing the traditional practice of distributing permanent passwords and keys to every server.

**Who it's for**
- DevSecOps and platform engineers building secure access for fleets of servers
- Security teams eliminating SSH key sprawl and manual key rotation
- Site reliability engineers managing access to hundreds of hosts
- Small teams that need enterprise-grade server access control without enterprise complexity

**The problem it solves**
Traditional server access relies on permanent passwords or key files that are distributed to every server's "authorized keys" list. This creates several problems: keys accumulate and are rarely rotated, a leaked key remains valid until someone manually removes it from every server, keys never expire by default, and there's no central way to control who can access which servers. At scale, managing server access becomes a security and operational nightmare.

**How it works**
The scripts set up Vault (a security tool from HashiCorp) as a certificate authority for SSH access. Instead of giving each person a permanent key, the person authenticates to Vault, requests a temporary signed certificate (valid for, say, 1 hour), and uses that certificate to log into any server that trusts the Vault authority. When the certificate expires, the person must re-authenticate to get a new one. If a person's access is revoked in Vault, they can no longer get new certificates — and their existing certificate expires automatically within the hour.

The scripts handle the full setup: starting Vault, initializing it, enabling the certificate authority, generating signing keys, creating access roles with appropriate restrictions, and testing the end-to-end flow by signing a sample key. Both Python and shell script versions are provided.

**Key benefits**
- **Short-lived access**: Certificates expire automatically (e.g., 1 hour), eliminating permanent credentials
- **Central revocation**: Revoke a person's Vault access and they can no longer get new certificates
- **No key distribution**: Servers trust the Vault authority once — no need to add individual keys to each server
- **Audit trail**: Every certificate signing request is logged
- **Policy-driven**: Control who can sign keys, for which users, with which permissions
- **Updated for Vault 2.x**: Uses modern, secure signing algorithms; addresses current security vulnerabilities

**Why it matters**
Server access is one of the most critical security surfaces in any infrastructure. This project demonstrates a practical, production-ready approach to zero-trust server access — replacing permanent credentials with short-lived, centrally managed certificates. It's a DevSecOps showcase that solves a real problem (SSH key sprawl) with an elegant solution (certificate-based access), and it's been updated for the latest version of Vault (2.x) with attention to current security best practices.

---

## 3. Cloud Based OSInt

*Automated discovery and verification of business contact information for outreach campaigns.*

### WorldStudioFinder

**What it is**
An automated system that finds and verifies email addresses for yoga, tai chi, capoeira, aikido, and martial arts studios worldwide by searching Google Maps and visiting their websites.

**Who it's for**
- Marketing teams running outreach campaigns to movement-arts studios
- Business development professionals seeking partnerships with studios
- Community builders connecting practitioners with studios across countries
- Anyone who needs verified, deliverable contact information for a specific type of business across multiple regions

**The problem it solves**
Manually searching for studio contact information across different cities and countries is incredibly time-consuming. Finding valid email addresses requires visiting each studio's website individually, and many emails turn out to be invalid or outdated. For an organization wanting to contact hundreds or thousands of studios across multiple countries, manual research would take weeks and produce unreliable results.

**How it works**
The system searches Google Maps for studios in specific cities or regions using categories like "yoga studio" or "aikido dojo." It then visits each studio's website to find email addresses, verifies whether those emails are valid and deliverable, and exports a clean list of verified contacts ready for email campaigns. The entire process can be filtered by country, state, or timezone, and results sync automatically to Google Sheets for team collaboration. When one mapping service's free daily quota is exhausted, the system automatically switches to an alternative free service, keeping costs at zero.

**Key benefits**
- **Automates weeks of manual research**: Generates verified contact lists in hours instead of weeks
- **Verifies email deliverability**: Checks that emails actually work before outreach, reducing bounce rates
- **Covers multiple countries**: Geographic filtering by country, state, and timezone
- **Google Sheets integration**: Results sync automatically for easy team access and collaboration
- **Free-tier optimized**: Automatically switches between mapping services when free quotas are exhausted
- **Multi-language support**: Works across countries with different languages

**Why it matters**
This tool enables scalable outreach campaigns across the global movement arts community. Instead of hiring researchers to manually build contact lists, organizations can generate verified, targeted contact data automatically — making it possible to run international marketing campaigns that would otherwise be impractical due to time and cost constraints. It demonstrates the portfolio's pattern of building practical, cost-optimized tools that solve real business problems.

---

## 4. Media & Video Processing

*Tools for downloading, converting, tracking, and managing video and media content.*

### MotionTracker

**What it is**
A video analysis tool that automatically detects movement within video footage, tracks where motion occurs across the frame, and can extract clips based on activity patterns.

**Who it's for**
- Video editors who need to find active segments in long recordings
- Martial arts instructors and sports coaches analyzing technique footage
- Content creators producing highlight reels from raw footage
- Anyone who needs to identify and extract moments of activity from hours of video

**The problem it solves**
Finding the interesting parts in long video recordings — like a specific technique demonstration in a martial arts class — requires watching through hours of footage. Manually tracking where a person moves across the screen is tedious and imprecise. Editors spend more time searching for content than working with it.

**How it works**
The software splits each video frame into vertical segments and compares consecutive frames to detect which pixels changed from one moment to the next. It calculates where movement is concentrated and can automatically pan the camera view to follow the action. The system produces both a motion-tracked version of the video (where the camera follows the movement) and a standard version, giving editors flexibility in post-production.

**Key benefits**
- **Automatically identifies active portions**: No need to watch hours of footage to find the interesting moments
- **Creates camera-following effects**: Adds professional production value without manual editing or expensive equipment
- **Processes faster than real-time**: Analyzes video faster than it plays back
- **Works with common formats**: Handles MP4, AVI, MOV, and other standard video formats
- **Hardware acceleration**: Uses the graphics card when available for faster processing

**Why it matters**
This tool dramatically reduces the time required to edit instructional or sports footage. Instead of manually scrubbing through hours of video to find teachable moments, editors can quickly locate segments with significant movement. The automatic camera-following feature adds professional production value to handheld or static-camera recordings without expensive equipment.

---

### VidConverter

**What it is**
A video processing tool that converts videos between different formats, crops out unwanted areas, adjusts resolution, and prepares footage for specific platforms or uses.

**Who it's for**
- Video editors and content creators preparing footage for different platforms
- Martial arts instructors producing training materials for students
- Anyone who needs to convert, crop, or resize videos without learning complex video editing software

**The problem it solves**
Raw video footage often needs preparation before it's usable — cropping out empty space, reducing file size for easier sharing, or converting to formats compatible with different platforms. Doing this manually with complex video software requires technical expertise and is time-consuming when processing many videos.

**How it works**
The user selects a video file and chooses output settings like desired format, resolution, and which portion of the frame to keep. The tool then processes the video using industry-standard video processing software, applying the chosen transformations and saving the result in the specified format. Multiple videos can be processed in batches with consistent settings.

**Key benefits**
- **Simplifies format conversion**: No need to learn complex video editing software
- **Crops to relevant content**: Removes empty space (e.g., unused dojo area) to focus on the action
- **Adjusts resolution**: Creates high-quality archives, web-optimized versions, and social media clips from one source
- **Batch processing**: Apply consistent settings to multiple videos at once
- **Reduces file sizes**: Makes videos easier to share while maintaining quality
- **Works offline**: No internet connection required

**Why it matters**
This tool bridges the gap between raw footage and distribution-ready content. Instructors can record demonstrations once and efficiently prepare versions for different uses — high-quality archives, web-optimized versions for students, and social media clips — without becoming video compression experts. It standardizes the video preparation process across an organization's content library.

---

### PlayListDownloader

**What it is**
A tool that downloads entire YouTube playlists automatically, saving all videos from a channel or curated collection to a local computer for offline access or archival.

**Who it's for**
- Educators and researchers who need reliable offline access to video collections
- Content archivists preserving educational or reference materials
- Instructors building offline libraries of reference videos
- Anyone who depends on YouTube content that might be removed or become unavailable

**The problem it solves**
YouTube playlists can only be watched online with an internet connection. Videos may be removed, made private, or become unavailable in certain regions. Downloading videos one-by-one is impractical for large playlists, and manual downloads don't preserve playlist organization. For educational institutions and researchers who depend on specific video collections, this creates a risk of losing access to critical content.

**How it works**
The user provides a YouTube playlist URL, and the tool automatically retrieves information about all videos in that playlist. It then downloads each video, optionally converting it to different formats or quality levels. The downloads can be paused and resumed, and the tool handles network interruptions gracefully. Progress is displayed so the user knows how much of the playlist remains.

**Key benefits**
- **Downloads entire playlists with one command**: No need to download videos individually
- **Preserves playlist organization**: Maintains the original order and structure
- **Resumable downloads**: Can pause and resume without starting over
- **Quality options**: Choose video quality based on storage and quality needs
- **Handles network errors**: Automatically retries failed downloads
- **Works with public and private playlists**: Supports authenticated access to private collections

**Why it matters**
This tool enables reliable access to video content regardless of internet connectivity or platform changes. Educational institutions can archive course materials, researchers can preserve interview collections, and instructors can build offline libraries of reference videos. It protects against content loss due to takedowns or regional restrictions and ensures long-term access to valuable video resources.

---

### Pano2Movie

**What it is**
A tool that converts panoramic (360-degree) photographs into panning video movies, creating the illusion of a camera sweep through a scene.

**Who it's for**
- Photographers who want to present panoramic images in video format
- Real estate professionals creating property walkthrough videos
- Virtual tour creators who need video output from panoramic photos
- Anyone who wants to convert 360-degree photos into shareable video content

**The problem it solves**
Panoramic photos require interactive viewing — users must drag or scroll to see the full scene. This doesn't work well in video presentations, slideshows, or platforms that only support standard video formats. Converting panoramas to video manually is complex and time-consuming, requiring specialized video editing skills.

**How it works**
The user loads a panoramic image and defines a path — a virtual camera route through the scene. The tool then generates a video by panning across the panorama following that path, similar to how a video camera would sweep across a landscape. The panning speed and direction can be adjusted, and the same path can be applied to multiple panoramas for consistent presentation style.

**Key benefits**
- **Makes panoramas viewable as standard video**: Works on any platform that supports video
- **Professional camera sweeps from static photos**: Creates cinematic effects without video footage
- **Consistent presentation style**: Apply the same path to multiple panoramas for a uniform look
- **Common video formats**: Output works with most video players and platforms
- **Offline processing**: No cloud services or internet connection required

**Why it matters**
This tool unlocks panoramic photography for video-based workflows. Real estate agents can create property walkthrough videos from existing 360 photos. Landscape photographers can produce cinematic presentations from panoramic captures. The ability to convert still images into motion content expands the utility of existing photo libraries and enables new presentation formats without requiring new video footage.

---

### ClipQuotes

**What it is**
A system that downloads YouTube videos or playlists, searches through spoken words (captions) to find specific topics or phrases, and automatically extracts short video clips containing those moments.

**Who it's for**
- Content creators pulling quotes or highlights from long-form video
- Marketers extracting testimonial clips from customer interviews
- Educators finding specific explanations in lecture series
- Researchers locating every instance of a topic being discussed across a video corpus

**The problem it solves**
Finding a specific quote or explanation in a long video requires watching through hours of footage or relying on imprecise timestamp notes. Manually extracting clips frame-by-frame is tedious, and searching for topics mentioned in speech (rather than titles or descriptions) is nearly impossible without specialized tools. This makes repurposing video content extremely time-consuming.

**How it works**
The user provides a YouTube playlist or video URL and keywords or phrases they're looking for. The tool downloads the video captions (subtitles), then searches through the spoken text using flexible matching — it can find exact matches, approximate matches (catching typos), or words that sound similar. When it finds a match, it automatically extracts a video clip centered on that moment, with adjustable padding before and after to provide context. Results are displayed with the surrounding text so the user can verify the context before extracting.

**Key benefits**
- **Finds specific spoken content without watching entire videos**: Search by what was said, not just titles
- **Handles typos and pronunciation variations**: Catches terms that were mis-transcribed
- **Shows context around matches**: Verify the surrounding text before extracting
- **Automatic clip extraction**: One-click extraction with adjustable context padding
- **Batch processing**: Search entire playlists at once
- **Web-based interface**: Easy to use without command-line expertise

**Why it matters**
This tool transforms video from a linear medium into a searchable, quotable resource. Marketers can pull testimonial clips from customer interview playlists. Educators can extract specific explanations from lecture series. Researchers can locate every instance of a topic being discussed across a corpus of videos. It dramatically reduces the time required to repurpose existing video content for new uses — social media clips, training materials, or highlight reels.

---

## 5. Quantum Aikido / Wellness Websites

*Web properties for the Quantum Aikido ecosystem — book promotion, coaching platform, and wellness consulting.*

### AIRichardMoon

**What it is**
The behind-the-scenes server that powers an AI coaching system, answering member questions using a trusted collection of written materials while tracking costs and connecting users to human coaches when needed.

**Who it's for**
- Coaching organizations and dojos that have a body of written teachings
- Members and students who want 24/7 access to coaching grounded in specific materials
- Coaches and operators who need to monitor usage and manage handoffs
- Solo authors and thought leaders who want a private, invite-only chat experience

**The problem it solves**
Organizations with valuable written content (books, transcripts, articles) struggle to make it accessible to members around the clock. Generic AI chatbots can't guarantee answers are grounded in the organization's specific teachings, and hiring human coaches for 24/7 coverage is expensive. Members get frustrated when they can't get timely answers, and organizations worry about AI making things up or losing connection to their source material.

**How it works**
When a member asks a question, the system searches through a curated collection of documents to find relevant passages. It then uses an AI to craft an answer that cites the exact source material, so members can verify and learn more. The system limits how fast questions can be processed to control costs, and when the AI can't answer or a member requests a human, it automatically notifies the coaching team with a video meeting link. Members sign in through email or social login, and invitation codes control who can join. Operators can track usage, costs, and system health through a dashboard.

**Key benefits**
- **Always-on availability**: Members get answers any time without waiting for a human coach
- **Source accountability**: Every answer shows exactly where it came from, building trust and enabling deeper study
- **Cost control**: Built-in tracking and limits prevent surprise bills, designed to stay within free service tiers
- **Graceful escalation**: When the system can't help, it seamlessly connects members to a human coach
- **Invite-only access**: Invitation codes let organizations control who can register
- **No technical expertise needed**: Organizations can deploy it without specialized cloud knowledge

**Why it matters**
This system demonstrates how AI can extend human expertise rather than replace it — grounding answers in trusted sources, escalating to humans when needed, and operating within budget constraints. It provides a template for other coaching organizations, schools, and mentorship programs to offer scalable, source-traceable AI assistance while maintaining human connection and control.

---

### quantumaikido.com

**What it is**
The public website for Quantum Aikido that showcases Richard Moon's book, teachings, and body of work, while also providing a members-only portal for AI-powered coaching and community resources.

**Who it's for**
- Readers and practitioners interested in martial arts philosophy, conflict resolution, and mindfulness
- People seeking to learn about Richard Moon's 55+ years of Aikido and awareness arts practice
- Members who have registered for the AI coaching system
- Researchers and students looking for free educational resources and writings

**The problem it solves**
Richard Moon has accumulated decades of writings, teachings, videos, and peace-building work across multiple formats and locations. There was no central, accessible archive for this body of work. Additionally, readers of the book wanted ongoing engagement and coaching, but there was no digital space for members to connect with the teachings interactively. The site needed to serve both public audiences discovering the work for the first time and private members seeking deeper engagement.

**How it works**
The public website features the book "Quantum Aikido: The Power of Harmony" with purchase links, free chapter downloads, and endorsements from notable figures. It includes an archive of Richard's other writings, videos, and resources organized by topic. A global map shows Aikido dojos worldwide. Behind a members-only login area, registered users access the AI coaching chat (powered by the separate AIRichardMoon backend), where they can ask questions and receive answers grounded in Richard's corpus. The site also handles email signups, contact forms, and media inquiries.

**Key benefits**
- **Central archive**: Fifty years of teachings, writings, and resources in one searchable location
- **Book sales and discovery**: Multiple purchase channels and free samples drive book sales
- **Member engagement**: Private coaching portal provides ongoing value beyond the book
- **Global community**: Dojo map connects practitioners worldwide
- **Free resources**: Extensive library of free chapters and writings attracts and serves visitors
- **Professional presentation**: Polished design and structured content establish credibility

**Why it matters**
This site is the digital hub for the Quantum Aikido movement, serving as both a marketing engine for the book and a platform for deeper engagement. It bridges physical martial arts practice with digital accessibility, allowing Richard's teachings to reach a global audience. The members portal demonstrates how traditional teachings can be extended through technology while maintaining fidelity to the source material.

---

### AikiField.com

**What it is**
A professional services website for AikiField, a consultancy that provides part-time security leadership (fractional CISO services) and security coaching for technology companies that can't afford or don't need a full-time security executive.

**Who it's for**
- Series A–C startup founders and CEOs facing enterprise security requirements
- CTOs and VPs of Engineering who own security but aren't security specialists
- Board members and investors who need clarity on technical risk
- SaaS companies and AI-powered product teams dealing with customer security questionnaires

**The problem it solves**
Growing technology companies face increasing pressure from enterprise customers to demonstrate strong security practices. However, hiring a full-time Chief Information Security Officer (CISO) costs $200,000–$400,000 annually — far beyond what early-stage companies can afford. Security responsibilities often fall on already-overloaded engineering leaders who lack security expertise. Companies struggle with vulnerability backlogs, security questionnaires, and the need to build security programs without derailing product development.

**How it works**
The website presents AikiField's services: fractional CISO engagement (part-time executive security leadership), security program buildout, integrating security into development processes, threat modeling workshops, and leadership coaching. It explains a four-agreement, six-phase engagement process that guides companies from their current state to a mature security posture. The site includes self-assessment tools for both security maturity and leadership presence, case studies with concrete results (e.g., cutting vulnerability remediation time from 21 days to 3 days), and a contact flow for discovery calls.

**Key benefits**
- **Executive-level security without full-time cost**: Companies get CISO expertise for a fraction of the hire cost
- **Business-aligned security**: Security programs designed to support revenue and growth, not block it
- **Practical outcomes**: Focus on metrics that matter — winning deals, clearing backlogs, reducing risk
- **Leadership development**: Coaching ensures security capabilities outlast the engagement
- **Clear process**: Structured engagement methodology gives companies a predictable path
- **Self-assessment tools**: Companies can evaluate their readiness before committing

**Why it matters**
AikiField represents a new model for security leadership — blending technical expertise with executive coaching and somatic practice. It addresses a critical gap in the market: companies that need security leadership but can't justify a full-time hire. The site positions security not as a compliance burden but as a business enabler and differentiator. It also showcases sponsored projects (including the Quantum Aikido AI coaching backend) that demonstrate the intersection of security leadership and practical wisdom.

---

### neurowellnessdojo.com

**What it is**
A simple referral landing page for Dr. Clemans's patients, designed to collect contact information from interested individuals and forward it to a coaching intake system.

**Who it's for**
- Patients referred by Dr. Clemans who are interested in neuro wellness coaching
- The coaching intake team who receives and processes referrals
- Dr. Clemans, who needs a professional way to direct patients to coaching services

**The problem it solves**
Dr. Clemans needed a straightforward way to refer patients to neuro wellness coaching without building a complex system. The page needed to be professional, functional, and capable of tracking which version of the messaging resonated better with visitors (A/B testing). It also needed basic security protections against spam and automated submissions while remaining simple to deploy and maintain.

**How it works**
Visitors land on a clean, focused page that describes the neuro wellness coaching practice. They fill out a simple form with their name, email, and message. The system runs an A/B test, showing half the visitors language focused on "somatic" approaches and half seeing "mind/body" language to see which converts better. When submitted, the form sends an email to the coaching intake team and optionally logs the submission to a Google Sheet for tracking. Basic security features prevent spam (a hidden field that traps bots, rate limiting, and session protection). The page is built with simple PHP and requires no complex setup — just upload and configure.

**Key benefits**
- **Professional referral channel**: Gives Dr. Clemans a polished way to direct patients to coaching
- **Data-driven optimization**: A/B testing reveals which messaging resonates with patients
- **Simple deployment**: No complex software or databases — runs on any standard web hosting
- **Spam protection**: Basic safeguards keep the intake process clean
- **Tracking capability**: Optional Google Sheet integration provides conversion data
- **Privacy-focused**: Clear privacy policy and no data retention beyond what's necessary

**Why it matters**
This site demonstrates how a focused, single-purpose landing page can effectively serve a specific referral need without over-engineering. It's a practical example of using A/B testing to improve messaging in a healthcare context. The simplicity of the implementation makes it maintainable and cost-effective, while still providing professional functionality and basic analytics. It serves as a template for other professional referral landing pages in the portfolio.

---

## 6. Security & Threat Intelligence

*Tools for password hygiene, domain reputation, SSH key management, and privacy-preserving credential validation.*

### PasswordFilter

**What it is**
A web-based password hygiene service that checks passwords against a database of over one million credentials known to have been stolen in data breaches, helping organizations ensure their users aren't using compromised passwords.

**Who it's for**
- IT security teams who want to prevent employees from using known-compromised passwords
- Organizations implementing password policies that go beyond simple complexity rules
- Security-conscious developers building user registration systems
- Anyone who wants to check whether a password has appeared in a known data breach

**The problem it solves**
Employees and users often choose passwords that have been stolen in data breaches and are freely available to attackers. Traditional password policies (requiring a mix of letters, numbers, and symbols) can't detect whether a specific password has already been compromised. Attackers routinely use lists of stolen passwords to try to break into accounts — a technique called "credential stuffing" that is one of the most common causes of security breaches.

**How it works**
The service provides a web interface where a password can be checked against a database of over one million credentials that have been exposed in known data breaches. If the password appears in the database, the user is warned that it has been compromised and should not be used. The service also suggests using a dedicated password manager (rather than browser-based password storage) and can generate random, strong passwords for use with password managers.

**Key benefits**
- **Detects compromised passwords**: Catches passwords that look strong but have actually been stolen in breaches
- **Educates users**: Encourages the use of password managers rather than relying on memory
- **Generates strong passwords**: Creates random passwords suitable for password managers
- **Web-based**: Accessible from any browser without installing software
- **Privacy-conscious**: Checks against a database of known-compromised passwords without storing the user's password

**Why it matters**
Password attacks are the most common way attackers break into organizations. This tool provides a practical first line of defense by ensuring that users aren't using passwords that attackers already have. It represents the portfolio's security philosophy: build practical, user-facing tools that improve security without requiring users to become security experts.

---

### vtapi

**What it is**
A tool that automatically checks whether a website domain or file is known to be dangerous, by querying VirusTotal — a global threat intelligence service that analyzes files and URLs using dozens of security tools simultaneously.

**Who it's for**
- Security analysts who need to quickly assess whether a domain or file is malicious
- IT operations teams who want to automate threat checking as part of their workflows
- Developers building security-aware applications that need to verify file or URL safety
- Anyone who needs to check the reputation of a website before visiting it or linking to it

**The problem it solves**
Organizations encounter thousands of files, download links, and email attachments every day. Manually checking each one for viruses or malware is impossible, yet missing a single malicious file can lead to a ransomware infection or data breach. Security teams need a fast, automated way to determine if something is safe, and they need the answer to reflect the collective judgment of many security tools, not just one.

**How it works**
The tool connects to the VirusTotal API using a key stored securely in Amazon's Secrets Manager (a cloud-based vault for sensitive information). When given a domain name, it fetches a reputation report showing whether any security tools have flagged it as dangerous. It also retrieves samples of files that were found to be malicious when downloaded from that domain, and shows which specific security tools detected each threat. The output is a formatted report showing the security tool name, version, and what it detected.

**Key benefits**
- **Leverages collective intelligence**: Checks against dozens of security tools simultaneously, not just one
- **Automated**: Can be integrated into workflows to check files or domains without human intervention
- **Secure key management**: API key stored in Amazon's encrypted secrets vault, not in plain text
- **Detailed reports**: Shows exactly which security tools flagged a threat and what they found
- **Domain reputation**: Checks whether a website is known to host malware, not just individual files

**Why it matters**
Malware delivered through email attachments, downloads, and malicious websites remains a top attack vector. This tool gives organizations a scalable way to check files and domains against the world's most comprehensive threat database, dramatically reducing the risk of infection through common file-sharing activities. It demonstrates practical security automation — turning a manual, time-consuming check into a quick, automated query.

---

### 1password

**What it is**
A script that automatically downloads all SSH keys (the credentials used to log into servers) from a 1Password vault and places them in the correct location on the user's computer — keeping server access keys synchronized without manual copying.

**Who it's for**
- Developers and system administrators who manage many server access keys
- Teams that store SSH keys in 1Password (a commercial password manager) and need them on their local machines
- Anyone who has experienced the frustration of trying to find the right SSH key across multiple 1Password accounts

**The problem it solves**
Developers who manage multiple servers often have many SSH keys — different keys for different servers, projects, and environments. Storing them in a password manager like 1Password is the secure approach, but getting them onto the local computer in the right location with the right permissions is a manual, error-prone process. When keys are updated in 1Password, the local copies become out of date. Managing keys across multiple 1Password accounts (e.g., personal and work) adds another layer of complexity.

**How it works**
The script connects to 1Password via its command-line tool, lists all available accounts, and lets the user select which accounts to sync from. It then finds all items categorized as SSH keys in each selected account, downloads both the private and public key portions, and saves them to the user's `.ssh` directory with appropriate file names and security permissions. Before overwriting any existing keys, it creates a backup of the current keys. If a public key is missing, it can generate one from the private key automatically.

**Key benefits**
- **One-command sync**: Downloads all SSH keys from selected 1Password accounts at once
- **Multi-account support**: Handles personal and work 1Password accounts in a single run
- **Automatic backups**: Creates a timestamped backup before overwriting any existing keys
- **Correct permissions**: Sets the right security permissions on private and public keys automatically
- **Smart naming**: Generates sensible file names from key titles, avoiding conflicts between accounts
- **Public key generation**: Can derive a public key from a private key if the public key is missing

**Why it matters**
This is a practical security tool that solves a daily frustration for developers and system administrators. By making it trivial to keep local SSH keys synchronized with the secure 1Password vault, it encourages the security best practice of storing keys in a password manager rather than in plain text files. It eliminates the manual, error-prone process of copying keys, setting permissions, and managing multiple accounts — turning a 15-minute chore into a 15-second command.

---

### OARTAL

**What it is**
A conceptual framework — "One Allowlist to Rule Them All" — for managing usernames and passwords using an approved-list approach with a privacy technique called "chaffing" that hides the real credential among fake ones during validation.

**Who it's for**
- Security architects designing authentication systems
- Application developers building user registration and password management features
- CISOs and security teams evaluating new approaches to credential validation
- Researchers exploring privacy-preserving authentication methods

**The problem it solves**
Validating usernames and passwords is harder than it looks. Traditional approaches either use block-lists (banning known-bad passwords, which is always one step behind) or complex complexity rules (which users hate and often circumvent). Meanwhile, transmitting a password to a validation service creates a privacy risk — the service sees the user's actual password. The problem is: how do you validate that a password is strong and acceptable without ever seeing the password itself?

**How it works**
Instead of blocking bad passwords, OARTAL flips the approach: it maintains an approved list (allowlist) of acceptable passwords. When a user chooses a password, the application generates a set of fake passwords (chaff) and sends them along with the real password to the validation service. The service checks each one against the allowlist and returns results for all of them — so the service never knows which password was the real one. If the user's password is rejected, the application can show them which passwords from the chaff list would be acceptable, helping them choose a valid alternative. In highly secure systems, once a password is used, it can be removed from the allowlist entirely, preventing password reuse without storing a history of used passwords.

**Key benefits**
- **Privacy-preserving validation**: The validation service never sees the user's actual password alone — it's hidden among fake entries
- **Positive approach**: Instead of trying to block infinite bad passwords, it only accepts known-good ones
- **No password reuse**: Passwords can be removed from the allowlist after use, preventing reuse without storing password history
- **User-friendly rejection**: When a password is rejected, the user can see which alternatives would be accepted
- **Flexible**: The same approach works for usernames and other validated fields

**Why it matters**
OARTAL represents creative security thinking — flipping a traditional problem on its head and solving it with a privacy-preserving technique. While it's a conceptual framework rather than a production system, it demonstrates the portfolio's ability to think deeply about security architecture and propose novel solutions. The chaffing approach is particularly relevant in an era of increasing privacy regulations, where minimizing the exposure of user credentials is both a security and compliance imperative.

---

## 7. System Administration & OS Analysis

*Linux system analysis, bloat detection, and file usage analysis.*

### UnUsedOS

**What it is**
A toolkit that analyzes Linux computer systems to find files and software packages that are never used, helping system administrators clean up and slim down operating system images — originally built for specialized computing appliances.

**Who it's for**
- System administrators maintaining Linux servers or appliances that run for long periods
- Engineers building minimal operating system images for embedded devices or appliances
- IT teams looking to reduce storage usage, improve performance, and shrink the security attack surface
- Anyone responsible for keeping a Linux system lean and efficient

**The problem it solves**
Over time, computer systems accumulate files, applications, and system components that are never used again. These unused items waste storage space, slow down system performance, create security risks (old software may have vulnerabilities), and make backups take longer. On specialized computing appliances — devices that run a specific purpose, not general-purpose computers — every unnecessary component is wasted space and a potential security risk. Finding what's actually being used versus what's just sitting there is difficult and time-consuming to do manually, especially across hundreds of files and packages.

**How it works**
The toolkit combines several approaches:

1. **File usage reports**: Shell scripts scan the filesystem and examine records of when each file was last opened or modified. Files that haven't been accessed within a specified time period are flagged as unused.
2. **Package usage analysis**: Python scripts analyze which installed software packages have files that are actually being used, versus packages where no files have been accessed recently.
3. **Interactive exploration**: Jupyter notebooks (interactive data analysis environments) let administrators explore the data visually, drilling into specific directories or packages to understand what's used and what isn't.
4. **Security patch creation**: Once unused components are identified, the toolkit can create a security patch bundle that removes them, and an installer script that applies the cleanup to other systems.

**Key benefits**
- **Frees up storage space**: Identifies files and packages that can be safely removed
- **Improves performance**: Less clutter means faster system operation and backups
- **Reduces security risk**: Removes old, unmaintained software that could have vulnerabilities
- **Saves administrator time**: Automated analysis replaces hours of manual investigation
- **Creates reusable patches**: Cleanup can be packaged and applied to multiple systems
- **Data-driven decisions**: Reports and visualizations support informed cleanup decisions

**Why it matters**
In the biofool portfolio, UnUsedOS represents the system administration and infrastructure optimization discipline. It addresses a fundamental operational challenge — keeping systems lean and efficient — which is critical for cost control, security, and performance. The toolkit was built for real-world use on specialized computing appliances, demonstrating the portfolio's pattern of building practical tools that solve real operational problems with data-driven analysis.

---

## 8. Text & Content Processing

*Tools for spell-checking captions, converting documents, and processing text content.*

### closedcaption_spellchecker

**What it is**
A workflow system that downloads YouTube video subtitles in batches, corrects the spelling of specialized terminology (like Aikido terms that YouTube's auto-captioning consistently gets wrong), builds a growing dictionary of corrections, and uploads the fixed subtitles back to YouTube.

**Who it's for**
- YouTube content creators whose videos contain specialized vocabulary that auto-captioning mangles
- Video editors and caption editors processing subtitle files in bulk
- Accessibility teams ensuring captions are accurate for viewers who depend on them
- Educators and martial arts instructors whose technical terms are consistently mis-transcribed

**The problem it solves**
YouTube's automatic captioning is convenient but consistently mangles specialized vocabulary. "Aikido" becomes "a key doe." "Irimi" becomes "ear ream e." "Tenkan" becomes "ten con." Manually fixing each video's captions is tedious, and the same errors repeat across every video. Standard spell-checkers don't know these specialized terms, and they get confused by the timing codes and formatting in subtitle files. Content creators need a way to fix these errors once and have the corrections applied automatically to all future videos.

**How it works**
The system works in a four-step cycle:

1. **Download**: The tool downloads subtitles from a YouTube channel or playlist in batches (e.g., 16 videos at a time), combining them into a single file for easy editing.
2. **Correct**: The creator opens the downloaded file and fixes the mis-transcribed terms — just the text, not the timing. This is a one-time manual step per batch.
3. **Learn**: The tool compares the original and corrected files, automatically extracting the corrections into a terminology dictionary (e.g., "a key doe" → "Aikido"). The creator can review each correction interactively before adding it to the dictionary.
4. **Apply**: The next time subtitles are downloaded, the terminology dictionary is applied automatically — the same errors are fixed without any manual work. As new errors are found and corrected, the dictionary grows smarter over time.

The corrected subtitles can then be uploaded back to YouTube, replacing the auto-generated versions. An optional timestamp watermark can be added to track when captions were last updated.

**Key benefits**
- **Fix once, apply forever**: Corrections are learned and applied automatically to all future videos
- **Batch processing**: Download and correct many videos at once, not one at a time
- **Specialized vocabulary**: Handles domain-specific terms that standard spell-checkers don't know
- **Interactive review**: Review and approve each correction before it's added to the dictionary
- **Multi-word phrases**: Catches compound terms like "tai no henko" that get split up
- **Upload back to YouTube**: Corrected captions replace the auto-generated ones with one command
- **Tracking**: A graphical interface shows which videos have been spell-checked and uploaded

**Why it matters**
As video content continues to grow across platforms, the demand for accurate, accessible captions is increasing — driven by both user expectations and legal accessibility requirements. This tool addresses a specific, high-value niche: content creators whose specialized vocabulary is consistently mis-transcribed by auto-captioning. It turns a repetitive, tedious task into a one-time learning process, and it demonstrates the portfolio's pattern of building practical workflow tools that get smarter with use.

---

## 9. Web Apps & Legacy Projects

*Standalone web apps and earlier versions of projects that have since evolved.*

### GPS-PWA

**What it is**
A web app that works like a phone app, tracking a person's movement throughout the day using their phone's location, storing the route on the device, and displaying it on an interactive map — designed for areas with poor internet connectivity.

**Who it's for**
- Field workers who need to track their routes in areas with poor connectivity
- Researchers studying movement patterns in rural environments
- Nonprofit organizations monitoring field worker activity (originally designed for Bihar, India)
- Anyone who needs a lightweight, offline-capable location tracking tool

**The problem it solves**
Tracking where someone has been throughout the day typically requires either a specialized app (which must be installed) or constant internet connectivity (to send location data to a server). In rural areas with poor connectivity, neither option works well. Installing apps on workers' phones requires technical support, and web-based trackers that need constant internet drop data when the connection is lost. A solution was needed that works in a browser, installs like an app, and keeps tracking even without internet.

**How it works**
The user opens the web app in their phone's browser and grants location permission. The app uses the phone's built-in location capability to capture coordinates in real-time, calculates speed and cumulative distance, and stores everything directly on the device (so it survives page reloads and phone reboots). The user can toggle between a data view (showing coordinates, accuracy, speed, and distance) and a map view (showing the tracked route on an interactive map). A background service worker caches the app so it works even without internet — the app loads from the phone's storage, not from the internet.

**Key benefits**
- **Works like a native app**: Installs to the home screen, works offline, no app store needed
- **Offline tracking**: Records location data without internet connectivity
- **Persistent storage**: Data survives page reloads and phone reboots
- **Interactive map**: Visualizes the tracked route on an interactive map
- **Real-time data**: Shows coordinates, accuracy, speed, and cumulative distance as it tracks
- **Dual view**: Switch between raw data display and map visualization

**Why it matters**
This project was an early experiment in building offline-capable web apps for rural deployment — a pattern that later evolved into the FieldAppAndroid project. It demonstrates the portfolio's focus on solving connectivity challenges in field environments, and it shows how web technologies can approximate native app functionality without the overhead of app store distribution. The progressive web app approach is particularly relevant for environments where installing apps is impractical.

---

### PHP

**What it is**
A mobile app starter project — an early scaffold for building a cross-platform mobile application (Android and iOS) using React Native, with a pre-configured development environment.

**Who it's for**
- Developers starting a new mobile app project who want a pre-configured starting point
- Teams exploring cross-platform mobile development (one codebase for both Android and iOS)
- Anyone learning React Native who wants a working starting template

**The problem it solves**
Starting a new mobile app project from scratch involves significant setup: configuring the development environment, setting up the build tools, establishing code quality tools (linting, formatting, testing), and creating a reproducible development environment. This starter project packages all of that together, including a virtual machine configuration for consistent development environments across different host operating systems.

**How it works**
The project contains a standard React Native application template with all the configuration files pre-set: the app entry point, build configuration, code quality tools (ESLint for catching errors, Prettier for consistent formatting), and a test framework (Jest) with a sample test. A Vagrant configuration file provisions a complete development environment in a virtual machine, ensuring that any developer gets the same setup regardless of their host operating system.

**Key benefits**
- **Pre-configured for both platforms**: Ready to build for Android and iOS from one codebase
- **Code quality built in**: ESLint and Prettier catch errors and enforce consistent style
- **Testing ready**: Jest is configured with a sample test, ready to extend
- **Reproducible environment**: Vagrant ensures every developer has the same setup
- **Dark mode support**: Built-in support for the device's light/dark mode setting

**Why it matters**
This project represents the portfolio's exploration of cross-platform mobile development — a path that informed the later FieldAppAndroid project (which took a native Android approach instead). It demonstrates the importance of starting projects with proper tooling and environment configuration, and it shows the evolution of thinking: the portfolio tried cross-platform (React Native) first, then moved to native Android for the production field app. This kind of experimentation and learning is a hallmark of practical software development.

---

### BeBold

**What it is**
A browser-based tool that extracts only the bold and emphasized text and headings from any web page or document, and presents them as a browsable slide show — helping users quickly orient themselves to the key points of long content.

**Who it's for**
- Students preparing for exams who need to review key points from long documents
- Speechwriters distilling the essential points from reference material
- Professionals orienting themselves to long online documents before reading them in full
- Anyone who wants to quickly grasp the key ideas from a lengthy web page

**The problem it solves**
Long online documents are hard to scan. When you need to quickly understand the key points of a 50-page report or a lengthy web article, reading the entire thing is impractical, but the bold text and headings — which authors use to highlight their most important points — are scattered throughout the document and hard to extract. BeBold solves this by pulling out just the emphasized text and presenting it as a navigable slide show.

**How it works**
The user loads a web page or HTML document into BeBold. The tool scans the content and extracts all text that is bold, emphasized, or marked as a heading. It then presents each set of bold words or heading as a separate "slide" in a carousel — a slide-show interface where the user can click forward and backward through the key points. The result is a distillation of the document's most important content, presented in a format that's easy to scan and review.

**Key benefits**
- **Instant key-point extraction**: Pulls out the most important text from any document
- **Slide-show format**: Presents key points as navigable slides, not a wall of text
- **Bookmarkable**: Save the slide show as a bookmark for quick reference
- **Works in any browser**: No installation or special software needed
- **Great for review**: Ideal for exam prep, speech preparation, or document orientation

**Why it matters**
BeBold is a simple but clever tool that solves a real problem: how to quickly grasp the key points of long content. It demonstrates the portfolio's ability to build focused, single-purpose tools that do one thing well. It also represents an early exploration of content extraction — a pattern that later evolved into the more sophisticated scraping and content processing tools in the portfolio.

---

### Egbert

**What it is**
A collection of web-based tools and creative content, including: a children's Aikido story ("When Egbert Met Stevie"), a sensor-based roll smoothness analyzer that uses phone motion sensors, a Tetris game, and a mind-mapping tool.

**Who it's for**
- Children learning Aikido principles through storytelling
- Martial arts practitioners analyzing the smoothness of their rolls using phone sensors
- Anyone who enjoys a game of Tetris or needs a simple mind-mapping tool
- Educators looking for creative ways to teach conflict resolution to children

**The problem it solves**
This project serves multiple purposes: making Aikido principles accessible to children through an engaging story, providing a practical tool for martial artists to measure and improve their technique using sensors everyone already has (phone motion sensors), and offering simple utility tools (Tetris, mind mapping) as web-based experiments.

**How it works**
The project is a web application hosted on GitHub Pages with several components:

- **"When Egbert Met Stevie"**: An illustrated children's story adapted from Richard Moon's work, teaching Aikido principles of harmony and energy flow through a relatable narrative about a child dealing with teasing.
- **Roll smoothness analyzer**: Uses the phone's built-in motion sensors (accelerometer, gyroscope, orientation) to measure how smooth a martial arts roll is. The user performs a roll while holding their phone, and the tool displays real-time graphs of the motion data, allowing analysis of technique.
- **Tetris**: A complete, playable Tetris game built in JavaScript.
- **Mind mapping**: A tool for creating visual idea maps.

**Key benefits**
- **Story-based learning**: Teaches Aikido principles to children through an engaging narrative
- **Sensor-based technique analysis**: Uses phone sensors (that everyone already has) to measure martial arts technique
- **Real-time visualizations**: Live graphs of motion data help practitioners understand their movement
- **Multiple tools in one**: Story, analyzer, game, and mind map — all in a single web app
- **No installation needed**: Everything runs in a web browser

**Why it matters**
Egbert represents the creative, experimental side of the portfolio — where martial arts practice, technology, and storytelling intersect. The roll smoothness analyzer is particularly innovative: it takes a sensor that every modern phone has and applies it to a practical martial arts training problem. The children's story demonstrates how Aikido principles can be communicated to new audiences through narrative. Together, these components show how technology can serve traditional practices in unexpected ways.

---

## 10. Templates & Concepts

*Project templates and conceptual projects that define conventions or explore ideas.*

### starter

**What it is**
A project template — a pre-configured starting point for new software projects — that includes all the configuration files, rules, and tools needed to maintain consistency across the entire biofool portfolio.

**Who it's for**
- The developer (biofool) starting any new project in the portfolio
- Contributors who join a biofool project and need to understand the conventions
- Other developers who want to adopt a similar template for their own project portfolio

**The problem it solves**
When a single developer manages 29+ projects, consistency is critical but hard to maintain. Each project needs the same configuration files (what to ignore in version control, how to set up the development environment), the same coding rules (never commit secrets, never fail silently, verify API costs), and the same AI assistant configuration (so AI coding tools follow the same rules across all projects). Without a template, each new project starts from scratch and drifts from the conventions.

**How it works**
A new project is created by clicking "Use this template" on GitHub or running a single command. The template includes:

- **Configuration files**: What to ignore in version control (covering Python, Node, IDE files, secrets)
- **AI assistant rules**: Two files (`AGENTS.md` and `CLAUDE.md`) that tell AI coding assistants the rules to follow — never read secrets, never fail silently, verify API costs, prefer data files over hardcoding, and more
- **AI assistant permissions**: Pre-configured permission settings for safe read-only and git commands
- **Search skills**: Bundled web search capabilities that work across all projects
- **Documentation structure**: Templates for project-specific documentation

**Key benefits**
- **Instant consistency**: Every new project starts with the same configuration and rules
- **AI assistant ready**: AI coding tools immediately know the portfolio's rules and conventions
- **Security built in**: Rules prevent reading or committing secrets by default
- **Cost-conscious**: Rules require verifying API pricing and accounting for free tiers
- **Quality enforced**: Rules require logging errors (never failing silently) and using data files
- **One-command setup**: Create a new project with a single command

**Why it matters**
The `starter` template is the invisible backbone of the entire portfolio. It's what makes 29 projects manageable by a single developer — every project follows the same conventions, uses the same tools, and enforces the same rules. Without it, each project would drift in its own direction, making maintenance and context-switching between projects painful. The template encodes years of lessons learned (never commit secrets, verify API costs, never fail silently) so that past mistakes don't repeat. It's a force multiplier that makes the portfolio possible.

---

### biofool.github.io

**What it is**
A public website hosting two things: a multi-language QR Code generator (a tool that creates those square barcodes you scan with your phone), available in eight programming languages, and a concept page for the Truthiness Discovery Network.

**Who it's for**
- Developers who need to generate QR codes in their applications (JavaScript, TypeScript, Java, Python, PHP, Ruby, ActionScript, or Hack)
- Anyone who needs to create a QR code quickly using a free web tool
- People interested in the concept of tracking the origin and trustworthiness of online media

**The problem it solves**
QR codes are ubiquitous — they appear on business cards, posters, product packaging, and restaurant menus. But generating them requires either a paid service or a library in the right programming language. This project provides a free, open-source QR code generator in eight languages, plus a live web demo where anyone can create a QR code instantly without installing anything.

**How it works**
The QR Code Generator is based on the official QR code standard (JIS X 0510:1999) and is available as a library in eight programming languages. Developers include the library in their project, provide the text to encode, and the library generates the QR code as an image, SVG, or HTML table. A live JavaScript demo on the website lets anyone create a QR code by typing text into a box — no installation needed.

The Truthiness Discovery Network (TDN) concept page describes a vision for a public, decentralized system that would track the origin of online media and make trustworthiness information available in real time.

**Key benefits**
- **Eight programming languages**: Choose the language that fits your project
- **Live web demo**: Create QR codes instantly without installing anything
- **Free and open source**: No paid service required
- **Multiple output formats**: Image, SVG, HTML table, or ASCII
- **Based on official standard**: Reliable, standards-compliant QR code generation
- **Concept page included**: Explores ideas about media trustworthiness

**Why it matters**
This project serves as the public face of the biofool GitHub account — it's what visitors see at `biofool.github.io`. The QR code generator is a practical, widely useful tool that has been available for years and serves the developer community. The TDN concept page shows the portfolio's interest in bigger ideas — how technology can address societal challenges like fake news and deep fakes. Together, they present both practical utility and forward-thinking vision.

---

### TDN

**What it is**
The Truthiness Discovery Network — a conceptual proposal for a public, decentralized system that would track the origin of online media content and make trustworthiness information available to viewers in real time, combating deep fakes and fake news.

**Who it's for**
- Technology thinkers and researchers exploring solutions to misinformation
- Policymakers and journalists concerned about media provenance and trust
- Platform designers considering how to surface trustworthiness information to users
- Anyone interested in the challenge of distinguishing real from fake online content

**The problem it solves**
Deep fakes (AI-generated fake videos), manipulated images, and fake news are eroding trust in online media. While organizations exist to detect deep fakes and fact-check claims, there's no public, easily accessible system that tells a viewer — in real time, as they're watching a video or looking at an image — where the content came from, whether it's been manipulated, and what experts say about it. The "truthiness" of online content is invisible to the consumer at the moment they encounter it.

**How it works**
The concept proposes a public ledger — a shared, decentralized record — that tracks the provenance (origin and history) of media content. When content is created, its origin would be recorded in the ledger. When it's modified, the modification would be noted. Fact-checking organizations and deep-fake detection services would add their assessments to the ledger. Media players (video players, image viewers, web browsers) would check the ledger in real time and display trustworthiness information alongside the content — so viewers would see, at a glance, where the content came from and whether experts have verified or flagged it.

**Key benefits**
- **Real-time trustworthiness**: Viewers would see media origin and expert assessments as they view content
- **Decentralized**: No single authority controls the trustworthiness information — it's a public ledger
- **Builds on existing infrastructure**: Leverages existing fact-checking and deep-fake detection organizations
- **Consumer-facing**: Designed to surface information to the viewer, not just to platforms or researchers
- **Provenance tracking**: Follows content from creation through modification, creating a chain of custody

**Why it matters**
TDN represents the portfolio's engagement with one of the most pressing societal challenges of the digital age: how to maintain trust in online media when content can be faked convincingly. While it's a concept rather than a working system, it identifies a critical gap — the missing "public ledger" that would connect existing detection and fact-checking efforts to the consumer's moment of encounter with content. It shows that the portfolio's concerns extend beyond practical tools to the broader implications of technology on society.

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
| System Administration & OS Analysis | 1 | Linux bloat detection & cleanup |
| Text & Content Processing | 1 | Caption correction with learning dictionary |
| Web Apps & Legacy Projects | 4 | Experimental & predecessor projects |
| Templates & Concepts | 3 | Project template & conceptual work |
| **Total** | **29** | |

*Placeholder/empty repos and dropped repos are excluded from this summary.*

# Game Concept: ROUND 13

*Created: 2026-10-13*
*Status: Draft (pillars locked)*

---

## Elevator Pitch

> It's a first-person psychological horror work sim where you process 13 tasks in
> 13 minutes at a PS2-era CRT desk, while mounting clues say this is not your
> first shift, until Management's un-deletable email reveals what you are.

---

## Core Identity

| Aspect | Detail |
| ---- | ---- |
| **Genre** | Psychological horror / liminal space / work simulation |
| **Platform** | Web / Browser (desktop, mouse + keyboard) |
| **Target Audience** | Horror and walking-sim fans, game-jam players and streamers |
| **Player Count** | Single-player |
| **Session Length** | 10-13 minutes (one round) |
| **Monetization** | None (jam entry) |
| **Estimated Scope** | Small (8 hours, solo) |
| **Comparable Titles** | Papers, Please; Severance (TV); The Stanley Parable |

---

## Core Fantasy

You are a diligent employee on a late shift, doing exactly what you're told, and
slowly realizing the job, the room and you yourself are not what they seem. The
promise is the slow dread of competence inside something wrong.

---

## Unique Hook

Like *Papers, Please* in a CRT office, AND ALSO the machine you work on is the
game's real subject: you are the simulation running on the very computer you are
staring at. The look-away mechanic gives that twist a physical cost.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Sensation** | 2 | PS2 low-res look, CRT hum, aggressive keyclacks, flickering tubes |
| **Fantasy** | 4 | The overworked employee persona |
| **Narrative** | 3 | Loop clues across the tasks, culminating in the Management email |
| **Challenge** | 5 | Quota and timer pressure; light, not the focus |
| **Fellowship** | N/A | Single-player |
| **Discovery** | 3 | Per-look room changes, loop clues hidden in the data |
| **Expression** | N/A | None |
| **Submission** | 1 | The numbing rhythm of routine, curdling into dread |

### Key Dynamics
- Players settle into a work rhythm, then notice details that don't fit.
- Players weigh whether a glance behind them is worth the penalty.
- Players start reading the data they're typing rather than just copying it.

### Core Mechanics
1. A fake 2000s OS on the CRT hosting three task apps (spreadsheet, mail client, outreach tool).
2. A 13:00 countdown with quotas of 13 per app.
3. A look-away mechanic: camera pan off the monitor drains time 2x, deducts pay and raises glitching.
4. An escalation script: tasks and room details drift from mundane to uncanny.
5. A fixed final "Management" email, un-deletable, with wording variants by look-away count, then a reset.

---

## Player Motivation Profile

### Primary Psychological Needs Served

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** | The choice to look away and pay for it | Supporting |
| **Competence** | Clearing quotas fast and cleanly | Supporting |
| **Relatedness** | Odd intimacy with the unseen "Management" and prior rounds | Minimal |

### Player Type Appeal (Bartle Taxonomy)
- [x] **Achievers**: clearing every quota inside the timer.
- [x] **Explorers**: reading the data for loop clues, checking behind the chair.
- [ ] **Socializers**
- [ ] **Killers/Competitors**

### Flow State Design
- **Onboarding curve**: The first minute is an unremarkable data-entry tutorial with a visible 13:00 timer.
- **Difficulty scaling**: Quotas are constant; the pressure grows through wrongness and the look-away tax.
- **Feedback clarity**: Pay ticker, quota counters and screen glitching show standing at a glance.
- **Recovery from failure**: A round is 13 minutes; failure restarts the round.

---

## Core Loop

### Moment-to-Moment (30 seconds)
Read a value, type or click, get a small reward (keyclack, row fills, pay ticks).

### Short-Term (5-15 minutes)
Clear a quota of 13 items in one app, then the OS shifts you to the next.

### Session-Level
One 13:00 round across three acts: data entry and inbox, email replies, marketing outreach. Finishing triggers the Management email and the simulation reset.

### Long-Term Progression
None by design. A round is the whole game. Variant ending lines reward a second look.

### Retention Hooks
- **Curiosity**: What each look-away revealed; what the other variant endings say.
- **Investment**: None.
- **Social**: Clip- and stream-friendly twist.
- **Mastery**: Finishing with fewer look-aways.

---

## Game Pillars

### Pillar 1: Mundane, Then Wrong
Every system starts boring and drifts off by tiny degrees.

*Design test*: Choose the quiet implausible detail over the loud scare.

### Pillar 2: The Screen Is the World
About 95% of play happens inside the OS; the room exists for dread, not gameplay.

*Design test*: A new feature goes into the CRT UI before it goes into the 3D room.

### Pillar 3: Looking Costs Something
Every look away has a real, readable price.

*Design test*: The penalty must be felt and visible, never hidden.

### Pillar 4: 13, Everywhere
The number is a quiet tell, never a joke.

*Design test*: Use 13 when it's subtle; cut it when it's winking.

### Anti-Pillars (What This Game Is NOT)
- **NOT jump scares or chase threats**: they would break "Mundane, Then Wrong."
- **NOT a branching narrative**: the ending only varies its wording, to protect the 8-hour budget.
- **NOT real-world data or system access**: the meta twist stays fictional, to protect player trust.

---

## Visual Identity Anchor

- **Direction**: "Everything is slightly too clean and slightly too late."
- **Visual rule**: Low-res render (about 320x240, nearest-neighbor upscale), affine texture wobble, vertex snapping, 15-bit color banding, no anti-aliasing.
- **Supporting principles**:
  1. Only two light sources: the monitor and a flickering fluorescent tube. *Test: if something is lit, justify where the light comes from.*
  2. The dark behind the player is never pure black. *Test: keep a faint readable silhouette for the environment.*
  3. The OS UI is period-accurate and plain, never stylized. *Test: if it wouldn't have shipped in 2002, change it.*
- **Color philosophy**: Sickly green-beige for the room, CRT cyan and white for the screen, red reserved for penalty and the final email.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| Papers, Please | Mundane processing as drama | Horror, not politics | Validates tension from clerical work |
| Severance | Corporate liminal dread | Interactive, player is the subject | Validates the office-as-horror tone |
| The Stanley Parable | Narrator-level meta-commentary | Delivered by an email, not a voice | Validates the meta-twist payoff |

**Non-game inspirations**: Backrooms and liminal-space photography, 2000s office software, PS1/PS2 survival horror camera work.

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | 16-35 |
| **Gaming experience** | Casual to mid-core |
| **Time availability** | A 13-minute sitting |
| **Platform preference** | PC browser |
| **Current games they play** | Short horror and walking-sim games on itch.io |
| **What they're looking for** | A tight, atmospheric experience with a twist |
| **What would turn them away** | Jump-scare spam, long tutorials, a vague ending |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Recommended Engine** | Three.js in the browser, no build step. Godot is not installed, and the DOM suits the in-OS UI. |
| **Key Technical Challenges** | PS2 look (low-res target, vertex snapping), CRT screen as a live UI texture, WebAudio synthesis, three app UIs in the time budget |
| **Art Style** | 3D low-poly, retro |
| **Art Pipeline Complexity** | Low (primitives and procedural textures) |
| **Audio Needs** | Moderate, synthesized in code (room tone, CRT hum, keyclacks) |
| **Networking** | None |
| **Content Volume** | 1 room, 3 apps, about 39 tasks, 1 final email with variants |
| **Procedural Systems** | Procedural number strings and task text only |

---

## Risks and Open Questions

### Design Risks
- The loop clues may be too subtle or too obvious.
- Thirteen minutes of clerical work may bore players before the twist lands.

### Technical Risks
- A CRT screen as live DOM or canvas texture needs a pass for input mapping (mouse to screen UV).
- Procedural audio quality is unproven.

### Market Risks
- Liminal-space horror is crowded. The meta-twist and the look-away tax are the differentiators.

### Scope Risks
- Three polished app UIs plus the 3D scene plus audio in 8 hours is tight. Build in order: room and camera, OS shell, data entry, email client, outreach, finale.

### Open Questions
- Does the look-away penalty read as fair? Resolve in the first playtest.
- How many look-away tiers does the final email need? Start with three.

---

## MVP Definition

**Core hypothesis**: Players stay engaged for 13 minutes of clerical tasks, feel the look-away tax, and land the meta-twist.

**Required for MVP**:
1. 3D desk room with CRT, seated camera and look-away pan.
2. Fake OS shell with three apps: spreadsheet data entry, mail replies, outreach approvals.
3. 13:00 timer, quotas of 13, and the look-away penalty (2x drain, pay deduction, glitch).
4. Escalation script and loop clues.
5. The un-deletable Management email, then the reset.

**Explicitly NOT in MVP** (defer to later):
- Variant ending lines by look-away count (first stretch goal).
- Per-look room changes beyond a couple of set pieces.
- Settings menu, save data, extra task types.

### Scope Tiers (if budget/time shrinks)

| Tier | Content | Features | Timeline |
| ---- | ---- | ---- | ---- |
| **MVP** | 1 room, 3 apps | Core loop, penalty, final email | 6 h |
| **Vertical Slice** | Same | + ending variants, room changes | +1.5 h |
| **Alpha** | n/a (jam) | n/a | n/a |
| **Full Vision** | More tasks, multiple rounds | Meta-persistence across rounds | Post-jam |

---

## Direction Update (2026-10-13): Corporate Cult x Social Rating

Decided mid-production: blend a *Severance*-style corporate-cult office with a
*Nosedive*-style public star rating. Scope chosen: reskin plus the rating
mechanic. Existing tasks are kept, and no new task types are added. Influences
are tonal only; no names, terms or iconography from either show are used.

| Area | Before | Now |
|---|---|---|
| Score | Pay in dollars | Public star rating, 1.00-5.00, starting at 3.13 |
| Mail | Any reply completes the task | Each recipient rates your reply 1-5 stars; the gushing one scores best |
| Look-away | -$0.13/s and a lapse dialog | -0.04 stars/s and a lapse dialog ("Everyone can see it.") |
| Mistakes | Pay cost (Outreach only) | Rating toasts ("Compliance rated you ★····"), plus dread stings on Ledger and Outreach |
| Office look | Dark and flickering throughout | Starts overlit and sterile (green carpet, white partitions); dims with shift time and a falling rating |
| Finale | Pay reinvested | Rating decides the fate line; five stars means "kept exactly as you are, forever" |

**Pillar 3** ("Looking Costs Something") now costs stars. Added fifth pillar:

### Pillar 5: Be Seen Well
Every action is judged by someone, and the judgement is public.

*Design test*: When a choice is purely functional, give it a social rating.

**Anti-pillar amendment (horror payoff)**: "NOT jump scares" becomes **"NOT
cheap or frequent scares: exactly one, earned."** The dread now builds to a
single scare at the climax of the finale:

- **Foreshadowing:** on the first CRT blackout (4th Ledger error or 1st wrong
  Outreach call), the dark glass reflects the office behind the player, with a
  tall figure far down the aisle. Turning around shows nothing; the figure only
  exists in reflections and on camera.
- **Exit interview:** the reveal is now a rated chat with Management, one beat
  at a time. A webcam on the monitor shows the player's chair, which is always
  empty. The figure approaches across beats (aisle, two cubicles back, then
  bent over the chair). Management lifts the look-away penalty ("It's free now")
  to tempt the player to turn.
- **The hit:** silence, every light dies, the face fills the CRT with the
  sting, and the figure is now physically behind the chair. Turning around
  meets its face at eye height.
- A content note on the title screen: "Contains one sudden scare."

**Visual Identity Anchor amendment**: the "slightly too clean" rule now opens
the round literally, as bright and sterile. Darkness is earned through time and
a falling rating, not given up front. Dread lights-out stings still go fully dark.

---

## Next Steps

- [ ] Run `/setup-engine` (Three.js, browser)
- [ ] Run `/art-bible`
- [ ] `/map-systems`, then `/design-system` per system
- [ ] `/create-architecture`, then `/architecture-review`
- [ ] `/gate-check`

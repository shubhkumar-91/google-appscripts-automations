# 🚀 Google Apps Script Automations

Welcome to my personal monorepo for Google Apps Script (GAS) automations!

### 🧠 The Mindset
Tech should work for us, not the other way around. As someone who spends a lot of time architecting scalable workflows and thinking deeply about system optimization, I realized there was a disconnect in how I handled my own daily schedule. I was spending too much mental energy doing manual, repetitive tasks—like calculating commute times, checking traffic, and updating my calendar.

I treat personal life inefficiencies like technical debt. This repository is my ongoing project to eliminate that friction. I build these scripts with a highly analytical, almost detective-like approach: identify the bottleneck, map the edge cases, and deploy a self-healing, automated solution.

### 🎯 The Goal
The primary goal of this repo is to house "Quality of Life" (QoL) improvements. These aren't just simple macros; they are robust, stateful automations designed with dynamic triggers, race-condition safeguards, and clean architecture.

Feel free to borrow, adapt, or get inspired to build your own digital assistants!

### 📂 Repository Structure
This is structured as a monorepo, keeping each automation isolated in its own domain:


```text
google-appscripts-automations/
│
├── google-calendar/       # Smart calendar & auto-commute logic
│   ├── code.gs
│   └── properties         # Configuration variables
│
├── .gitignore
├── CHANGELOG.md           # Version history
├── LICENSE                # MIT License
└── README.md              # You are here
```

<details open>
<summary>
<h3 style="display: inline-block;"> 📅 Google Calendar - 🚀 Smart Auto-Commute</h3>
</summary>

### 💡 The "Why" & The Impact
We’ve all been there: you book an appointment, buy movie tickets, or schedule a doctor's visit. But the event time isn't when you need to be ready—it's just when the event starts. You have to manually calculate drive time, account for traffic, add a buffer to get ready, and mentally block that time out.

I built this script to entirely remove that mental load. This automation acts as a background worker. Whenever an event with a physical location is added to my calendar, it automatically calculates the transit time via Google Maps, factors in preparation time, and visually blocks out my commute directly on my calendar. It operates quietly, efficiently, and completely hands-free.

### ✨ Key Features
* **Intelligent Routing:** Uses Google Maps service to calculate real-time driving or transit durations between an origin and the event destination.
* **Smart Filtering:** Automatically ignores events with blacklisted keywords (e.g. flights, hotels, `#nocommute`, `#skip`) or specific event color, and checks if a commute block already exists to prevent duplicates.
* **Custom Overrides via Regex:** If you are traveling or need a specific setup, simply add tags to your event description! The script parses:
  * `Start: <Location>` or `Origin: <Location>` to override the default home address. (Also supports custom aliases using the `CITY_PLACES_MAP`: `home` | `work` | `office` | `airport` | `hotel` | `default`). If `MULTI_ORIGIN` is set to `true`, you can add this tag multiple times on separate lines to generate multiple distinct commutes for different people!
  * `Destination: <Location>` or `EndLocation: <Location>` to set a custom destination for after-commutes. (Also supports multi-destinations if enabled).
  * `ArriveBuffer: <mins>` / `ArriveTime: <mins>`, `PrepBuffer: <mins>` / `PrepTime: <mins>`, and `PostPrepBuffer: <mins>` / `AfterPrepTime: <mins>` to dynamically alter preparation times (all numbers are evaluated as minutes). *Note: If these are already defined for the event category in `EVENT_BUFFERS_MAP`, these tags can be omitted.*
* **Smart After-Commutes:** For events like flights or hotel stays, it creates a `🚕 After-Commute` block starting *after* the event finishes. For flights, it intelligently extracts the arrival airport directly from the event title / description combined (e.g., "Flight to New York") to use as your precise starting location, mapping you seamlessly to your local hotel/home! Unlike the `SKIP_FLAG` blacklist, `AFTER_COMMUTE_KEYWORDS` acts as a whitelist. Including `#aftercommute`, `#return` or `#drivehome` in any event's description will explicitly tell the script to create an after-commute event for it.
* **Transit Mode:** Include `#transit`, `#metro`, `#bus`, or `#train` in the event title or description to calculate public transit durations instead of driving.
* **Shared Calendar Support:** Automatically monitors and blocks commutes for events added to any configured shared or secondary calendars (e.g. Family calendars).
* **Smart Attendee Sync:** Automatically copies guests (attendees) from the source event over to the created commute block, ensuring everyone is kept in the loop!
* **Rich UI in Calendar:** Generates clean HTML descriptions for the commute event, utilizing emojis (🚗, 🚈, 🚩, 🏃🏻) for a quick, readable breakdown of travel and prep time.
> 📱 **Note for Apple Calendar Users:** If you invite friends who use the native Apple Calendar app on iOS/macOS, Apple's strict security filters temporarily hide rich HTML formatting (like emojis and bullet points) from *pending/unaccepted* calendar invites. The commute block description will appear blank initially. Once they tap **"Accept"**, Apple syncs directly with Google and renders the beautiful rich UI! Alternatively, friends using the official Google Calendar app on iOS will see the perfect formatting immediately, bypassing this Apple quirk entirely.
* **Bulletproof Trigger Architecture:** Uses a dual-trigger system. An `onCalendarUpdate` trigger catches immediate changes, while a "Nightly Sweeper" time-driven trigger efficiently manages events scheduled far in the future, bypassing Google's strict trigger quotas.
* **Configurable Debounce Logic:** Handles rapid successive calendar updates gracefully by dynamically creating and clearing execution timers to avoid redundant API calls.

> ⚠️ **Note on Multi-Origin & Attendee Sync:** If you enable the `MULTI_ORIGIN` property and specify multiple start points (e.g., generating one commute from your house, and a second commute from your friend's house), the script will successfully generate distinct commute events for both routes. However, because of the **Smart Attendee Sync** feature, *all* attendees on the original event will be invited to *all* generated commute blocks. Both you and your friend will see both drives on your respective calendars. Use this feature when you are okay with slightly more calendar visibility/overlap!

### 🕰️ The "Two-Trigger" Architecture
Google Apps Script has a hard quota limit of 20 triggers per user. Naively creating a dynamic trigger for every single future calendar event (e.g., appointments booked months in advance) would quickly crash the script. To make this system flawless and infinitely scalable, I engineered a highly efficient "Two-Trigger" architecture:

**1. The Scout & Scheduler (`markCalendarDirty`)**
This acts as the watcher, powered by static triggers:
* **Event-Driven (`onCalendarUpdate`):** Catches any real-time additions or modifications made to your Primary and Shared calendars immediately. *(Note: You must run `setCalendarUpdateTriggers()` once manually to programmatically attach these watchers).*
* **Time-Driven ("The Nightly Sweeper"):** Runs once daily between `04:00 AM - 05:00 AM`. Instead of setting dozens of individual triggers for events weeks away, this sweep simply wakes up and checks if any of those distant events have finally entered our rolling 4-day action window.

**2. The Worker (`processedDeferredCommute`)**
* **The Dynamic Debounce:** The Worker has NO permanent triggers. When the Scout detects valid events, it programmatically creates a single, temporary time-driven trigger to run the Worker a few minutes later (configurable via properties). If multiple calendar edits are made rapidly, the script deletes the old trigger and resets the timer. This debounce ensures that even if I edit 5 events in 3 minutes, the heavy lifting only happens *once*.
* **Trigger Muting (Recursive Loop Preventer):** When the Worker actually processes events and adds new Commute blocks, those additions would normally fire another calendar update trigger! To prevent this recursive loop, the Worker temporarily **mutes** all `onCalendarUpdate` triggers while it runs, and seamlessly reinstalls them once finished.

### ⚙️ Configuration & Script Properties
The script relies on the following variables stored in `PropertiesService.getScriptProperties()`:

| Property Key | Description | Default / Example |
| :--- | :--- | :--- |
| `HOME_ADDRESS` | The default starting point for commute calculations. | `"123 Main St, New York, NY"` |
| `CALENDAR_DIRTY` | State flag to manage execution flow. | `"false"` |
| `CALENDAR_SCRIPT_RUNNING` | Process lock to avoid race conditions. | `"false"` |
| `WORKER_DEBOUNCE_TIMER` | Time (in minutes) to wait after the last calendar update before executing. | `5` |
| `ARRIVAL_BUFFER` | Default target arrival time before the event starts (in minutes). | `20` |
| `PREP_BUFFER` | Default buffer time required to get ready (in minutes). | `15` |
| `EVENT_BUFFERS_MAP` | JSON mapping keywords to specific arrival and prep times (all values are evaluated in minutes). | *See example below* |
| `LOOK_AHEAD_DAYS` | Number of days to look ahead for scheduling commutes. | `4` |
| `SKIP_FLAG` | Comma-separated list of keywords to ignore. | `"#nocommute, #skip, Flight, Hotel"` |
| `AFTER_COMMUTE_KEYWORDS` | Comma-separated list of keywords that trigger an After-Commute instead of a pre-commute. | `"#aftercommute, #return, #drivehome, Flight, Airport, Hotel"` |
| `SHARED_CALENDAR_NAMES` | Comma-separated list of shared/secondary calendars to monitor (matches against the Calendar's Name / Title). | `"Parents Calendar, Family"` |
| `MULTI_ORIGIN` | Boolean flag to enable generating multiple commute events from multiple start points or to multiple destinations for a single event. | `false` |
| `CITY_PLACES_MAP` | JSON mapping for dynamic start/end locations by city. | *See example below* |
| `SKIP_COLOR_CODE` | The Calendar API color ID used to manually flag an event to be ignored by the script. | `"11"` (Tomato) |

**Example `CITY_PLACES_MAP` JSON:**
If you travel frequently, you can define different home bases depending on the city the event is in. The script matches the event location's city to this map. You can use unique place keywords, the script uses `Maps` service to resolve the start address.
```json
{
  "default": "Blue Ridge Phase 1 Hinjawadi",
  "delhi": {
    "home": "Sector 22, Dwarka, New Delhi, Delhi 110075",
    "default": "Taj Palace, New Delhi"
  },
  "mumbai": {
    "home": "shanti niketan jp road andheri west",
    "work": "we work vaswani chambers worli",
    "hotel": "Trident Hotel, Bandra Kurla"
  }
}
```

**Example `EVENT_BUFFERS_MAP` JSON:**
Overrides the default `ARRIVAL_BUFFER` and `PREP_BUFFER` automatically based on keywords found in the event title or description using a dynamic regex.
```json
{
  "flight": { "arrive": 120, "prep": 30, "postPrep": 45 },
  "airport": { "arrive": 120, "prep": 30, "postPrep": 45 },
  "train": { "arrive": 45, "prep": 20 },
  "default": { "arrive": 20, "prep": 15, "postPrep": 15 }
}
```

#### 🎨 Manual Override via Event Color
If you have a specific one-off event (like a connecting layover flight) that you want the script to completely ignore, you can simply change the event color in your Google Calendar UI. The script will skip any event matching the `SKIP_COLOR_CODE` property.

**Valid Color IDs:**
* `1` : Lavender (Pale Blue)
* `2` : Sage (Pale Green)
* `3` : Grape (Mauve)
* `4` : Flamingo (Pale Red)
* `5` : Banana (Yellow)
* `6` : Tangerine (Orange)
* `7` : Peacock (Cyan)
* `8` : Graphite (Gray) ⚠️ *See note below*
* `9` : Blueberry (Blue)
* `10` : Basil (Green)
* `11` : Tomato (Red) - **[Default]** for skipping events

<br>

> ⚠️ **Note on Flights & Airports:** `Flight` is included in the `SKIP_FLAG` blacklist by default because flight events typically mark the exact flight duration, making a standard pre-commute block impractical. However, thanks to the **After-Commute** logic, the script intelligently intercepts flight events via the `AFTER_COMMUTE_KEYWORDS` config. It skips the useless pre-commute and automatically generates a `🚕 After-Commute` starting *after* you land, routing you from the destination airport straight to your local `CITY_PLACES_MAP` home/hotel!

> ⚠️ **Note on Graphite (Gray):** While you can configure the script to use `"8"` as the skip color, it is highly recommended to use another color. The script automatically creates the actual "🚗 Commute" events using this exact Gray color code to keep your calendar visually clean. Using it as a skip flag could cause confusion!

### 🧠 Logic & Thought Process
This script is broken down into 8 core functions, prioritizing separation of concerns:
1. **`getEventsFiltered()`**: Fetches events across primary and matching shared calendars within a highly specific, rolling 4-day EOD (End of Day) window.
2. **`markCalendarDirty()`**: The watcher. Bound to calendar updates and a nightly time-driven trigger. It evaluates if the calendar requires processing and manages the dynamic debounce trigger.
3. **`processedDeferredCommute()`**: The worker. Takes the process lock, initiates the sync, and resets the system state.
4. **`syncCommuteFinal(eventMap)`**: The orchestrator. Iterates through the map of valid events across primary and shared calendars, managing the creation pipeline (including the copying of attendees).
5. **`getTrafficAdjustedStartTime(...)` & `getAfterCommuteTimes(...)`**: The calculators. Interfaces with the Maps API to compute accurate travel estimates (both backward from event start, and forward from event end) and returns formatted JSON data containing final commute metrics and rich HTML descriptions.
6. **`alreadyHasCommute(...)`**: A robust guardian function that provides a final safety check against duplicating commute blocks. By evaluating specific event timeframes, it cleanly isolates and verifies pre-commutes and after-commutes independently.
7. **`resolveLocation(...)`**: Determines the correct start/end locations by evaluating regex tags, city places mapping, and defaults.
8. **`setCalendarUpdateTriggers()` & `removeAllCalendarUpdateTriggers()`**: Utilities that programmatically manage the lifecycle of `onCalendarUpdate` triggers across your primary and shared calendars to prevent recursive execution loops.

*Note: Ensure your `appsscript.json` manifest file has the correct `timeZone` configured (e.g., "Asia/Kolkata") for accurate EOD window boundary calculations!*

</details>

<br>

### 🔭 Future Scope

Whenever I encounter a daily workflow that can be logically automated via the Google Workspace ecosystem (Gmail, Drive, Sheets, etc.), the solution will live here.

---

# 🗓️ Smart Calendar Commute Automation

### 💡 The "Why" & The Impact
We’ve all been there: you book an appointment, buy movie tickets, or schedule a doctor's visit. But the event time isn't when you need to be ready—it's just when the event starts. You have to manually calculate drive time, account for traffic, add a buffer to get ready, and mentally block that time out.

I built this script to entirely remove that mental load. This automation acts as a background worker. Whenever an event with a physical location is added to my calendar, it automatically calculates the transit time via Google Maps, factors in preparation time, and visually blocks out my commute directly on my calendar. It operates quietly, efficiently, and completely hands-free.

### ✨ Key Features
* **Intelligent Routing:** Uses Google Maps service to calculate real-time driving or transit durations between an origin and the event destination.
* **Smart Filtering:** Automatically ignores events with blacklisted keywords (e.g., flights, hotels, `#nocommute`) and checks if a commute block already exists to prevent duplicates.
* **Custom Overrides via Regex:** If you are traveling or need a specific setup, simply add tags to your event description! The script parses:
  * `Start: <Location>` or `Origin: <Location>` to override the default home address. (Also supports custom aliases like `Origin: work` or `home` using the `CITY_ORIGINS_MAP`).
  * `ArriveBuffer: <mins>` / `ArriveTime: <mins>` and `PrepBuffer: <mins>` / `PrepTime: <mins>` to dynamically alter preparation times (all numbers are evaluated as minutes).
* **Transit Mode:** Include `#transit`, `#metro`, `#bus`, or `#train` in the event title or description to calculate public transit durations instead of driving.
* **Shared Calendar Support:** Automatically monitors and blocks commutes for events added to any configured shared or secondary calendars (e.g. Family calendars).
* **Rich UI in Calendar:** Generates clean HTML descriptions for the commute event, utilizing emojis (🚗, 🚈, 🚩, 🏃🏻) for a quick, readable breakdown of travel and prep time.
* **Bulletproof Trigger Architecture:** Uses a dual-trigger system. An `onCalendarUpdate` trigger catches immediate changes, while a "Nightly Sweeper" time-driven trigger efficiently manages events scheduled far in the future, bypassing Google's strict trigger quotas.
* **Configurable Debounce Logic:** Handles rapid successive calendar updates gracefully by dynamically creating and clearing execution timers to avoid redundant API calls.

### 🕰️ The "Two-Trigger" Architecture
Google Apps Script has a hard quota limit of 20 triggers per user. Naively creating a dynamic trigger for every single future calendar event (e.g., appointments booked months in advance) would quickly crash the script. To make this system flawless and infinitely scalable, I engineered a highly efficient "Two-Trigger" architecture:

**1. The Scout & Scheduler (`markCalendarDirty`)**
This acts as the watcher, powered by static triggers:
* **Event-Driven (`onCalendarUpdate`):** Catches any real-time additions or modifications made to the calendar immediately. *(Note: To enable this for shared calendars, you must run `setCalendarUpdateTriggers()` once to programmatically attach these watchers).*
* **Time-Driven ("The Nightly Sweeper"):** Runs once daily between `04:00 AM - 05:00 AM`. Instead of setting dozens of individual triggers for events weeks away, this sweep simply wakes up and checks if any of those distant events have finally entered our rolling 4-day action window.

**2. The Worker (`processedDeferredCommute`)**
* **The Dynamic Debounce:** The Worker has NO permanent triggers. When the Scout detects valid events, it programmatically creates a single, temporary time-driven trigger to run the Worker a few minutes later (configurable via properties). If multiple calendar edits are made rapidly, the script deletes the old trigger and resets the timer. This debounce ensures that even if I edit 5 events in 3 minutes, the heavy lifting only happens *once*.

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
| `SKIP_FLAG` | Comma-separated list of keywords to ignore. | `"#nocommute, Flight, Hotel"` |
| `SHARED_CALENDAR_NAMES` | Comma-separated list of shared/secondary calendars to monitor (matches against the Calendar's Name / Title). | `"Parents Calendar, Family"` |
| `CITY_ORIGINS_MAP` | JSON mapping for dynamic start locations by city. | *See example below* |

**Example `CITY_ORIGINS_MAP` JSON:**
If you travel frequently, you can define different home bases depending on the city the event is in. The script matches the event location's city to this map. You can use unique place keywords, the script uses `Maps` service to resolve the start address.
```json
{
  "default": "Blue Ridge Phase 1 Hinjawadi",
  "delhi": {
    "home": "Sector 22, Dwarka, New Delhi, Delhi 110075"
  },
  "mumbai": {
    "home": "shanti niketan jp road andheri west",
    "work": "we work vaswani chambers worli"
  }
}
```

**Example `EVENT_BUFFERS_MAP` JSON:**
Overrides the default `ARRIVAL_BUFFER` and `PREP_BUFFER` automatically based on keywords found in the event title or description using a dynamic regex.
```json
{
  "flight": { "arrive": 120, "prep": 30 },
  "airport": { "arrive": 120, "prep": 30 },
  "train": { "arrive": 45, "prep": 20 },
  "default": { "arrive": 20, "prep": 15 }
}
```
> **💡 Note on Flights & Airports:** `Flight` is included in the `SKIP_FLAG` blacklist by default. This is because flight events from Gmail usually mark the exact departure time, making a standard commute block impractical to reach "just in time". However, if you prefer the script to manage airport commutes, simply remove `Flight` from your `SKIP_FLAG` property and use the `EVENT_BUFFERS_MAP` (as shown above) to assign a large arrival buffer (e.g., 120 minutes) so you reach the airport well before departure.

### 🧠 Logic & Thought Process
This script is broken down into 8 core functions, prioritizing separation of concerns:
1. **`getEventsFiltered()`**: Fetches events across primary and matching shared calendars within a highly specific, rolling 4-day EOD (End of Day) window.
2. **`markCalendarDirty()`**: The watcher. Bound to calendar updates and a nightly time-driven trigger. It evaluates if the calendar requires processing and manages the dynamic debounce trigger.
3. **`processedDeferredCommute()`**: The worker. Takes the process lock, initiates the sync, and resets the system state.
4. **`syncCommuteFinal(eventMap)`**: The orchestrator. Iterates through the map of valid events across primary and shared calendars, managing the creation pipeline.
5. **`getTrafficAdjustedStartTime(...)`**: The calculator. Interfaces with Maps API and returns formatted JSON data containing the final commute metrics and rich HTML description.
6. **`alreadyHasCommute(...)`**: A simple guardian function to provide a final safety check against duplicating commute blocks in the target calendar.
7. **`findOrigin(...)`**: Determines the correct starting location by evaluating regex tags, city origins mapping, and defaults.
8. **`setCalendarUpdateTriggers()`**: A one-time setup utility that programmatically attaches update triggers to all your configured shared calendars.

*Note: Ensure your `appsscript.json` manifest file has the correct `timeZone` configured (e.g., "Asia/Kolkata") for accurate EOD window boundary calculations!*

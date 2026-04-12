# 🗓️ Smart Calendar Commute Automation

### 💡 The "Why" & The Impact
We’ve all been there: you book an appointment, buy movie tickets, or schedule a doctor's visit. But the event time isn't when you need to be ready—it's just when the event starts. You have to manually calculate drive time, account for traffic, add a buffer to get ready, and mentally block that time out. 

I built this script to entirely remove that mental load. This automation acts as a background worker. Whenever an event with a physical location is added to my calendar, it automatically calculates the transit time via Google Maps, factors in preparation time, and visually blocks out my commute directly on my calendar. It operates quietly, efficiently, and completely hands-free.

### ✨ Key Features
* **Intelligent Routing:** Uses Google Maps service to calculate real-time driving or transit durations between an origin and the event destination.
* **Smart Filtering:** Automatically ignores events with blacklisted keywords (e.g., flights, hotels, `#nocommute`) and checks if a commute block already exists to prevent duplicates.
* **Custom Overrides via Regex:** If you are traveling or need a specific setup, simply add tags to your event description! The script parses:
  * `Start: <Location>` or `Origin: <Location>` to override the default home address.
  * `arriveBuffer: <mins>` and `prepBuffer: <mins>` to dynamically alter preparation times.
* **Rich UI in Calendar:** Generates clean HTML descriptions for the commute event, utilizing emojis (🚗, 🚈, 🚩, 🏃🏻) for a quick, readable breakdown of travel and prep time.
* **Bulletproof Trigger Architecture:** Uses a dual-trigger system. An `onCalendarUpdate` trigger catches immediate changes, while a "Nightly Sweeper" time-driven trigger efficiently manages events scheduled far in the future, bypassing Google's strict trigger quotas.
* **Configurable Debounce Logic:** Handles rapid successive calendar updates gracefully by dynamically creating and clearing execution timers to avoid redundant API calls.

### ⚙️ Configuration & Script Properties
The script relies on the following variables stored in `PropertiesService.getScriptProperties()`:

| Property Key | Description | Default / Example |
| :--- | :--- | :--- |
| `homeAddress` | The default starting point for commute calculations. | `"Your Full Address"` |
| `CALENDAR_DIRTY` | State flag to manage execution flow. | `"false"` |
| `SCRIPT_RUNNING` | Process lock to avoid race conditions. | `"false"` |
| `WORKER_DEBOUNCE_TIMER` | Time (in minutes) to wait after the last calendar update before executing. | `8` |

### 🧠 Logic & Thought Process
This script is broken down into 6 core functions, prioritizing separation of concerns:
1. **`getEventsFiltered()`**: Fetches events within a highly specific, rolling 4-day EOD (End of Day) window.
2. **`markCalendarDirty()`**: The watcher. Bound to calendar updates and a nightly 1:00 AM trigger. It evaluates if the calendar requires processing and manages the dynamic debounce trigger.
3. **`processedDeferredCommute()`**: The worker. Takes the process lock, initiates the sync, and resets the system state.
4. **`syncCommuteFinal(eventsList)`**: The orchestrator. Iterates through valid events and manages the creation pipeline.
5. **`getTrafficAdjustedStartTime(...)`**: The calculator. Interfaces with Maps API and returns formatted JSON data containing the final commute metrics and rich HTML description.
6. **`alreadyHasCommute(...)`**: A simple guardian function to provide a final safety check against duplicating commute blocks.

*Note: Ensure your `appsscript.json` manifest file has the correct `timeZone` configured (e.g., "Asia/Kolkata") for accurate EOD window boundary calculations!*

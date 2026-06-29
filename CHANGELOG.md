# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-06-28

### Added
- **Targeted After-Commute Bypass:** Added support for `#noaftercommute` and `#skipaftercommute` tags in event descriptions. This allows users to selectively abort the generation of an After-Commute block while leaving the Pre-Commute block intact (e.g., airport drop-offs).
- **Apple Calendar Compatibility Note**: Added guidance in `README.md` explaining how Apple's native calendar invite security filters affect rich HTML description visibility on pending invites.

### Fixed
- **Automatic Google Meet Link Removal**: Configured the script to programmatically strip auto-generated Google Meet video conference links from commute events using `Calendar.Events.patch` when attendee invitations are synced.

## [0.6.0] - 2026-05-23

### Added
- **Multi-Origin & Multi-Destination Routing**: Added the `MULTI_ORIGIN` configuration property. When enabled (`true`), the script parses multiple `Origin:` and `Destination:` tags in descriptions to generate distinct commutes/after-commutes. Title prefixes dynamically include indices (e.g., `🚗 Commute (1):`, `🚗 Commute (2):`) to ensure individual tracking.
- **Start Location in Descriptions**: Commute events (both pre and post commutes) now explicitly include the resolved starting location directly in the calendar description for quick-glance reference.

### Fixed
- **Commute Duplicate Guard**: Updated `alreadyHasCommute` to check exact titles (including multi-origin index prefixes like `🚗 Commute (1):`) during event generation. This prevents concurrent commutes from skipping one another and avoids duplicate events on subsequent calendar syncs.
- **Description HTML Stripping**: Cleaned and stripped HTML tags (such as `<ul>`, `<li>`, `<br>`) from descriptions within `syncCommuteFinal` to ensure regex-based override parsing (e.g., `Start:` / `Origin:`) is highly robust.

## [0.5.1] - 2026-05-22

### Fixed
- **Calendar Filtering & Trigger Resolution**: Unified calendar filtering logic in `getEventsFiltered` and `setCalendarUpdateTriggers` using the native `primary` calendar flag. This resolves sync failures on Workspace admin accounts downgraded to standard accounts. Removed redundant primary calendar unshifting.

## [0.5.0] - 2026-05-18

### Added
- **Trigger Muting**: Added recursive-loop prevention by muting (`removeAllCalendarUpdateTriggers`) and restoring (`setCalendarUpdateTriggers`) calendar updates during event generation.
- **Primary Calendar Support**: Integrated the primary calendar ID directly into update trigger cycles.
- **Color-Code Skipping**: Added `SKIP_COLOR_CODE` (default `'11'` Tomato) to ignore calendar events by changing their color.
- Included `Flight` in the default `SKIP_FLAG` blacklist.

### Changed
- Decreased default debounce timer from `8` to `5` minutes.
- **Documentation Overhaul**: Consolidated all docs by merging the nested calendar README into the root `README.md` using collapsible `<details>`.

## [0.4.0] - 2026-05-12

### Added
- **Smart After-Commutes**: Added `🚕 After-Commute` support via `AFTER_COMMUTE_KEYWORDS` for return drives or post-flight transits.
- **Flight Extraction Engine**: Added title parsing regex to extract arrival airports from "Flight to XYZ" events to set after-commute origins.

### Changed
- **Code Refactor**: Merged `findOrigin` and `findDestination` into `resolveLocation`, and renamed `CITY_ORIGINS_MAP` to `CITY_PLACES_MAP`.

### Fixed
- **Duplicate Prevention**: Replaced string-state tracking in `alreadyHasCommute` with robust, time-bound boolean evaluations to cleanly isolate overlap queries.

## [0.3.0] - 2026-05-11

### Added
- **Attendee Syncing**: Script automatically invites guests from source events to the generated commute blocks.
- **Security**: Added `.gitignore` configurations to prevent pushing private tokens or keys.

## [0.2.0] - 2026-05-04

### Added
- **Dynamic Event Buffers**: Added `EVENT_BUFFERS_MAP` to support custom arrival and prep buffers based on keywords (e.g., flights).

### Fixed
- Streamlined internal calendar execution logs.

## [0.1.0] - 2026-04-26

### Added
- **Shared Calendar Network**: Added support to fetch/aggregate events from secondary and shared calendars.
- **Location Resolution**: Resolved origins dynamically using `CITY_ORIGINS_MAP` values based on the event's city.

## [0.0.1] - 2026-04-12

### Added
- Initial project creation.
- Developed the optimized Scout/Worker "Two-Trigger" architecture to scale under Google's 20-trigger quota.
- Integrated Google Maps API (`newDirectionFinder()`) for real-time driving/transit time calculations.

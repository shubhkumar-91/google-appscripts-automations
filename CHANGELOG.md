# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.5.1] - 2026-05-22
### Fixed
- **Calendar Filtering & Trigger Resolution**: Unified and simplified calendar filtering logic across both `getEventsFiltered` and `setCalendarUpdateTriggers` using the API-native `primary` boolean flag. This resolves a critical edge case where Google Workspace admin accounts downgraded to standard accounts detach the session email from the primary calendar ID, causing event synchronization and update trigger re-attachment failures. Removed redundant manual primary calendar unshifting logic.

## [0.5.0] - 2026-05-18
### Added
- **Trigger Muting**: Implemented advanced logic to temporarily mute (`removeAllCalendarUpdateTriggers`) and safely restore (`setCalendarUpdateTriggers`) update watchers during script execution. This successfully intercepts and completely prevents recursive update loops when commute blocks are being created on the calendar.
- **Primary Calendar Support**: Programmatically integrated the primary calendar ID directly into the update trigger cycle.
- **Color-Code Skipping**: Introduced `SKIP_COLOR_CODE` (default: `'11'` Tomato) to give users manual UI control over ignoring one-off, un-editable events (e.g., connecting flights via Gmail) simply by changing their color in the calendar.
- Included `Flight` in the default `SKIP_FLAG` blacklist.

### Changed
- Decreased the worker debounce timer default value from `8` to `5` minutes.
- **Documentation Overhaul**: Consolidated repository documentation by merging the `google-calendar/README.md` into the root-level `README.md`.
- Implemented a scalable, collapsible `<details>` structure in the root README. This sets the stage for future automation scripts (like Sheets or Docs) to be cleanly housed in the same monorepo without cluttering the primary landing page.
- Updated repository file tree diagram to accurately reflect the removal of the nested README and inclusion of the `CHANGELOG.md` and configuration files.

## [0.4.0] - 2026-05-12
### Added
- **Smart After-Commutes**: Built dual-event support (`🚕 After-Commute`) utilizing `AFTER_COMMUTE_KEYWORDS`. The script can now generate return commutes or post-flight transits *after* an event concludes.
- **Flight Extraction Engine**: Built sophisticated regex parsing to automatically extract arrival airports from standard "Flight to XYZ" event titles, accurately pinpointing the exact origin for after-commutes.

### Changed
- **Code Refactor**: Merged `findOrigin` and `findDestination` into a unified, scalable `resolveLocation` utility function.
- Renamed property `CITY_ORIGINS_MAP` to `CITY_PLACES_MAP` for better clarity representing both origins and destinations.

### Fixed
- **Bugfix (`alreadyHasCommute`)**: Replaced a complex string-state tracker with highly robust, time-bound boolean evaluations. This flawlessly handles race conditions and prevents generating overlapping concurrent pre/post commute blocks.

## [0.3.0] - 2026-05-11
### Added
- **Attendee Syncing**: The script now intelligently grabs all non-self guests from source events and invites them directly to the generated commute event block.
- **Security**: Added `.gitignore` rules to safeguard private API tokens and configurations from being pushed to remote tracking.

## [0.2.0] - 2026-05-04
### Added
- **Dynamic Event Buffers**: Introduced `EVENT_BUFFERS_MAP` to automatically apply distinct arrival and preparation buffers based on event-type keywords (e.g. allocating 120 minutes specifically for flights instead of the standard 20-minute buffer).
- Expanded README with deep-dives into Airport Commute configurations.

### Fixed
- Updated and streamlined internal calendar execution logging to utilize correct event summaries.

## [0.1.0] - 2026-04-26
### Added
- **Shared Calendar Network**: Engineered scalable support allowing the script to fetch and aggregate event arrays from multiple shared or family calendars.
- **Location Resolution System**: Implemented dynamic origin resolution to pull accurate start locations from `CITY_ORIGINS_MAP` based on the specific city an event is located in.

## [0.0.1] - 2026-04-12
### Added
- Initial project creation and commit.
- Developed the foundational highly optimized "Two-Trigger" (Scout/Worker) architecture to scale infinitely within Google's strict 20-trigger quota.
- Integrated Google Maps API (`newDirectionFinder()`) for real-time traffic and transit analytics.
- Deployed initial structural `README.md` defining configuration requirements.

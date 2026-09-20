# Changelog

## [0.2.0] - 2026-09-20

### Added

- Added a lightweight Wynntils cape catalog with fast global search, filtering, and sorting without downloading the full cape collection.
- Added skin-matched cape recoloring that derives its palette from the visible chest and arm textures while ignoring the head and cape-covered back of the torso.
- Added support for saving recolored results as new capes while preserving the original cape, brightness relationships, and transparency.
- Added reviewed cape lettering and catalog design grouping.

### Fixed

- Fixed lazy-loaded cape previews remaining blank by observing their sized preview frames.
- Kept animated and oversized capes read-only where editing could destroy animation or texture data.

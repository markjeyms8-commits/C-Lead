# Agreed classroom UI

The two user-supplied boards in `src/assets/mascot/references/` are the visual source of truth. The initial geometric mascot and large welcome dashboard were implementation placeholders, not the agreed final design.

The November 18 update adopts the reference's forest-green home header, illustrated Ci, pale-green page banners, rounded white cards, prominent primary actions, compact five-tab mobile navigation, grouped member rows, profile settings list, pinned announcement strip and unread notification styling. Desktop retains the existing sidebar and responsive content columns; dark mode uses the established dark palette.

Home prioritizes the classroom feed, with shortcuts and upcoming items in the supporting column (below the feed on mobile). Tasks, attendance, members, notifications and announcement creation share an accessible mascot banner. Comments retain their existing moderation, replies and reactions with initials and conversation-card styling. Attendance summaries count only the currently authorized session records.

Reference names, counts, percentages and dates are not seed data. Existing authorization, forms, translations and services remain authoritative. Administrative review links remain available in Profile. Notification delivery configuration is a separate outstanding task; visual notification styling does not enable push delivery.

The mascot image is bundled and precached for offline use. Both themes switch colors immediately to avoid transient low contrast. Keyboard focus, reduced-motion preferences, localized alternative text, readable empty/error states and existing minimum touch-target sizes are preserved.

Verification uses isolated preview builds and intercepted fictional service fixtures, never the live classroom roster. See `BUILD_STATUS.md` for the completed check results.

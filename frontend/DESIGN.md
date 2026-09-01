# VYUHAM Design System

## Design read

VYUHAM is a dense public-sector investigative application for Indian law-enforcement teams. It uses a calm, accountable records-system language. It must feel official and human-designed, never futuristic or accusatory.

Design dials: variance 3/10, motion 2/10, density 8/10.

## Audience and UX law

Investigators work under time pressure on office desktops, shared laptops, and field tablets. Every screen should make the active case, selected entity, evidence source, verification state, confidence, missing information, and next action clear.

## Visual direction

- Light theme only, optimized for records review and printable briefings.
- Neutral surfaces dominate. Government blue is reserved for interaction and selection.
- Green means verified, amber means review or missing evidence, and red means conflict or critical state.
- Borders establish hierarchy. Shadows are limited to floating overlays.
- No gradients, glass effects, ornamental imagery, or decorative animation.

## Typography

Inter with Segoe UI, Roboto, Arial, and sans-serif fallbacks. Body copy is 14px to preserve density while controls and key content remain at least 16px where appropriate. IDs use a monospace stack.

## Layout and spacing

- Desktop shell: 244px sidebar, 66px top bar, fluid workspace.
- Tablet: collapsible overlay sidebar.
- Mobile: single-column content, horizontal overflow only inside labelled table regions.
- 8px spacing base with 4, 8, 12, 16, 24, 32, 40, and 48px steps.
- Radii: 6px controls, 8px cards, 10px large containers.

## Components

Shared buttons, badges, cards, form controls, headers, tables, banners, tabs, modals, drawers, confidence meters, evidence cards, graph legend, time slider, and pipeline stepper use semantic tokens. Interactive targets are at least 44px where space permits and always keyboard accessible.

## Motion

Motion communicates state only. Hover, selection, tabs, dialogs, and drawers transition in 120 to 200ms. Network playback is user-controlled. Reduced-motion preferences disable nonessential transitions and autoplay.

## Responsive behavior

At 1100px the sidebar becomes an overlay. At 760px page headers, filters, metrics, and split panes stack. Tables retain their semantic structure inside labelled scroll regions. Dialogs and drawers become full-width on compact screens.

## Accessibility

Use landmarks, ordered headings, explicit form labels, visible focus, Escape-close overlays, focus restoration, text equivalents for icons, non-color state labels, reduced motion, and WCAG AA contrast. Destructive identity decisions require confirmation.

## Do and do not

Do use plain investigative language, source IDs, exact timestamps, evidence chains, honest confidence labels, and explicit review actions.

Do not imply guilt, use AI verdict language, hide provenance, encode state only by color, or place sensitive case data in URLs.

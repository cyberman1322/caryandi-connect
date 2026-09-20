# Caryandi Zambia frontend plan

## Goal
Build a polished, mobile-first automotive marketplace frontend for Zambia. The uploaded login design will guide the visual language: clean white surfaces, restrained Facebook-like blue accents, strong dark typography, subtle borders and shadows, compact radii, and familiar controls. The uploaded image will remain a reference rather than appear inside the app.

All data and interactions will be clearly isolated mock frontend behavior. No database, authentication, API, payments, maps connection, verification logic, or security implementation will be added.

## Visual system and shared structure
- Create Caryandi brand styling with a trustworthy automotive feel, accessible contrast, restrained blue accent, neutral backgrounds, and consistent typography, spacing, icons, badges, forms, tables, dialogs, skeletons, and empty/error states.
- Build responsive public navigation and separate dashboard navigation with collapsible desktop sidebar and practical mobile navigation.
- Use high-quality generated automotive imagery for the home page, vehicle inventory, parts, and service profiles; keep all imagery locally managed by the project.
- Create reusable layouts and UI patterns for marketplace cards, profile headers, review summaries, verification states, data tables, search filters, image galleries, message lists, and listing forms.

## Public marketplace pages
- **Home:** marketplace-first home screen with direct vehicle search, popular inventory, service categories, trusted sellers, import routes, and concise Zambia-specific information links.
- **Vehicles:** search results, mobile filter drawer, desktop advanced filters, sorting, grid/list views, saved state, location summary, and loading/empty/error variants.
- **Vehicle details:** photo gallery, price and seller actions, full specifications, condition, mileage, transmission, fuel, engine size, location, registration/import status, documentation, verification interface, seller card, and related listings.
- **Seller profiles:** distinct dealer and private-seller presentations with inventory, verification, location, reviews, ratings, and contact/enquiry interface.
- **Mechanics and servicing:** directory/results view plus detailed mechanic/company profiles showing services, consultation prices, availability, location, reviews, and request-service UI.
- **Parts:** category-led search, filters, listing cards, part detail, seller details, price, condition, location, reviews, and contact UI.
- **Import agents:** directory and profile pages with Zambia routes, supported origins, services, pricing information, verification, reviews, contact, and location.
- **Location discovery:** responsive split list/map interface with an intentionally non-functional Google Maps placeholder and filters for dealers, mechanics, service companies, parts sellers, and agents.
- **Automotive information:** registration, imports, duty/tax, required documents, and import-process pages presented as clear guides, without calculators or real policy logic.
- **Help:** support categories, FAQ/accordion content, and a mock contact form.

## Account entry and profiles
- Build login and registration screens closely inspired by the supplied two-panel reference, adapted to Caryandi automotive imagery and branding.
- Add account-type selection for buyers, private sellers, dealers, mechanics, servicing companies, parts sellers, and import agents.
- Add frontend-only password recovery, verification status, profile editing, settings, and account verification screens.
- Keep form submission handlers as explicit mock adapters so production authentication and validation can replace them cleanly.

## Role-based workspaces
- **Buyer dashboard:** overview, saved vehicles, notifications, messages/enquiries, reviews, profile, and settings.
- **Private seller dashboard:** listing summary, add/edit vehicle flow, photo manager, condition/specification/import fields, listing statuses, enquiries, reviews, profile, and verification.
- **Dealer dashboard:** inventory management, add/edit/remove confirmation UI, listing status tables, enquiries, reviews, dealer profile, team-facing summary, and verification.
- **Mechanic / servicing dashboard:** services, consultation prices, availability, service requests, reviews, business profile, and verification.
- **Parts seller dashboard:** parts inventory, add/edit part listing, categories, condition/price/location, enquiries, reviews, profile, and verification.
- **Import-agent dashboard:** routes and services, add/edit route or service, pricing details, enquiries, reviews, profile, and verification.
- Use one role-aware dashboard shell with mock role switching for frontend review, while keeping each role’s navigation and content distinct.

## Administrator workspace
- Create a dense, professional admin dashboard with platform statistics and management views for users, dealers, private sellers, mechanics, servicing companies, parts sellers, import agents, vehicle listings, verification requests, reports, reviews, and informational content.
- Include reusable search/filter toolbars, status tabs, tables, detail drawers, moderation actions, loading states, empty states, error states, and confirmation dialogs.
- All actions will be visual demonstrations only and will not change persistent data.

## Interaction and mock-data boundary
- Centralize typed mock entities for vehicles, sellers, services, parts, agents, reviews, messages, notifications, and dashboard metrics.
- Centralize replaceable frontend adapters/hooks for search, filters, favourites, forms, messages, listing actions, verification actions, and role selection.
- Support realistic local screen interaction such as filter changes, tabs, drawers, dialogs, gallery selection, favourites, menus, and temporary form feedback without pretending data was saved remotely.
- Label non-connected actions honestly through transient UI feedback where needed, without exposing engineering notes inside the product experience.

## Routes and discoverability
- Give major public areas their own shareable pages, including vehicles, individual listings, sellers, services, parts, import agents, locations, information guides, help, login, and registration.
- Give dashboard and admin areas dedicated nested pages with consistent navigation.
- Add unique titles and descriptions for every content page and ensure all navigation destinations are implemented together.

## Quality checks
- Verify the primary public, account, role dashboard, listing-form, and admin flows at desktop and mobile sizes.
- Check navigation, dialogs, forms, filter drawers, galleries, tables, overflow, long labels, empty/loading/error states, and keyboard-visible focus.
- Confirm the app renders without build or runtime errors and that no backend, external map, authentication, or other real integration has been introduced.

## Technical notes
- TanStack Start routes will remain the page architecture, with reusable React components and the existing component library.
- Tailwind semantic tokens in the global design system will own all colors and theming.
- Lucide icons will provide consistent interface symbols.
- The final structure will separate presentation, mock data, and replaceable hooks/adapters so Claude Code can connect production systems later without rebuilding the UI.

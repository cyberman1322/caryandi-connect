# Caryandi Connect

You are building the frontend UI only for a real production application called Caryandi Zambia.

I will paste a UI/template below. Use it as the main visual reference for the overall design, colors, typography, spacing, buttons, cards, navigation, and layout.

Your responsibility

Build the complete polished UI/frontend for Caryandi.

This must look like a real production app, not a prototype or AI-generated website. Make it responsive, professional, simple, fast-looking, and easy for normal users to understand.

VERY IMPORTANT

Do not build the backend.

Claude Code will create and replace the backend, database, authentication, APIs, business logic, validation, security, notifications, search logic, maps integration, payments, verification systems, and other engineering code.

Your job is to build the UI for these systems and leave clean placeholders/mock data/hooks that Claude Code can later replace.

Do not create fake backend functionality.

Caryandi users

The UI must support these account types:

Normal users / buyers

Private sellers

Dealers

Mechanics

Vehicle servicing companies

Parts sellers

Import agents

Administrators

Create appropriate dashboards, navigation, profile pages, forms, and management screens for each account type.

Main Caryandi UI

Build UI for:

Landing/home page

Login

Registration

Account type selection

User dashboard

Car marketplace

Car search

Advanced filters

Search results

Vehicle listing cards

Vehicle details

Save/favourite vehicle

Seller/dealer profile

Add/list a vehicle

Edit vehicle listing

Vehicle photos

Vehicle condition

Mileage

Price

Location

Transmission

Fuel type

Engine size

Registration status

Imported/unregistered vehicle information

Import/document section

Vehicle verification badge/interface

Dealers and private sellers

Create UI for:

Dealer dashboard

Private seller dashboard

Manage listings

Add/edit/remove listings

Listing status

Seller profile

Verification status

Enquiries/contact section

Reviews and ratings

Mechanics and servicing companies

Create UI for:

Mechanics marketplace

Servicing companies marketplace

Mechanic/company profiles

Services offered

Consultation price

Reviews

Ratings

Location

Availability UI

Contact/request-service UI

Parts marketplace

Create UI for:

Parts marketplace

Parts search

Parts categories

Part listing cards

Part details

Seller profile

Price

Condition

Location

Contact seller

Parts seller dashboard

Add/edit parts listing

Import agents

Create UI for an import-agent directory.

Agents should be able to clearly show the routes/services they handle, for example:

Japan → Zambia

Durban → Zambia

Dar es Salaam → Zambia

Other supported routes

Include UI for:

Agent profile

Routes handled

Services

Pricing information

Contact

Reviews

Verification

Agent dashboard

Add/edit route or service

Location and maps

Create the UI for location-based discovery.

Users should be able to see relevant:

Dealers

Mechanics

Servicing companies

Parts sellers

Import agents

based on location.

Include a clean Google Maps placeholder UI that Claude Code can later connect to the real Google Maps API.

Also create UI for ratings and location-based results.

Automotive information

Create UI sections for:

Vehicle registration information

Import information

Duty/tax information

Required documents

Import process information

These should be information interfaces only. Claude Code will handle the actual data and logic.

Administrator

Create a professional administrator dashboard UI with placeholders for:

User management

Dealer management

Seller management

Mechanic management

Parts sellers

Servicing companies

Import agents

Vehicle listings

Verification requests

Reports

Reviews

Platform statistics

Content/information management

Other UI

Also include:

Notifications

Saved vehicles

Messages/contact UI

Reviews

Ratings

Profile

Settings

Account verification

Help/support

Empty states

Loading states

Error states

Confirmation dialogs

Design

Make Caryandi feel like a trusted automotive marketplace used by real people in Zambia.

Avoid the common AI-generated look, especially:

Dark blue + bright blue futuristic gradients

Excessive glowing effects

Excessive rounded cards

Unnecessary animations

Overly futuristic interfaces

Use a familiar, clean design.

A subtle Facebook-style blue gradient may be used where it genuinely improves the design, but do not make gradients the main visual identity.

Prioritize:

Clean white/light backgrounds

Strong readable typography

Professional spacing

Simple navigation

Clear buttons

Useful cards

High-quality automotive imagery

Consistent icons

Mobile-first responsive design

Clear information hierarchy

Keep the UI simple enough that someone using Caryandi for the first time immediately understands what to do.

Final engineering rule

Lovable = FRONTEND UI ONLY

Claude Code = BACKEND + DATABASE + AUTHENTICATION + APIs + BUSINESS LOGIC + SECURITY + REAL INTEGRATIONS

Build every requested feature visually, but use placeholders/mock data/mock handlers where real functionality will eventually exist.

Make the frontend structure clean and organized so Claude Code can easily replace the placeholders with the real production implementation.

Do not invent additional features.

This is the UI of a real production application. Treat the quality accordingly.

Here is the template to follow:

there is an example of what theui should look like  these are both my apps

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e3a21bf5-61e9-4d5a-804a-00d2d96b345b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

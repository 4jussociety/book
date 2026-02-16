# Physics/Rehab Schedule Management System (v1.1)

A comprehensive scheduling system for physical therapy and rehabilitation centers.

## Features

- **Multi-Therapist Scheduling**: View and manage schedules for multiple therapists side-by-side.
- **Drag-and-Drop Interface**: Intuitive drag-to-create and drag-to-move appointments.
- **Granular Scheduling**: 10-minute increment support with 30-minute minimum duration.
- **Appointment Management**: 
  - 3-step booking flow (Type -> Patient -> Details)
  - Status tracking (Pending, Completed, Cancelled, No-Show)
  - Block time support
- **Patient Management**: Patient records, visit history, and search.
- **Stats Dashboard**: Weekly activity charts and appointment counts.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Supabase (Auth, DB, RLS)
- **State Management**: TanStack Query, Zustand
- **Icons**: Lucide React
- **DnD**: @dnd-kit

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

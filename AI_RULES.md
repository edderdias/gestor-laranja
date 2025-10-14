# AI Rules for this Project

This document outlines the core technologies used in this project and provides guidelines for using specific libraries to maintain consistency and best practices.

## Tech Stack Overview

*   **Frontend Framework**: React with TypeScript for building dynamic user interfaces.
*   **Build Tool**: Vite for a fast development experience and optimized builds.
*   **Styling**: Tailwind CSS for utility-first styling, ensuring responsive and consistent designs.
*   **UI Components**: shadcn/ui for pre-built, accessible, and customizable UI components.
*   **Routing**: React Router DOM for declarative client-side routing.
*   **Backend & Authentication**: Supabase for database, authentication, and real-time functionalities.
*   **Data Fetching & State Management**: React Query (TanStack Query) for efficient server state management.
*   **Form Management**: React Hook Form for robust form handling and validation.
*   **Schema Validation**: Zod for defining and validating data schemas.
*   **Notifications**: Sonner for elegant and customizable toast notifications.
*   **Icons**: Lucide React for a comprehensive set of SVG icons.
*   **Date Utilities**: date-fns for parsing, formatting, and manipulating dates.

## Library Usage Rules

To ensure consistency and maintainability, please adhere to the following rules when developing:

*   **UI Components**:
    *   Always prioritize `shadcn/ui` components found in `src/components/ui/`.
    *   If a required component is not available in `shadcn/ui` or needs significant customization, create a new component in `src/components/` and style it using Tailwind CSS.
    *   **DO NOT** modify files within `src/components/ui/` directly.
*   **Styling**:
    *   All styling should be done using **Tailwind CSS classes**.
    *   Avoid writing raw CSS in separate files unless it's for global styles in `src/index.css`.
    *   Use the `cn` utility function from `src/lib/utils.ts` for conditionally combining Tailwind classes.
*   **Routing**:
    *   Use `react-router-dom` for all navigation within the application.
    *   Define all main application routes in `src/App.tsx`.
*   **Data Fetching & Server State**:
    *   Use `@tanstack/react-query` for all interactions with the backend API (e.g., fetching, creating, updating, deleting data).
    *   For local component state, use React's built-in `useState` or `useReducer` hooks.
*   **Forms**:
    *   Implement all forms using `react-hook-form`.
    *   Use `zod` for defining the schema and validating form inputs.
*   **Backend Interactions**:
    *   All database and authentication operations must use the `supabase` client from `src/integrations/supabase/client.ts`.
*   **Notifications**:
    *   Use `sonner` for displaying all user feedback messages (e.g., success, error, loading toasts).
*   **Icons**:
    *   Use icons from the `lucide-react` library.
*   **Date Handling**:
    *   For any date formatting, parsing, or manipulation, use functions provided by `date-fns`.
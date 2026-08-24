// Colors moved from the backend (Status.Color dropped) to the frontend - status color is a
// presentation concern, not stored data, and tweaking it used to require a DB migration (see the
// backend's migration history). Values copied 1:1 from the former backend seed so nothing
// visually changes. Keyed by the same status GUIDs already hardcoded in quest.service.ts.
export const STATUS_COLORS: Record<string, string> = {
  '17c07323-d5b4-4568-b773-de3487ff30b1': '#9E9E9E', // À accomplir (statusPendingId)
  '2281c955-b3e1-49dc-be62-6a7912bb46b3': '#B87FED', // En cours
  'b34563d0-1ae5-42f9-950a-beffa4e27dce': '#ff9500', // En attente (statusOnHoldId)
  '6662dfc1-9c40-4d78-806f-34cd22e07023': '#37007f', // Terminée (statusDoneId)
};

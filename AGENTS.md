# Field Officer Project Instructions

## Trigger: "continue with field officer task"

Whenever the user starts this project and enters:
> **"continue with field officer task"**

The assistant must immediately start the following task that was previously terminated:

---

# Task: Implement Patrolling Checklist Flow

## Objective
Update the existing Field Officer React Native / Expo application (`MOBILE`) and FastAPI backend (`WEB/backend`) so that the Patrolling Tour and Checkpoint Checklist workflow is fully implemented and operational.

All buttons, forms, checkpoint states, and submission actions must work end-to-end with the backend and database.

---

### 1. Patrolling Tour Selection Screen
- Dark navy background (`#0A1128` / `#0F172A` theme compatible).
- Centered blue title: "Patrolling".
- Back navigation at top.
- Officer profile card: officer profile photo, employee code, designation, and current duty status (ON DUTY / OFF DUTY based on Active/Inactive status).
- Status info row: GPS status, sync status, battery/health indicator.
- Section heading: "Select Patrolling Tour".
- Tour cards for available tours (e.g. Parking, Server Room, etc.).
- Tour icon, name, description, and blue START TOUR button.
- START TOUR opens the selected tour's checkpoint sequence.
- Prevent duplicate active tours if business rules permit only one active tour.
- Preserve Active/Inactive duty workflow; no auto-capturing photo on load.

---

### 2. Tour Progress and Sequential Checkpoints
- Tour title at top.
- "Tour Progress" heading with progress text (e.g., "0 of 3 Checkpoints Done").
- Vertical checkpoint timeline with numbered markers.
- Each checkpoint card shows name and configured GPS coordinates.
- **Sequential Unlocking**:
  - Checkpoint 1 is available initially.
  - Future checkpoints remain locked until previous checkpoint is completed and verified.
  - Completed checkpoints show green state (`#22C55E`).
  - Active checkpoint is highlighted (amber/blue accent border).
  - Locked checkpoints are visually muted with "Locked until previous checkpoint completed".
- Use actual checkpoint configuration from backend/database; no hardcoded names or coordinates.

---

### 3. QR Checkpoint Scanning & GPS Verification
- Active checkpoint card displays "Scan Checkpoint" button when QR verification is required.
- Tapping opens the existing QR scanner.
- Reads QR payload, validates QR against selected tour and checkpoint.
- Validates GPS/geofence requirements.
- Submits verification to backend.
- Mark verified only upon backend confirmation.
- Shows verification success dialog: "Checkpoint [name] scanned & verified successfully!".
- On confirmation, returns to checkpoint screen and shows the checklist.

---

### 4. Checkpoint Checklist UI
- Displays configured checklist questions for the verified checkpoint.
- Each question displays:
  - Full question text.
  - YES and NO toggle buttons (visually highlighted when selected).
  - Optional Photo attachment button with camera icon (only manually opened on tap).
- Preserves answers and photos in progress.
- "Submit Checklist" button at bottom.
- Confirmation dialog:
  - Title: "Confirm Submission"
  - Message: "Are you sure you want to submit the checklist answers for checkpoint '[checkpoint name]'?"
  - Buttons: CANCEL and SUBMIT.
- Server validates answers and photo references; on success, marks checkpoint completed and unlocks next checkpoint.

---

### 5. Pass Baton / Guard Handover
- For checkpoints supporting guard handover:
  - "Pass baton to another guard:" label.
  - Guard selection dropdown (searchable by name or employee code).
  - Reason-for-handover text input.
  - PASS BATON / HANDOVER button.
- Validates selected guard and reason; submits to backend.
- "CONTINUE TOUR MYSELF" action when the officer chooses to continue independently.

---

### 6. GPS-Verified Completion and Tour Progress
- Completed checkpoints show:
  - Completed green styling.
  - Completion time.
  - GPS verification status: "GPS VERIFIED (WITHIN RANGE)".
- Next checkpoint activates only when previous has satisfied verification, checklist, and handover.
- When all checkpoints are completed:
  - Mark tour complete in backend.
  - Show "Tour Completed!" dialog.
  - Refresh tour list and progress.

---

### 7. Design and Theme Compatibility
- Supports both Dark and Light modes using the global `ThemeContext`.
- Responsive layout with scrolling for long checklists; no controls obscured by keyboard or navigation.

---

### 8. Verification & Test Commands
- Frontend: `npx tsc --noEmit` in `MOBILE`.
- Backend: test routes and ensure clean responses without breaking registered/custom visits or attendance tracking.

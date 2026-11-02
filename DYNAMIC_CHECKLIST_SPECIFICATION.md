# DYNAMIC SITE CHECKLIST IMPLEMENTATION SPECIFICATION
### For Area Manager Web Portal & Field Officer Integration

---

## 1. Executive Summary & Objective

In the current setup, when a **Field Officer** checks into a site to conduct an inspection or fill out a checklist, questions can either be hardcoded standard questions or dynamically loaded.

We want the checklist to be **100% dynamic and managed by the Area Manager**:
1. **Area Manager Portal (Web)**: Area Manager selects a site/client under their branch, creates/updates checklist templates, toggles which questions are required, sets response types (Yes/No, Rating, Text, Multiple Choice), and specifies whether a photo is mandatory.
2. **Field Officer App (Mobile)**: When an officer checks in and clicks "Checklist", the mobile app queries `GET /api/sites/{site_id}/checklist` to dynamically render the exact questions configured by the Area Manager for that specific site.
3. **Submission & Reporting**: When submitted by the officer via `POST /api/sites/checklist-submit`, responses and photos are recorded and instantly visible in the Area Manager dashboard and visit reports.

---

## 2. Database Schema (Already Configured in MySQL RDS)

The required tables already exist in the database (`unique_master`).

### A. `PATROL_CHECKLISTS`
Stores the checklist templates and which sites they are assigned to.
* `oid` (BIGINT, PK): Checklist ID
* `title` (VARCHAR 255): E.g., *"Weekly Security & Fire Audit - Hinjewadi Site"*
* `description` (TEXT): Instructions for the field officer
* `site_ids` (JSON / TEXT): Array of site IDs linked to this checklist, e.g. `[156, 157]`
* `checkpoint_id` (BIGINT, Nullable): If linked to a patrolling tour checkpoint
* `is_active` (TINYINT): `1` = Active, `0` = Inactive
* `status` (VARCHAR 50): `'ACTIVE'` | `'INACTIVE'` | `'ARCHIVED'`
* `created_at` (TIMESTAMP)

### B. `PATROL_QUESTIONS`
Master bank of reusable questions.
* `oid` (BIGINT, PK): Question ID
* `text` (TEXT): The question text (e.g., *"Are all CCTV cameras operational and recording?"*)
* `response_type` (VARCHAR 50):
  * `'yes_no'` (Yes / No toggle)
  * `'satisfactory'` (Satisfactory / Unsatisfactory)
  * `'rating'` (1 to 5 stars)
  * `'text'` (Freeform text)
  * `'multiple_choice'` (Select from options)
* `options` (JSON / TEXT, Nullable): JSON array of choices, e.g. `["Option 1", "Option 2"]`
* `category` (VARCHAR 100): E.g., `'Guards & Attendance'`, `'Fire Safety'`, `'CCTV & Equipment'`

### C. `PATROL_CHECKLIST_QUESTION_LINKS`
Links questions to a specific checklist with site-specific rules.
* `oid` (BIGINT, PK): Link ID
* `checklist_id` (BIGINT, FK -> `PATROL_CHECKLISTS.oid`)
* `question_id` (BIGINT, FK -> `PATROL_QUESTIONS.oid`)
* `order` (INT): Display order on the mobile app (1, 2, 3...)
* `is_critical` (TINYINT): `1` = Critical violation if failed
* `requires_photo` (TINYINT): `1` = Officer must capture a photo to answer
* `requires_comment` (TINYINT): `1` = Officer must provide a written remark

### D. `PATROL_CHECKLIST_RESPONSES`
Stores officer submissions for auditing and reporting.
* `oid` (BIGINT, PK)
* `checklist_id` (BIGINT)
* `question_id` (BIGINT)
* `employee_oid` (BIGINT): Officer ID who answered
* `site_id` (BIGINT)
* `response` (TEXT): Answer string (e.g., `'Yes'`, `'No'`, `'Satisfactory'`)
* `comment` (TEXT, Nullable)
* `photo_url` (VARCHAR 255, Nullable)
* `created_at` (TIMESTAMP)

---

## 3. API Contract (Endpoints Implemented in FastAPI)

All endpoints run on the backend (`WEB/backend/app/routes/officer_patrol.py`).

### 1. Fetch Checklist for Site (Used by Mobile App)
* **Endpoint**: `GET /api/sites/{site_id}/checklist`
* **Response**:
```json
{
  "success": true,
  "checklist_id": 14,
  "site_id": 156,
  "site_name": "Phugewadi Metro Station",
  "client_name": "Maha Metro Pune",
  "checklist_title": "Daily Gate & Guard Audit",
  "checklist_description": "Inspect all access gates and verify guard turnouts.",
  "is_custom": true,
  "questions": [
    {
      "id": 101,
      "question_id": 5,
      "index": 1,
      "text": "Are security personnel wearing complete uniform and badges?",
      "response_type": "yes_no",
      "options": ["Yes", "No"],
      "is_critical": 0,
      "requires_photo": 1,
      "requires_comment": 0
    },
    {
      "id": 102,
      "question_id": 12,
      "index": 2,
      "text": "Are all perimeter gates locked and visitor registers updated?",
      "response_type": "yes_no",
      "options": ["Yes", "No"],
      "is_critical": 1,
      "requires_photo": 0,
      "requires_comment": 1
    }
  ]
}
```
*(If no custom checklist is assigned to this site, it returns the standard 15-question default checklist automatically).*

---

### 2. Submit Checklist Answers (Used by Mobile App)
* **Endpoint**: `POST /api/sites/checklist-submit`
* **Payload**:
```json
{
  "employee_id": 10208,
  "site_id": 156,
  "client_id": 12,
  "custom_visit_id": null,
  "checklist_id": 14,
  "answers": [
    {
      "question_id": 5,
      "text": "Are security personnel wearing complete uniform and badges?",
      "answer": "Yes",
      "comment": "All guards in uniform",
      "photo": "data:image/jpeg;base64,..."
    }
  ],
  "latitude": 18.6023,
  "longitude": 73.8258,
  "remarks": "Site inspection completed with no major issues."
}
```
* **Behavior**:
  * Saves answers into `PATROL_CHECKLIST_RESPONSES`.
  * Uploads base64 photos to permanent `/uploads/` directory.
  * Creates completed report in `FIELD_OFFICER_DAY_VISIT_REPORTS`.
  * Marks visit as `"Report Submitted"` for the field officer.

---

### 3. Area Manager: List All Sites & Current Assigned Checklists
* **Endpoint**: `GET /api/admin/site-checklists`
* **Response**:
```json
[
  {
    "site_id": 156,
    "site_name": "Phugewadi Metro Station",
    "client_name": "Maha Metro Pune",
    "branch_name": "Pune Branch",
    "has_custom_checklist": true,
    "checklist_id": 14,
    "checklist_title": "Daily Gate & Guard Audit",
    "is_active": true
  },
  {
    "site_id": 180,
    "site_name": "Adient Tech Center",
    "client_name": "Adient India Pvt Ltd",
    "branch_name": "Pune Branch",
    "has_custom_checklist": false,
    "checklist_id": 0,
    "checklist_title": "Standard Field Inspection",
    "is_active": true
  }
]
```

---

### 4. Area Manager: Create / Assign Checklist to Site
* **Endpoint**: `POST /api/admin/sites/{site_id}/assign-checklist`
* **Payload**:
```json
{
  "title": "Adient Plant Safety & Night Audit",
  "description": "Weekly audit performed by Area Manager / Field Officer",
  "questions": [
    {
      "text": "Are fire hydrants accessible and unblocked?",
      "response_type": "yes_no",
      "is_critical": 1,
      "requires_photo": 1,
      "requires_comment": 0
    },
    {
      "text": "Visitor and material register properly maintained?",
      "response_type": "yes_no",
      "is_critical": 0,
      "requires_photo": 0,
      "requires_comment": 1
    }
  ]
}
```
* **Behavior**:
  * Automatically creates or updates the entry in `PATROL_CHECKLISTS` for that `site_id`.
  * Upserts questions into `PATROL_QUESTIONS` and links them via `PATROL_CHECKLIST_QUESTION_LINKS`.
  * Next time the Field Officer visits this site, the mobile app will automatically display these exact questions.

---

## 4. Area Manager Web Portal: Required Implementation Steps

To implement the Area Manager frontend:

1. **Checklist Management Page**:
   * Create a screen in the Area Manager portal listing all sites under their branch (using `GET /api/admin/site-checklists`).
   * Show a badge indicating whether the site has a **"Custom Checklist"** or is using the **"Default Checklist"**.

2. **Checklist Builder / Editor Modal**:
   * Area Manager clicks **"Assign / Edit Checklist"** on a site.
   * Input fields for:
     * **Title**: E.g. *"Daily Security Checklist"*
     * **Description**: Optional notes/instructions.
   * Dynamic question list with an **"+ Add Question"** button:
     * Question text input.
     * Response type dropdown: `Yes / No`, `Rating (1-5)`, `Text`, `Multiple Choice`.
     * Toggles:
       * `Require Photo`: Forces officer to snap a picture.
       * `Critical Check`: Marks question as a safety-critical item.
       * `Require Comment`: Makes written explanation mandatory.
   * **Save Button**: Sends payload to `POST /api/admin/sites/{site_id}/assign-checklist`.

3. **Visit Reports Review Page**:
   * In the existing Area Manager reports tab, display the questions, officer answers, and photo thumbnails saved from `PATROL_CHECKLIST_RESPONSES` or visit report checklist records.


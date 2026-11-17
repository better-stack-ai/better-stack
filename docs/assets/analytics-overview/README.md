# Analytics overview review

Before: base commit `549975f3`, default overview. After: the analytics overview
change in this branch. Both use the same synthetic traffic fixture and date range;
the new overview defaults to Visitors while the old chart showed Page views.
No production traffic or account data is included.

- Desktop: 1440 × 1000 viewport, full-page captures.
- Mobile: 390 × 844 viewport, full-page captures.
- Funnel: 1440 × 1000 viewport with the side dialog open.

Exact page rows and grouped route rows retain daily page-view sparklines.
The dialog uses native modal focus containment, Escape dismissal and focus
restoration. Browser checks also cover metric selection, breakdown buttons,
mobile overflow and keyboard access. These images show presentation fixtures;
the backend and Next.js smoke tests separately exercise real ingestion and reports.

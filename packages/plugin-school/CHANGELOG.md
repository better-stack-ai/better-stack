# @btst/plugin-school

## 2.1.1-beta.0

### Patch Changes

- Publish the current feature set for coordinated beta verification. Include Blog editorial review and revisions, comment and media page overrides, conditional forms and file uploads, Job Board and School bridges, Newsletter recovery, and the updated shared UI. Refresh the API-reference and route-reference packages in the tested installation set.
- Updated dependencies [75fc257]
- Updated dependencies [559543f]
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/plugin-cms@1.2.0-beta.0
  - @btst/stack@6.2.0-beta.0

## 2.1.0

### Minor Changes

- Add optional Media controls for course covers and lesson images while preserving standalone URL and Markdown fields.
- Add the optional `draftSchoolLesson` AI page tool to merge validated lesson and quiz fields into the current draft while leaving Save explicit.
- Add optional browser referral capture and verified payment conversion bridges. Persist attribution privately through asynchronous checkout; use original paid amounts and stable entity references for commission retries.

## 2.0.0

### Major Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.

### Minor Changes

- Add optional Analytics lifecycle bridges, a School completion observer, and consent-gated CLI wiring for selected plugins.

### Patch Changes

- Updated dependencies
  - @btst/stack@6.1.0
  - @btst/plugin-cms@1.1.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

- Extract the existing School APIs and UI for core v6, preserving CMS content and learning data.

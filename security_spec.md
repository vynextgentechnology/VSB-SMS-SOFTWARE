# Security Specification & Firestore Hardening Spec

## 1. Data Invariants
- Users collection `/users/{userId}` can only be read by authenticated users and modified by system admins or owners.
- Students `/students/{studentId}` and Parents `/parents/{parentId}` can only be written by authenticated staff or admins (`request.auth != null`).
- Exam batches `/exam_batches/{batchId}` must contain valid non-empty titles and department identifiers.
- Dispatch SMS logs `/sms_logs/{logId}` must contain valid recipient phone numbers and message content.

## 2. Dirty Dozen Payloads (Negative Security Cases)
1. Unauthenticated write to `/users/attacker`
2. Modifying `role` to `admin` without authorization
3. Injecting 100KB string into `studentName`
4. Deleting student records without authentication
5. Shadow update adding arbitrary fields to `/parents/{parentId}`
6. Unauthenticated read of PII student data
7. Creating exam batches with non-string `department`
8. Overwriting immutable `createdAt` timestamps
9. Creating SMS log with invalid status
10. Modifying other user's profile
11. Bypassing user email verification checks where required
12. Bulk list operation spoofing identity

## 3. Test Runner
Included in `DRAFT_firestore.rules` validation suite.

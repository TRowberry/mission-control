# Feature Spec: Media Review & Annotation System

**Status:** Draft  
**Author:** Rico  
**Date:** 2026-03-06  
**Priority:** High

## Overview

A Frame.io-style media review system integrated into Mission Control. Enables teams to collaborate on images and videos with annotations, comments, and approval workflows—all connected to the existing task system.

## Goals

1. **Image Review** - Pin comments, draw annotations, markup images
2. **Video Review** - Timestamp-based comments, frame-accurate feedback
3. **Task Integration** - Attach review items to tasks, track approval status
4. **Notifications** - Alert assignees when feedback is added
5. **Version Control** - Track revisions, compare versions

## User Stories

### As a reviewer, I want to:
- Click on an image to add a comment at that exact spot
- Draw shapes (rectangles, circles, arrows) to highlight areas
- Add comments at specific video timestamps
- See all comments in a threaded sidebar
- Mark items as "approved" or "needs changes"

### As a creator, I want to:
- Upload images/videos for review
- See all feedback in one place
- Click a comment to jump to that spot/timestamp
- Resolve comments when addressed
- Upload new versions and compare

### As a project manager, I want to:
- Assign reviewers to media items
- Track approval status across tasks
- Get notified when reviews are complete
- See review progress in task details

## Data Model

### New Tables

```prisma
model ReviewItem {
  id          String   @id @default(cuid())
  type        String   // 'image' | 'video'
  url         String   // File URL
  name        String
  duration    Float?   // Video duration in seconds
  width       Int?
  height      Int?
  version     Int      @default(1)
  status      String   @default("pending") // pending | in_review | approved | rejected
  
  taskId      String?
  task        Task?    @relation(fields: [taskId], references: [id])
  
  uploadedById String
  uploadedBy   User    @relation(fields: [uploadedById], references: [id])
  
  annotations  Annotation[]
  reviewers    ReviewAssignment[]
  versions     ReviewItemVersion[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Annotation {
  id          String   @id @default(cuid())
  type        String   // 'pin' | 'rectangle' | 'circle' | 'arrow' | 'freehand'
  
  // Position (for images and video frames)
  x           Float?   // Percentage 0-100
  y           Float?   // Percentage 0-100
  width       Float?   // For rectangles
  height      Float?
  
  // For video
  timestamp   Float?   // Seconds into video
  frameNumber Int?
  
  // Drawing data (for freehand, arrows)
  pathData    String?  // SVG path or JSON points
  color       String   @default("#FF3B30")
  
  // Comment
  content     String
  resolved    Boolean  @default(false)
  
  reviewItemId String
  reviewItem   ReviewItem @relation(fields: [reviewItemId], references: [id], onDelete: Cascade)
  
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  
  replies     AnnotationReply[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AnnotationReply {
  id           String     @id @default(cuid())
  content      String
  
  annotationId String
  annotation   Annotation @relation(fields: [annotationId], references: [id], onDelete: Cascade)
  
  authorId     String
  author       User       @relation(fields: [authorId], references: [id])
  
  createdAt    DateTime   @default(now())
}

model ReviewAssignment {
  id           String     @id @default(cuid())
  status       String     @default("pending") // pending | approved | rejected
  
  reviewItemId String
  reviewItem   ReviewItem @relation(fields: [reviewItemId], references: [id], onDelete: Cascade)
  
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  
  reviewedAt   DateTime?
  createdAt    DateTime   @default(now())
  
  @@unique([reviewItemId, userId])
}

model ReviewItemVersion {
  id           String     @id @default(cuid())
  version      Int
  url          String
  notes        String?
  
  reviewItemId String
  reviewItem   ReviewItem @relation(fields: [reviewItemId], references: [id], onDelete: Cascade)
  
  uploadedById String
  uploadedBy   User       @relation(fields: [uploadedById], references: [id])
  
  createdAt    DateTime   @default(now())
}
```

## API Endpoints

### Review Items
```
GET    /api/review                    # List review items (with filters)
POST   /api/review                    # Create review item
GET    /api/review/[id]               # Get review item with annotations
PATCH  /api/review/[id]               # Update status, assignees
DELETE /api/review/[id]               # Delete review item
POST   /api/review/[id]/versions      # Upload new version
```

### Annotations
```
GET    /api/review/[id]/annotations   # List annotations
POST   /api/review/[id]/annotations   # Create annotation
PATCH  /api/annotations/[id]          # Update annotation
DELETE /api/annotations/[id]          # Delete annotation
POST   /api/annotations/[id]/resolve  # Mark resolved
POST   /api/annotations/[id]/replies  # Add reply
```

### Assignments
```
POST   /api/review/[id]/assign        # Assign reviewers
POST   /api/review/[id]/approve       # Approve (current user)
POST   /api/review/[id]/reject        # Reject with feedback
```

## UI Components

### 1. ImageReviewer
```tsx
// Core image review component
<ImageReviewer
  src="/uploads/design-v2.png"
  annotations={annotations}
  onAnnotationCreate={(annotation) => {...}}
  tools={['pin', 'rectangle', 'arrow', 'freehand']}
  readOnly={false}
/>
```

**Features:**
- Zoom/pan controls
- Tool palette (pin, shapes, freehand draw)
- Click-to-comment (pin mode)
- Drag-to-draw (shape modes)
- Annotation list sidebar
- Click annotation → highlight on image

**Libraries:**
- **Fabric.js** - Canvas rendering and drawing tools
- Or **Konva.js** - Similar, React-friendly

### 2. VideoReviewer
```tsx
<VideoReviewer
  src="/uploads/promo-video.mp4"
  annotations={annotations}
  onAnnotationCreate={(annotation) => {...}}
/>
```

**Features:**
- Custom video player (Video.js base)
- Timeline with annotation markers
- Click marker → jump to timestamp
- Pause + annotate current frame
- Frame-by-frame navigation (←/→ arrows)
- Drawing on paused frames
- Comment sidebar with timestamps

**Libraries:**
- **Video.js** - Player foundation
- **Fabric.js** - Frame annotation overlay

### 3. AnnotationSidebar
```tsx
<AnnotationSidebar
  annotations={annotations}
  onSelect={(id) => {...}}
  onResolve={(id) => {...}}
  filter="all" | "open" | "resolved"
/>
```

**Features:**
- Grouped by timestamp (video) or position (image)
- Thread replies
- Resolve/unresolve toggle
- Filter controls
- @mention support

### 4. ReviewStatusBadge
```tsx
<ReviewStatusBadge 
  status="in_review" 
  approvals={2} 
  total={3} 
/>
// Shows: "2/3 approved" with progress ring
```

### 5. TaskReviewPanel
Embedded in task detail view:
```tsx
<TaskReviewPanel taskId={task.id} />
// Shows all review items attached to this task
// Quick upload button
// Approval status summary
```

## Integration Points

### 1. Task Attachments
- Review items can be attached to tasks
- Task detail page shows review panel
- Task status can auto-update based on review approvals

### 2. Notifications
Trigger notifications for:
- New review item assigned to you
- New annotation on your upload
- Reply to your annotation
- Review approved/rejected
- All reviewers have approved

### 3. Activity Feed
Log review actions:
- "Tim uploaded design-v3.png for review"
- "Rico added 3 annotations to promo-video.mp4"
- "Sarah approved homepage-mockup.png"

### 4. Chat Integration
- Share review items in chat
- Preview card with thumbnail + status
- Click to open review modal

## Implementation Phases

### Phase 1: Image Review (MVP)
- [ ] Prisma schema + migrations
- [ ] Basic API endpoints (CRUD)
- [ ] ImageReviewer component with pin annotations
- [ ] Annotation sidebar
- [ ] Task attachment integration
- [ ] FFmpeg thumbnail generation on upload

### Phase 2: Drawing Tools
- [ ] Rectangle, circle, arrow tools
- [ ] Freehand drawing
- [ ] Color picker
- [ ] Tool persistence (remember last used)

### Phase 3: Video Review
- [ ] VideoReviewer component
- [ ] Timestamp annotations
- [ ] Timeline markers
- [ ] Frame-by-frame navigation
- [ ] Drawing on video frames
- [ ] FFmpeg transcoding (any codec → H.264)
- [ ] Frame extraction for annotation snapshots

### Phase 4: Workflow
- [ ] Reviewer assignments
- [ ] Approval/rejection flow
- [ ] Version uploads
- [ ] Version comparison view
- [ ] Status-based notifications

### Phase 5: Real-Time Collaboration
- [ ] WebSocket annotation sync
- [ ] Presence indicators ("Tim is viewing")
- [ ] Live cursor sharing (optional)
- [ ] Conflict resolution for simultaneous edits

### Phase 6: Polish
- [ ] Keyboard shortcuts
- [ ] Touch/mobile support
- [ ] Export annotations (PDF report)
- [ ] Bulk actions
- [ ] Search annotations

### Future: External Sharing
- [ ] Guest links with expiry
- [ ] Password protection option
- [ ] Limited permissions (view/comment only)
- [ ] Email notifications for external reviewers

## Technical Decisions

### Canvas Library: Fabric.js
**Why:** 
- Mature, well-documented
- Built-in shapes, freehand, text
- JSON serialization (easy to store/restore)
- Good performance
- Active community

**Alternative considered:** Konva.js (more React-native, but less features)

### Video Player: Video.js
**Why:**
- Industry standard
- Plugin ecosystem
- Accessibility built-in
- HLS/DASH support for future

### Annotation Storage
Store as JSON in `pathData` field:
```json
{
  "type": "rectangle",
  "x": 25.5,
  "y": 30.2,
  "width": 15.0,
  "height": 10.0,
  "color": "#FF3B30"
}
```

Percentages (0-100) for position to support different display sizes.

## Decisions (from Tim)

1. **Video frame extraction** - ✅ Yes, server-side via ffmpeg
2. **Large file handling** - ✅ Store on NAS, no size limits, support all codecs via ffmpeg transcoding
3. **Real-time collaboration** - ✅ Yes, WebSocket updates for multiple reviewers
4. **External sharing** - ⏳ Deferred to future phase (no guest links yet)

## Technical Requirements (Updated)

### FFmpeg Integration
- **Thumbnail generation**: Extract frame at 0s, 25%, 50% for preview
- **Video transcoding**: Convert to web-friendly format (H.264/MP4) if needed
- **Frame extraction**: On-demand frame grab for annotation screenshots
- **Codec support**: Accept any input, transcode as needed

### Storage
- All media stored on NAS (`/uploads/reviews/`)
- No file size limits (NAS has ~900GB available)
- Original + transcoded versions kept
- Thumbnails generated on upload

### Real-Time (WebSocket)
- Broadcast annotation create/update/delete to all viewers
- Show "X is viewing" presence indicators
- Cursor position sharing (optional, like Figma)
- Use existing Socket.io infrastructure

## Success Metrics

- Time from upload to approval (target: <24h)
- Annotations per review item (more = engaged reviewers)
- Revision count (fewer = clearer feedback)
- User adoption (% of tasks using review feature)

---

## Next Steps

1. Review and refine this spec with Tim
2. Finalize Phase 1 scope
3. Create Prisma schema
4. Build ImageReviewer prototype
5. Iterate based on usage

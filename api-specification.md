# Schedra API Specification

## Overview

This API specification defines the endpoints needed to support Schedra's smart events scheduler across all development phases. The API is designed to be RESTful and follows OpenAPI 3.0 standards.

**Base URL**: `https://api.schedra.com/v1`

## Authentication

All API endpoints require authentication using JWT tokens.

```http
Authorization: Bearer <jwt_token>
```

### Authentication Endpoints

```yaml
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

---

## Phase 1: Basic CRUD and Plan Visualization

### Tasks Management

#### Create Task
```http
POST /tasks
```
**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "duration": 30,
  "deadline": "2024-01-15T14:30:00Z",
  "priority": "high|medium|low",
  "earliest_start_time": "2024-01-15T09:00:00Z",
  "energy_level": "high|medium|low",
  "calendar_id": "cal_123"
}
```

#### Get All Tasks
```http
GET /tasks
```
**Query Parameters:**
- `status`: `pending|completed|cancelled`
- `date_from`: `2024-01-01`
- `date_to`: `2024-01-31`
- `limit`: `20`
- `offset`: `0`

#### Get Task by ID
```http
GET /tasks/{taskId}
```

#### Update Task
```http
PUT /tasks/{taskId}
```
**Request Body:**
```json
{
  "title": "string",
  "description": "string", 
  "duration": 45,
  "deadline": "2024-01-15T14:30:00Z",
  "priority": "high|medium|low",
  "status": "pending|completed|cancelled"
}
```

#### Delete Task
```http
DELETE /tasks/{taskId}
```

#### Complete Task
```http
POST /tasks/{taskId}/complete
```
**Request Body:**
```json
{
  "completed_at": "2024-01-15T14:30:00Z",
  "actual_duration": 35,
  "notes": "Task completed successfully"
}
```

#### Search Tasks
```http
GET /search
```
**Query Parameters:**
- `q`: Search query
- `type`: `tasks|events|all`
- `limit`: `20`
- `offset`: `0`

### Calendar Views

#### Get Calendar View
```http
GET /calendar/view
```
**Query Parameters:**
- `view_type`: `day|week|month|list`
- `date`: `2024-01-15`
- `timezone`: `America/New_York`

**Response Example:**
```json
{
  "view_type": "week",
  "date_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-21T23:59:59Z"
  },
  "scheduled_tasks": [
    {
      "id": "task_123",
      "title": "Team Meeting",
      "start_time": "2024-01-15T10:00:00Z",
      "end_time": "2024-01-15T11:00:00Z",
      "status": "scheduled"
    }
  ],
  "time_slots": [
    {
      "date": "2024-01-15",
      "slots": [
        {
          "start_time": "09:00",
          "end_time": "10:00",
          "available": true
        }
      ]
    }
  ]
}
```

---

## Phase 2: Auto-Planning Engine

### Schedule Generation

#### Generate Automatic Schedule
```http
POST /schedule/generate
```
**Request Body:**
```json
{
  "date_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-21T23:59:59Z"
  },
  "working_hours": {
    "start": "09:00",
    "end": "17:00"
  },
  "preferences": {
    "break_duration": 15,
    "max_consecutive_hours": 4
  }
}
```

#### Get Schedule
```http
GET /schedule
```
**Query Parameters:**
- `date_from`: `2024-01-15`
- `date_to`: `2024-01-21`

#### Update Schedule
```http
PUT /schedule
```
**Request Body:**
```json
{
  "scheduled_items": [
    {
      "task_id": "task_123",
      "start_time": "2024-01-15T10:00:00Z",
      "end_time": "2024-01-15T11:30:00Z"
    }
  ]
}
```

### Rescheduling

#### Reschedule Missed Tasks
```http
POST /schedule/reschedule
```
**Request Body:**
```json
{
  "missed_task_ids": ["task_123", "task_456"],
  "reschedule_date": "2024-01-16"
}
```

#### Suggest Optimal Times
```http
GET /schedule/suggestions/{taskId}
```
**Response:**
```json
{
  "suggestions": [
    {
      "start_time": "2024-01-15T10:00:00Z",
      "end_time": "2024-01-15T11:00:00Z",
      "confidence": 0.95,
      "reasoning": "Optimal based on deadline proximity and available energy levels"
    }
  ]
}
```

---

## Phase 3: Recurring Tasks and Constraints

### Recurring Tasks

#### Create Recurring Task
```http
POST /tasks/recurring
```
**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "duration": 30,
  "recurrence": {
    "type": "daily|weekly|monthly|yearly",
    "interval": 1,
    "days_of_week": [1, 3, 5],
    "end_date": "2024-12-31T23:59:59Z"
  },
  "time_windows": [
    {
      "start_time": "09:00",
      "end_time": "12:00",
      "days_of_week": [1, 2, 3, 4, 5]
    }
  ],
  "auto_schedule": true
}
```

#### Get Recurring Tasks
```http
GET /tasks/recurring
```

#### Update Recurring Task
```http
PUT /tasks/recurring/{recurringTaskId}
```

### Time Windows & Constraints

#### Set Working Hours
```http
PUT /user/working-hours
```
**Request Body:**
```json
{
  "timezone": "America/New_York",
  "schedule": [
    {
      "day_of_week": 1,
      "start_time": "09:00",
      "end_time": "17:00",
      "break_times": [
        {
          "start_time": "12:00",
          "end_time": "13:00"
        }
      ]
    }
  ]
}
```

#### Get Time Constraints
```http
GET /user/constraints
```

### Calendar Management

#### Get User Calendars
```http
GET /calendars
```

#### Create Calendar
```http
POST /calendars
```
**Request Body:**
```json
{
  "name": "Work Calendar",
  "color": "#3B82F6",
  "is_default": false
}
```

### User Settings and Preferences

#### Get User Preferences
```http
GET /user/preferences
```

#### Update User Preferences
```http
PUT /user/preferences
```
**Request Body:**
```json
{
  "default_view": "day|week|month|list",
  "default_task_duration": 30,
  "timezone": "America/New_York",
  "theme": "light|dark",
  "notification_settings": {
    "email_reminders": true,
    "push_notifications": true,
    "reminder_minutes_before": [15, 60]
  }
}
```

---

## Phase 4: External Calendar Integration

### Google Calendar Integration

#### Connect Google Calendar
```http
POST /integrations/google/connect
```
**Request Body:**
```json
{
  "authorization_code": "string",
  "redirect_uri": "string"
}
```

#### Sync Google Calendar
```http
POST /integrations/google/sync
```

#### Get Google Events
```http
GET /integrations/google/events
```

### Apple Calendar Integration

#### Connect Apple Calendar
```http
POST /integrations/apple/connect
```

#### Sync Apple Calendar  
```http
POST /integrations/apple/sync
```

### Unified Calendar View

#### Get Unified Calendar
```http
GET /calendar/unified
```
**Query Parameters:**
- `include_external`: `true|false`
- `calendar_ids`: `cal_123,cal_456`

---

## Phase 5: Advanced Features and Flexibility

### Task Dependencies

#### Create Task Dependency
```http
POST /tasks/{taskId}/dependencies
```
**Request Body:**
```json
{
  "dependent_task_id": "task_456",
  "dependency_type": "finish_to_start|start_to_start|finish_to_finish|start_to_finish",
  "lag_time": 60
}
```

#### Get Task Dependencies
```http
GET /tasks/{taskId}/dependencies
```

### Tags and Notes

#### Create Tag
```http
POST /tags
```
**Request Body:**
```json
{
  "name": "Work",
  "color": "#FF5722"
}
```

#### Get All Tags
```http
GET /tags
```

#### Add Task Note
```http
POST /tasks/{taskId}/notes
```
**Request Body:**
```json
{
  "content": "Important note about this task",
  "type": "note|reminder|link"
}
```

### Task Splitting

#### Split Task
```http
POST /tasks/{taskId}/split
```
**Request Body:**
```json
{
  "split_duration": 30,
  "max_splits": 3,
  "buffer_time": 15
}
```

### Buffer Time Management

#### Set Buffer Time Rules
```http
PUT /user/buffer-settings
```
**Request Body:**
```json
{
  "default_buffer": 15,
  "buffer_rules": [
    {
      "task_type": "meeting",
      "buffer_before": 10,
      "buffer_after": 5
    }
  ]
}
```

### Analytics and Productivity

#### Get Productivity Analytics
```http
GET /analytics/productivity
```
**Query Parameters:**
- `period`: `day|week|month|year`
- `start_date`: `2024-01-01`
- `end_date`: `2024-01-31`

**Response:**
```json
{
  "period": "week",
  "total_tasks_completed": 45,
  "average_completion_time": 32,
  "productivity_score": 0.85,
  "task_completion_rate": 0.92,
  "time_distribution": {
    "work": 65,
    "personal": 25,
    "other": 10
  }
}
```

#### Get Task Conflicts
```http
GET /tasks/conflicts
```
**Query Parameters:**
- `date_from`: `2024-01-15`
- `date_to`: `2024-01-21`

#### Validate Schedule
```http
POST /schedule/validate
```
**Request Body:**
```json
{
  "tasks": ["task_123", "task_456"],
  "date_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-21T23:59:59Z"
  }
}
```

### Real-time Updates

#### WebSocket Connection
```
WSS /ws/schedule
```
**Message Types:**
- `schedule_updated`: Schedule changed
- `task_completed`: Task marked as complete  
- `conflict_detected`: Scheduling conflict found

---

## Data Models

### Task Model
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "duration": 30,
  "deadline": "2024-01-15T14:30:00Z",
  "priority": "high|medium|low",
  "status": "pending|scheduled|in_progress|completed|cancelled",
  "earliest_start_time": "2024-01-15T09:00:00Z",
  "energy_level": "high|medium|low",
  "actual_duration": 35,
  "completed_at": "2024-01-15T14:30:00Z",
  "tags": ["work", "important"],
  "calendar_id": "string",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "scheduled_time": {
    "start": "2024-01-15T10:00:00Z",
    "end": "2024-01-15T11:00:00Z"
  },
  "recurrence": {
    "type": "daily|weekly|monthly",
    "interval": 1,
    "end_date": "2024-12-31T23:59:59Z"
  }
}
```

### Calendar Model
```json
{
  "id": "string",
  "name": "string",
  "color": "#3B82F6",
  "is_default": false,
  "is_external": false,
  "external_source": "google|apple",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Schedule Model
```json
{
  "id": "string",
  "user_id": "string", 
  "date_range": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-21T23:59:59Z"
  },
  "scheduled_items": [
    {
      "id": "string",
      "task_id": "string",
      "start_time": "2024-01-15T10:00:00Z",
      "end_time": "2024-01-15T11:00:00Z",
      "type": "task|event|break",
      "status": "scheduled|completed|missed"
    }
  ],
  "generated_at": "2024-01-01T00:00:00Z",
  "last_updated": "2024-01-01T00:00:00Z"
}
```

## Error Handling

### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "duration",
        "message": "Duration must be greater than 0"
      }
    ]
  }
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `500` - Internal Server Error

## Rate Limiting

All endpoints are rate limited:
- `100 requests/minute` for most endpoints
- `10 requests/minute` for schedule generation
- `5 requests/minute` for external calendar sync

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

*This API specification supports all phases of Schedra development from basic CRUD operations to advanced scheduling automation.*
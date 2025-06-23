# Schedra Architecture Documentation

## Overview

Schedra is a smart events scheduler built with FastAPI and PostgreSQL, featuring intelligent auto-planning capabilities and real-time schedule updates. This document provides comprehensive technical architecture for implementation.

## Technology Stack

### Core Technologies
- **Backend Framework**: FastAPI (async Python web framework)
- **Database**: PostgreSQL 15+ (primary data store)
- **Caching**: Redis 7+ (sessions, caching, real-time)
- **Background Processing**: Celery + Redis (async tasks)
- **Authentication**: JWT with python-jose
- **WebSocket**: FastAPI native WebSocket support

### Key Dependencies
```python
# Core framework
fastapi[all]==0.104.1
uvicorn[standard]==0.24.0

# Database
sqlalchemy[asyncio]==2.0.23
alembic==1.12.1
asyncpg==0.29.0

# Caching and background tasks
redis[hiredis]==5.0.1
celery[redis]==5.3.4

# Authentication and security
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6

# External integrations
google-auth==2.23.4
google-auth-oauthlib==1.1.0
google-api-python-client==2.109.0
caldav==1.3.6

# Utilities
pydantic[email]==2.5.0
python-decouple==3.8
httpx==0.25.2
pytz==2023.3
```

## Database Architecture

### Core Schema Design

#### Users and Authentication
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_view VARCHAR(20) DEFAULT 'week', -- day, week, month, list
    default_task_duration INTEGER DEFAULT 30, -- minutes
    timezone VARCHAR(50) DEFAULT 'UTC',
    theme VARCHAR(20) DEFAULT 'light', -- light, dark
    date_format VARCHAR(20) DEFAULT 'MM/dd/yyyy',
    time_format VARCHAR(10) DEFAULT '12h', -- 12h, 24h
    week_start_day INTEGER DEFAULT 1, -- 1=Monday, 0=Sunday
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Calendar System
```sql
CREATE TABLE calendars (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6', -- hex color
    is_default BOOLEAN DEFAULT false,
    is_external BOOLEAN DEFAULT false,
    external_source VARCHAR(50), -- google, apple
    external_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, external_source, external_id)
);

CREATE TABLE external_calendar_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- google, apple
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Task Management
```sql
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- minutes
    deadline TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(20) DEFAULT 'medium', -- high, medium, low
    status VARCHAR(30) DEFAULT 'pending', -- pending, scheduled, in_progress, completed, cancelled
    earliest_start_time TIMESTAMP WITH TIME ZONE,
    energy_level VARCHAR(20), -- high, medium, low
    is_auto_scheduled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE task_completions (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_duration INTEGER, -- minutes
    notes TEXT,
    productivity_rating INTEGER CHECK (productivity_rating >= 1 AND productivity_rating <= 5)
);

CREATE TABLE task_tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6B7280',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE TABLE task_tag_relations (
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES task_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE task_dependencies (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependent_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(30) DEFAULT 'finish_to_start', -- finish_to_start, start_to_start, finish_to_finish, start_to_finish
    lag_time INTEGER DEFAULT 0, -- minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (task_id != dependent_task_id)
);
```

#### Scheduling System
```sql
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    version INTEGER DEFAULT 1,
    algorithm_version VARCHAR(50) DEFAULT 'v1.0',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE scheduled_items (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) DEFAULT 'scheduled', -- scheduled, completed, missed, moved
    item_type VARCHAR(30) DEFAULT 'task', -- task, break, buffer, external_event
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE schedule_conflicts (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL, -- time_overlap, deadline_violation, dependency_violation
    description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    involved_task_ids INTEGER[] NOT NULL,
    suggested_resolution TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Recurring Tasks
```sql
CREATE TABLE recurring_patterns (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    recurrence_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, yearly
    interval_value INTEGER DEFAULT 1,
    days_of_week INTEGER[], -- 0=Sunday, 1=Monday, etc.
    day_of_month INTEGER,
    month_of_year INTEGER,
    end_date DATE,
    max_occurrences INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE time_windows (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, -- null for global windows
    name VARCHAR(255),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL, -- 0=Sunday, 1=Monday, etc.
    priority INTEGER DEFAULT 1, -- higher number = higher priority
    window_type VARCHAR(30) DEFAULT 'preferred', -- preferred, required, blocked
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Analytics and Monitoring
```sql
CREATE TABLE productivity_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    tasks_planned INTEGER DEFAULT 0,
    hours_productive DECIMAL(4,2) DEFAULT 0,
    hours_planned DECIMAL(4,2) DEFAULT 0,
    productivity_score DECIMAL(3,2), -- 0.00 to 1.00
    focus_score DECIMAL(3,2), -- 0.00 to 1.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### File Storage
```sql
CREATE TABLE file_attachments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Notifications
```sql
CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    deadline_reminders BOOLEAN DEFAULT true,
    schedule_updates BOOLEAN DEFAULT true,
    daily_summary BOOLEAN DEFAULT false,
    reminder_minutes INTEGER[] DEFAULT ARRAY[15, 60], -- minutes before deadline
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notification_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    delivery_method VARCHAR(20) NOT NULL, -- email, push, websocket
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed
    related_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_scheduled_items_time_range ON scheduled_items(start_time, end_time);
CREATE INDEX idx_scheduled_items_task_schedule ON scheduled_items(task_id, schedule_id);
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX idx_productivity_metrics_user_date ON productivity_metrics(user_id, date);

-- Full-text search
CREATE INDEX idx_tasks_search ON tasks USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

## API Architecture

### Project Structure
```
schedra/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py          # Application configuration
│   │   ├── database.py        # Database connection and session management
│   │   ├── security.py        # JWT, password hashing, authentication
│   │   ├── exceptions.py      # Custom exception classes
│   │   ├── logging.py         # Logging configuration
│   │   └── middleware.py      # Custom middleware
│   ├── models/                # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py           # Base model class
│   │   ├── user.py           # User, UserPreferences, UserSession
│   │   ├── task.py           # Task, TaskCompletion, TaskTag, TaskDependency
│   │   ├── calendar.py       # Calendar, ExternalCalendarToken
│   │   ├── schedule.py       # Schedule, ScheduledItem, ScheduleConflict
│   │   ├── recurring.py      # RecurringPattern, TimeWindow
│   │   ├── analytics.py      # ProductivityMetrics, AuditLog
│   │   ├── notification.py   # NotificationPreferences, NotificationHistory
│   │   └── file.py           # FileAttachment
│   ├── schemas/               # Pydantic models for request/response
│   │   ├── __init__.py
│   │   ├── common.py         # Common schemas (pagination, responses)
│   │   ├── user.py           # User-related schemas
│   │   ├── task.py           # Task-related schemas
│   │   ├── calendar.py       # Calendar-related schemas
│   │   ├── schedule.py       # Schedule-related schemas
│   │   ├── analytics.py      # Analytics schemas
│   │   └── auth.py           # Authentication schemas
│   ├── api/                  # API route handlers
│   │   ├── __init__.py
│   │   ├── deps.py           # Common dependencies
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py       # Authentication endpoints
│   │   │   ├── tasks.py      # Task CRUD operations
│   │   │   ├── calendar.py   # Calendar views and management
│   │   │   ├── schedule.py   # Auto-planning and scheduling
│   │   │   ├── analytics.py  # Productivity and analytics
│   │   │   ├── user.py       # User preferences and settings
│   │   │   ├── files.py      # File upload and management
│   │   │   ├── notifications.py # Notification management
│   │   │   └── integrations.py  # External calendar integrations
│   │   └── websocket.py      # WebSocket handlers
│   ├── services/             # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py   # Authentication business logic
│   │   ├── task_service.py   # Task management logic
│   │   ├── scheduling_engine.py # Auto-planning algorithm
│   │   ├── calendar_service.py  # Calendar operations
│   │   ├── analytics_service.py # Analytics and productivity
│   │   ├── notification_service.py # Notification logic
│   │   ├── file_service.py   # File handling
│   │   ├── timezone_service.py  # Timezone handling
│   │   └── external_sync.py  # External calendar sync
│   ├── repositories/         # Data access layer
│   │   ├── __init__.py
│   │   ├── base.py          # Base repository class
│   │   ├── user_repository.py
│   │   ├── task_repository.py
│   │   ├── schedule_repository.py
│   │   ├── calendar_repository.py
│   │   └── analytics_repository.py
│   ├── workers/              # Celery background tasks
│   │   ├── __init__.py
│   │   ├── scheduling_tasks.py # Background scheduling operations
│   │   ├── sync_tasks.py    # External calendar sync
│   │   ├── notification_tasks.py # Email and push notifications
│   │   └── analytics_tasks.py   # Analytics computation
│   └── utils/
│       ├── __init__.py
│       ├── validators.py    # Custom validators
│       ├── helpers.py       # Utility functions
│       └── constants.py     # Application constants
├── tests/
│   ├── __init__.py
│   ├── conftest.py         # Test configuration
│   ├── unit/
│   │   ├── test_services/
│   │   ├── test_repositories/
│   │   └── test_utils/
│   ├── integration/
│   │   ├── test_api/
│   │   └── test_database/
│   ├── e2e/
│   │   └── test_workflows/
│   └── performance/
├── alembic/               # Database migrations
├── scripts/              # Utility scripts
│   ├── init_db.py
│   ├── seed_data.py
│   └── backup_db.py
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

### FastAPI Application Setup

#### Main Application (`app/main.py`)
```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.exceptions import setup_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import setup_middleware
from app.api.v1 import auth, tasks, calendar, schedule, analytics, user, files, notifications, integrations
from app.api.websocket import router as websocket_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    yield
    # Shutdown
    pass


def create_application() -> FastAPI:
    app = FastAPI(
        title="Schedra API",
        description="Smart Events Scheduler with Auto-Planning Engine",
        version="1.0.0",
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan
    )
    
    # Middleware
    setup_middleware(app)
    
    # Exception handlers
    setup_exception_handlers(app)
    
    # Routes
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
    app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["tasks"])
    app.include_router(calendar.router, prefix="/api/v1/calendar", tags=["calendar"])
    app.include_router(schedule.router, prefix="/api/v1/schedule", tags=["scheduling"])
    app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
    app.include_router(user.router, prefix="/api/v1/user", tags=["user"])
    app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
    app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
    app.include_router(integrations.router, prefix="/api/v1/integrations", tags=["integrations"])
    app.include_router(websocket_router, prefix="/ws")
    
    return app


app = create_application()


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "schedra-api",
        "version": "1.0.0"
    }
```

#### Configuration (`app/core/config.py`)
```python
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # Application
    PROJECT_NAME: str = "Schedra"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    
    # API
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    
    # Redis
    REDIS_URL: str
    REDIS_CACHE_TTL: int = 3600  # 1 hour
    
    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # External APIs
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    APPLE_CALENDAR_CONFIG: Optional[dict] = None
    
    # Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: Optional[str] = None
    
    # File Storage
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_FILE_TYPES: List[str] = ["image/jpeg", "image/png", "application/pdf", "text/plain"]
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
```

## Service Layer Architecture

### Core Business Logic Services

#### Task Service (`app/services/task_service.py`)
```python
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, TaskCompletion
from app.repositories.task_repository import TaskRepository
from app.schemas.task import TaskCreate, TaskUpdate
from app.core.exceptions import TaskNotFoundException


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.task_repo = TaskRepository(db)
    
    async def create_task(self, user_id: int, task_data: TaskCreate) -> Task:
        """Create a new task with validation"""
        # Validate deadline
        if task_data.deadline and task_data.deadline <= datetime.utcnow():
            raise ValueError("Deadline must be in the future")
        
        # Set default calendar if not specified
        if not task_data.calendar_id:
            default_calendar = await self.task_repo.get_default_calendar(user_id)
            task_data.calendar_id = default_calendar.id
        
        task = await self.task_repo.create(user_id, task_data)
        
        # Trigger rescheduling if auto-scheduling is enabled
        if task_data.is_auto_scheduled:
            await self._trigger_reschedule(user_id)
        
        return task
    
    async def update_task(self, user_id: int, task_id: int, task_data: TaskUpdate) -> Task:
        """Update existing task"""
        task = await self.task_repo.get_by_id_and_user(task_id, user_id)
        if not task:
            raise TaskNotFoundException()
        
        updated_task = await self.task_repo.update(task_id, task_data)
        
        # Trigger rescheduling if task properties changed
        if any(hasattr(task_data, field) for field in ['duration', 'deadline', 'priority']):
            await self._trigger_reschedule(user_id)
        
        return updated_task
    
    async def complete_task(self, user_id: int, task_id: int, 
                          completion_data: dict) -> TaskCompletion:
        """Mark task as completed with actual duration tracking"""
        task = await self.task_repo.get_by_id_and_user(task_id, user_id)
        if not task:
            raise TaskNotFoundException()
        
        # Update task status
        await self.task_repo.update(task_id, TaskUpdate(status="completed"))
        
        # Create completion record
        completion = await self.task_repo.create_completion(task_id, completion_data)
        
        # Update productivity metrics
        await self._update_productivity_metrics(user_id, task, completion)
        
        return completion
    
    async def search_tasks(self, user_id: int, query: str, 
                          filters: dict = None) -> List[Task]:
        """Search tasks with full-text search and filters"""
        return await self.task_repo.search(user_id, query, filters)
    
    async def _trigger_reschedule(self, user_id: int):
        """Trigger background rescheduling task"""
        from app.workers.scheduling_tasks import reschedule_user_tasks
        reschedule_user_tasks.delay(user_id)
    
    async def _update_productivity_metrics(self, user_id: int, task: Task, 
                                         completion: TaskCompletion):
        """Update daily productivity metrics"""
        from app.workers.analytics_tasks import update_daily_metrics
        update_daily_metrics.delay(user_id, datetime.utcnow().date())
```

#### Scheduling Engine (`app/services/scheduling_engine.py`)
```python
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta, time
from dataclasses import dataclass

from app.models.task import Task
from app.models.schedule import Schedule, ScheduledItem
from app.repositories.schedule_repository import ScheduleRepository
from app.services.calendar_service import CalendarService


@dataclass
class TimeSlot:
    start_time: datetime
    end_time: datetime
    available: bool
    energy_level: str = "medium"


@dataclass
class SchedulingConstraint:
    user_id: int
    working_hours: Dict[int, Tuple[time, time]]  # day_of_week -> (start, end)
    time_windows: List[Dict]
    break_duration: int = 15  # minutes
    max_consecutive_hours: int = 4


class SchedulingEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.schedule_repo = ScheduleRepository(db)
        self.calendar_service = CalendarService(db)
    
    async def generate_schedule(self, user_id: int, date_range: Dict) -> Schedule:
        """Generate optimized schedule for user within date range"""
        # 1. Gather input data
        tasks = await self._get_schedulable_tasks(user_id, date_range)
        constraints = await self._get_user_constraints(user_id)
        existing_events = await self._get_existing_events(user_id, date_range)
        
        # 2. Generate available time slots
        time_slots = await self._generate_time_slots(date_range, constraints, existing_events)
        
        # 3. Apply scheduling algorithm
        scheduled_items = await self._optimize_task_placement(tasks, time_slots, constraints)
        
        # 4. Validate and resolve conflicts
        conflicts = await self._detect_conflicts(scheduled_items)
        if conflicts:
            scheduled_items = await self._resolve_conflicts(scheduled_items, conflicts)
        
        # 5. Create and save schedule
        schedule = await self.schedule_repo.create_schedule(
            user_id, date_range, scheduled_items
        )
        
        return schedule
    
    async def _optimize_task_placement(self, tasks: List[Task], 
                                     time_slots: List[TimeSlot],
                                     constraints: SchedulingConstraint) -> List[ScheduledItem]:
        """Core scheduling algorithm using constraint satisfaction"""
        scheduled_items = []
        
        # Sort tasks by priority and deadline urgency
        sorted_tasks = self._prioritize_tasks(tasks)
        
        for task in sorted_tasks:
            best_slot = await self._find_optimal_slot(task, time_slots, constraints)
            if best_slot:
                scheduled_item = ScheduledItem(
                    task_id=task.id,
                    start_time=best_slot.start_time,
                    end_time=best_slot.start_time + timedelta(minutes=task.duration),
                    confidence_score=self._calculate_confidence(task, best_slot)
                )
                scheduled_items.append(scheduled_item)
                
                # Remove used time slot
                time_slots = self._remove_conflicting_slots(time_slots, scheduled_item)
        
        return scheduled_items
    
    async def _find_optimal_slot(self, task: Task, time_slots: List[TimeSlot],
                               constraints: SchedulingConstraint) -> Optional[TimeSlot]:
        """Find the best time slot for a task"""
        candidate_slots = []
        
        for slot in time_slots:
            if not slot.available:
                continue
            
            # Check if slot can accommodate task duration
            slot_duration = (slot.end_time - slot.start_time).total_seconds() / 60
            if slot_duration < task.duration:
                continue
            
            # Check energy level matching
            if task.energy_level and task.energy_level != slot.energy_level:
                continue
            
            # Check earliest start time constraint
            if task.earliest_start_time and slot.start_time < task.earliest_start_time:
                continue
            
            # Calculate score based on multiple factors
            score = self._calculate_slot_score(task, slot)
            candidate_slots.append((slot, score))
        
        if not candidate_slots:
            return None
        
        # Return slot with highest score
        return max(candidate_slots, key=lambda x: x[1])[0]
    
    def _calculate_slot_score(self, task: Task, slot: TimeSlot) -> float:
        """Calculate how well a time slot matches a task"""
        score = 0.0
        
        # Deadline urgency (higher score for slots closer to deadline)
        if task.deadline:
            days_until_deadline = (task.deadline - slot.start_time).days
            if days_until_deadline > 0:
                score += min(1.0, 7.0 / days_until_deadline)  # More urgent = higher score
        
        # Priority weight
        priority_weights = {"high": 1.0, "medium": 0.7, "low": 0.4}
        score += priority_weights.get(task.priority, 0.5)
        
        # Energy level matching
        if task.energy_level == slot.energy_level:
            score += 0.5
        
        # Preferred time windows (if any)
        # This would check against user's preferred working hours
        score += self._check_time_preferences(task, slot)
        
        return score
    
    def _prioritize_tasks(self, tasks: List[Task]) -> List[Task]:
        """Sort tasks by priority and deadline urgency"""
        def priority_key(task):
            # Priority weight
            priority_weights = {"high": 3, "medium": 2, "low": 1}
            priority_score = priority_weights.get(task.priority, 1)
            
            # Deadline urgency (inverse days until deadline)
            if task.deadline:
                days_left = (task.deadline - datetime.utcnow()).days
                deadline_urgency = max(0, 10 - days_left)  # Higher = more urgent
            else:
                deadline_urgency = 0
            
            return (priority_score * 10 + deadline_urgency, task.created_at)
        
        return sorted(tasks, key=priority_key, reverse=True)
    
    async def _detect_conflicts(self, scheduled_items: List[ScheduledItem]) -> List[Dict]:
        """Detect scheduling conflicts"""
        conflicts = []
        
        # Time overlap detection
        for i, item1 in enumerate(scheduled_items):
            for item2 in scheduled_items[i+1:]:
                if self._time_overlap(item1, item2):
                    conflicts.append({
                        "type": "time_overlap",
                        "items": [item1, item2],
                        "severity": "high"
                    })
        
        # Deadline violation detection
        for item in scheduled_items:
            task = await self._get_task(item.task_id)
            if task.deadline and item.end_time > task.deadline:
                conflicts.append({
                    "type": "deadline_violation",
                    "items": [item],
                    "severity": "critical"
                })
        
        return conflicts
    
    def _time_overlap(self, item1: ScheduledItem, item2: ScheduledItem) -> bool:
        """Check if two scheduled items overlap in time"""
        return (item1.start_time < item2.end_time and 
                item2.start_time < item1.end_time)
```

## Security Architecture

### Authentication and Authorization

#### JWT Security (`app/core/security.py`)
```python
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict):
    """Create JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != token_type:
            return None
        return payload
    except JWTError:
        return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)


class PasswordValidator:
    """Password strength validation"""
    
    @staticmethod
    def validate_password(password: str) -> bool:
        """Validate password strength"""
        if len(password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )
        
        if not any(c.isupper() for c in password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one uppercase letter"
            )
        
        if not any(c.islower() for c in password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one lowercase letter"
            )
        
        if not any(c.isdigit() for c in password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one digit"
            )
        
        return True
```

### Rate Limiting and Middleware

#### Custom Middleware (`app/core/middleware.py`)
```python
import time
import redis
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_client: redis.Redis):
        super().__init__(app)
        self.redis = redis_client
        self.rate_limits = {
            "/api/v1/auth/login": (5, 60),  # 5 requests per minute
            "/api/v1/schedule/generate": (10, 3600),  # 10 requests per hour
            "/api/v1/tasks": (100, 3600),  # 100 requests per hour
            "/api/v1/search": (50, 3600),  # 50 requests per hour
        }
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host
        
        # Check rate limit for specific endpoints
        path = request.url.path
        if path in self.rate_limits:
            limit, window = self.rate_limits[path]
            key = f"rate_limit:{client_ip}:{path}"
            
            current = self.redis.get(key)
            if current is None:
                self.redis.setex(key, window, 1)
            else:
                current = int(current)
                if current >= limit:
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Rate limit exceeded"}
                    )
                self.redis.incr(key)
        
        response = await call_next(request)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response
```

## Background Processing

### Celery Configuration

#### Celery App (`app/workers/__init__.py`)
```python
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "schedra",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.scheduling_tasks",
        "app.workers.sync_tasks", 
        "app.workers.notification_tasks",
        "app.workers.analytics_tasks"
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "sync-external-calendars": {
            "task": "app.workers.sync_tasks.sync_all_external_calendars",
            "schedule": 900.0,  # Every 15 minutes
        },
        "reschedule-missed-tasks": {
            "task": "app.workers.scheduling_tasks.reschedule_all_missed_tasks",
            "schedule": 86400.0,  # Every 24 hours
        },
        "send-deadline-reminders": {
            "task": "app.workers.notification_tasks.send_deadline_reminders",
            "schedule": 1800.0,  # Every 30 minutes
        },
        "calculate-daily-analytics": {
            "task": "app.workers.analytics_tasks.calculate_daily_analytics",
            "schedule": 86400.0,  # Every 24 hours
        },
    },
)
```

#### Scheduling Tasks (`app/workers/scheduling_tasks.py`)
```python
from celery import current_task
from datetime import datetime, timedelta
from typing import List

from app.workers import celery_app
from app.core.database import SessionLocal
from app.services.scheduling_engine import SchedulingEngine
from app.repositories.task_repository import TaskRepository


@celery_app.task(bind=True, max_retries=3)
def reschedule_user_tasks(self, user_id: int, date_range: dict = None):
    """Reschedule tasks for a specific user"""
    try:
        db = SessionLocal()
        
        if not date_range:
            # Default to next 7 days
            start_date = datetime.utcnow().date()
            end_date = start_date + timedelta(days=7)
            date_range = {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            }
        
        scheduling_engine = SchedulingEngine(db)
        schedule = await scheduling_engine.generate_schedule(user_id, date_range)
        
        # Send WebSocket notification
        from app.api.websocket import connection_manager
        await connection_manager.broadcast_to_user(
            user_id,
            {
                "type": "schedule_updated",
                "schedule_id": schedule.id,
                "message": "Your schedule has been updated"
            }
        )
        
        return {"status": "success", "schedule_id": schedule.id}
        
    except Exception as exc:
        current_task.retry(countdown=60, exc=exc)
    finally:
        db.close()


@celery_app.task
def reschedule_all_missed_tasks():
    """Daily task to reschedule all missed tasks"""
    db = SessionLocal()
    try:
        task_repo = TaskRepository(db)
        users_with_missed_tasks = await task_repo.get_users_with_missed_tasks()
        
        for user_id in users_with_missed_tasks:
            reschedule_user_tasks.delay(user_id)
        
        return {"status": "success", "users_processed": len(users_with_missed_tasks)}
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def optimize_schedule_async(self, user_id: int, schedule_id: int):
    """Heavy computation for schedule optimization"""
    try:
        db = SessionLocal()
        scheduling_engine = SchedulingEngine(db)
        
        # Perform complex optimization
        optimized_schedule = await scheduling_engine.optimize_existing_schedule(schedule_id)
        
        return {
            "status": "success", 
            "schedule_id": optimized_schedule.id,
            "optimization_score": optimized_schedule.confidence_score
        }
        
    except Exception as exc:
        current_task.retry(countdown=120, exc=exc)
    finally:
        db.close()
```

## Real-time Features

### WebSocket Management

#### WebSocket Handler (`app/api/websocket.py`)
```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, List
import json
import logging

from app.core.security import verify_token
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected via WebSocket")
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected from WebSocket")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))
    
    async def broadcast_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    dead_connections.append(connection)
            
            # Clean up dead connections
            for connection in dead_connections:
                self.disconnect(connection, user_id)
    
    async def broadcast_schedule_update(self, user_id: int, schedule_data: dict):
        message = {
            "type": "schedule_updated",
            "data": schedule_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast_to_user(user_id, message)
    
    async def broadcast_task_completion(self, user_id: int, task_data: dict):
        message = {
            "type": "task_completed",
            "data": task_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast_to_user(user_id, message)
    
    async def broadcast_conflict_detected(self, user_id: int, conflicts: List[dict]):
        message = {
            "type": "conflict_detected",
            "data": {"conflicts": conflicts},
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast_to_user(user_id, message)


connection_manager = ConnectionManager()


@router.websocket("/schedule")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return
    
    # Verify JWT token
    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001, reason="Invalid user")
        return
    
    user_id = int(user_id)
    await connection_manager.connect(websocket, user_id)
    
    try:
        while True:
            # Keep connection alive and handle any incoming messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message.get("type") == "ping":
                await connection_manager.send_personal_message(
                    {"type": "pong", "timestamp": datetime.utcnow().isoformat()},
                    websocket
                )
            elif message.get("type") == "subscribe_schedule":
                # Subscribe to schedule updates for specific date range
                pass
            
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, user_id)
```

## File Storage and Media

#### File Service (`app/services/file_service.py`)
```python
import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException, status

from app.core.config import settings
from app.models.file import FileAttachment
from app.repositories.file_repository import FileRepository


class FileService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.file_repo = FileRepository(db)
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(exist_ok=True)
    
    async def upload_task_attachment(self, task_id: int, file: UploadFile, 
                                   uploaded_by: int) -> FileAttachment:
        """Upload file attachment for a task"""
        # Validate file
        self._validate_file(file)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = self.upload_dir / unique_filename
        
        # Save file
        try:
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save file"
            )
        
        # Create database record
        file_attachment = await self.file_repo.create_attachment({
            "task_id": task_id,
            "filename": unique_filename,
            "original_filename": file.filename,
            "file_path": str(file_path),
            "file_size": len(content),
            "content_type": file.content_type,
            "uploaded_by": uploaded_by
        })
        
        return file_attachment
    
    async def delete_attachment(self, attachment_id: int, user_id: int) -> bool:
        """Delete file attachment"""
        attachment = await self.file_repo.get_by_id(attachment_id)
        if not attachment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment not found"
            )
        
        # Verify ownership through task
        if attachment.task.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this attachment"
            )
        
        # Delete file from filesystem
        try:
            if os.path.exists(attachment.file_path):
                os.remove(attachment.file_path)
        except Exception:
            pass  # Continue even if file deletion fails
        
        # Delete database record
        await self.file_repo.delete(attachment_id)
        return True
    
    def _validate_file(self, file: UploadFile):
        """Validate uploaded file"""
        if file.size > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum allowed size of {settings.MAX_FILE_SIZE} bytes"
            )
        
        if file.content_type not in settings.ALLOWED_FILE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type {file.content_type} not allowed"
            )
        
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Filename is required"
            )
```

## Testing Strategy

### Test Configuration (`tests/conftest.py`)
```python
import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.config import settings
from app.core.database import get_db
from app.models.base import Base

# Test database URL
TEST_DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/schedra_test"

# Create test engine
test_engine = create_async_engine(TEST_DATABASE_URL, echo=True)
TestSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session():
    """Create a test database session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestSessionLocal() as session:
        yield session
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="function")
async def client(db_session):
    """Create a test client."""
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    from app.models.user import User
    from app.core.security import get_password_hash
    
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpass123"),
        first_name="Test",
        last_name="User",
        is_active=True,
        is_verified=True
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def authenticated_client(client, test_user):
    """Create an authenticated test client."""
    from app.core.security import create_access_token
    
    access_token = create_access_token(data={"sub": str(test_user.id)})
    client.headers.update({"Authorization": f"Bearer {access_token}"})
    return client
```

## Deployment Architecture

### Docker Configuration

#### Dockerfile
```dockerfile
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Run migrations and start server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

#### Docker Compose (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  schedra-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://schedra:schedra123@postgres:5432/schedra
      - REDIS_URL=redis://redis:6379/0
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - SECRET_KEY=your-secret-key-here
    depends_on:
      - postgres
      - redis
    volumes:
      - ./uploads:/app/uploads

  schedra-worker:
    build: .
    command: celery -A app.workers worker --loglevel=info
    environment:
      - DATABASE_URL=postgresql+asyncpg://schedra:schedra123@postgres:5432/schedra
      - REDIS_URL=redis://redis:6379/0
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - SECRET_KEY=your-secret-key-here
    depends_on:
      - postgres
      - redis
    volumes:
      - ./uploads:/app/uploads

  schedra-scheduler:
    build: .
    command: celery -A app.workers beat --loglevel=info
    environment:
      - DATABASE_URL=postgresql+asyncpg://schedra:schedra123@postgres:5432/schedra
      - REDIS_URL=redis://redis:6379/0
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - SECRET_KEY=your-secret-key-here
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=schedra
      - POSTGRES_USER=schedra
      - POSTGRES_PASSWORD=schedra123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - schedra-api

volumes:
  postgres_data:
```

## Monitoring and Observability

### Health Checks (`app/api/v1/health.py`)
```python
from fastapi import APIRouter, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import redis
from celery import current_app

from app.core.database import get_db
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def basic_health_check():
    """Basic health check endpoint"""
    return {
        "status": "healthy",
        "service": "schedra-api",
        "version": settings.VERSION
    }


@router.get("/health/detailed")
async def detailed_health_check(db: AsyncSession = Depends(get_db)):
    """Detailed health check with dependency status"""
    health_status = {
        "status": "healthy",
        "service": "schedra-api", 
        "version": settings.VERSION,
        "checks": {}
    }
    
    # Database check
    try:
        await db.execute("SELECT 1")
        health_status["checks"]["database"] = "healthy"
    except Exception as e:
        health_status["checks"]["database"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"
    
    # Redis check
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        health_status["checks"]["redis"] = "healthy"
    except Exception as e:
        health_status["checks"]["redis"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"
    
    # Celery check
    try:
        celery_status = current_app.control.inspect().active()
        if celery_status:
            health_status["checks"]["celery"] = "healthy"
        else:
            health_status["checks"]["celery"] = "no active workers"
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["checks"]["celery"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"
    
    return health_status
```

---

This comprehensive architecture documentation provides everything needed to implement Schedra using FastAPI and PostgreSQL. The design emphasizes performance, scalability, security, and maintainability while supporting all the features outlined in the roadmap.